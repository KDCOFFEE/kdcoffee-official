import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";

export type CommerceLock = { rank: 0 | 1 | 2 | 3 | 4 | 5; key: string };
type Held = CommerceLock & { path: string; active: boolean };
type Scope = { held: Held[]; plan?: Set<string>; sealed?: boolean };
const context = new AsyncLocalStorage<Scope>();
export class CommerceLockOrderError extends Error {
  constructor(message: string) { super(message); this.name = "CommerceLockOrderError"; }
}
export function commerceLockPath(file: string) {
  const resolved = path.resolve(file);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
export function compareCommerceLocks(a: CommerceLock, b: CommerceLock) {
  return a.rank - b.rank || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}
export function inferCommerceLock(file: string): CommerceLock | undefined {
  const target = commerceLockPath(file).replaceAll("\\", "/");
  if (target.includes("/.idempotency/") || target.endsWith("/.subscription-order-scheduler")) return { rank: 0, key: target };
  if (target.endsWith("/website-data.json")) return { rank: 2, key: "0000:coffee:" + target };
  if (target.endsWith("/store-domain/catalog.json")) return { rank: 2, key: "0010:store:" + target };
  if (/\/kd[0-9-]+\.json$/i.test(target)) return { rank: 3, key: path.basename(target) };
  if (target.endsWith("/fulfillment/state.json")) return { rank: 4, key: target };
  if (target.endsWith("/membership-commerce/commerce-state.json")) return { rank: 5, key: target };
}
export function isCommerceLockHeld(file: string) {
  const target = commerceLockPath(file);
  return context.getStore()?.held.some(lock => lock.active && lock.path === target) ?? false;
}
export function assertCommerceLockHeld(file: string) {
  if (!isCommerceLockHeld(file)) throw new CommerceLockOrderError("Required commerce lock is not held");
}
export async function inCommerceLock<T>(file: string, descriptor: CommerceLock | undefined, operation: () => Promise<T>): Promise<T> {
  const parent = context.getStore() ?? { held: [] };
  const target = commerceLockPath(file);
  if (parent.sealed || (parent.plan && !parent.plan.has(target))) throw new CommerceLockOrderError("Unplanned lock acquisition");
  if (parent.held.some(lock => !lock.active)) throw new CommerceLockOrderError("Expired lock context");
  if (parent.held.some(lock => lock.path === target)) throw new CommerceLockOrderError("Reentrant lock acquisition");
  if (!descriptor) {
    if (parent.plan) throw new CommerceLockOrderError("Unclassified lock in canonical plan");
    return operation();
  }
  if (!Number.isInteger(descriptor.rank) || descriptor.rank < 0 || descriptor.rank > 5 || !descriptor.key) throw new CommerceLockOrderError("Invalid lock descriptor");
  const last = parent.held.at(-1);
  if (last && compareCommerceLocks(last, descriptor) >= 0) throw new CommerceLockOrderError("Reverse or duplicate commerce lock order");
  const held: Held = { ...descriptor, path: target, active: true };
  try { return await context.run({ ...parent, held: [...parent.held, held] }, operation); }
  finally { held.active = false; }
}
export function inCommerceLockPlan<T>(files: string[], operation: () => Promise<T>) {
  if (context.getStore()?.held.length) throw new CommerceLockOrderError("Plan must be defined before locks are acquired");
  return context.run({ held: [], plan: new Set(files.map(commerceLockPath)) }, operation);
}
export function sealCommerceLockPlan<T>(operation: () => Promise<T>) {
  const scope = context.getStore();
  if (!scope?.plan || scope.held.length !== scope.plan.size) throw new CommerceLockOrderError("Incomplete lock plan");
  return context.run({ ...scope, sealed: true }, operation);
}
