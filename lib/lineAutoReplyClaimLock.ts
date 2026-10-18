import "server-only";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { atomicWriteJson, FileLockTimeoutError } from "./jsonFileStore";
import { getLineAutoReplyDir } from "./storagePaths";

// LINE-only mutex. SQLite owns an OS lock for the ENTIRE asynchronous operation.
// A crash releases that lock. Age alone can never evict an active transaction.
export const LINE_CLAIM_LOCK_STALE_MS = 5 * 60 * 1000;
const PROTOCOL = "line-claim-sqlite-v1";
type Database = { exec(sql: string): void; close(): void };
type Sqlite = { DatabaseSync: new (file: string) => Database };
type Owner = { protocol: typeof PROTOCOL; token: string; pid: number; hostname: string; acquiredAt: string };
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function code(error: unknown) { return (error as NodeJS.ErrnoException)?.code; }
function busy(error: unknown) {
  return code(error) === "ERR_SQLITE_ERROR" && [5, 6].includes((error as { errcode?: number }).errcode || 0);
}
function legacyOwnerDead(owner: Record<string, unknown>) {
  // Never guess about an owner on another host or a PID with uncertain liveness.
  if (owner.hostname !== os.hostname() || !Number.isSafeInteger(owner.pid) || Number(owner.pid) <= 0) return false;
  try { process.kill(Number(owner.pid), 0); return false; }
  catch (error) { return code(error) === "ESRCH"; }
}
async function recoverAbandonedOwner(lockPath: string) {
  let owner: Record<string, unknown>;
  try { owner = JSON.parse(await fs.readFile(lockPath, "utf8")); }
  catch (error) { if (code(error) === "ENOENT") return true; throw new Error("LINE claim lock metadata unavailable"); }
  if (!owner || typeof owner !== "object" || Array.isArray(owner) ||
      typeof owner.acquiredAt !== "string" || !Number.isFinite(Date.parse(owner.acquiredAt))) {
    throw new Error("LINE claim lock metadata invalid");
  }
  if (Date.now() - Date.parse(owner.acquiredAt) < LINE_CLAIM_LOCK_STALE_MS) return false;
  const currentProtocol = owner.protocol === PROTOCOL && typeof owner.token === "string" &&
    /^[a-f0-9-]{36}$/u.test(owner.token) && Number.isSafeInteger(owner.pid) &&
    Number(owner.pid) > 0 && typeof owner.hostname === "string";
  if (!currentProtocol && !legacyOwnerDead(owner)) return false;
  // We hold BEGIN IMMEDIATE: another compliant owner/recoverer cannot enter.
  // No rename/unlink race, PID namespace guess, lease expiry, or recovery files.
  await fs.unlink(lockPath);
  return true;
}
export async function withLineClaimLock<T>(
  operation: () => Promise<T>,
  options: { timeoutMs?: number; retryDelayMs?: number } = {},
): Promise<T> {
  const dir = getLineAutoReplyDir(), claimsPath = path.join(dir, "event-claims.json");
  const lockPath = claimsPath + ".lock";
  const timeoutMs = Math.min(5000, Math.max(0, options.timeoutMs ?? 5000));
  const retryMs = Math.min(100, Math.max(1, options.retryDelayMs ?? 50));
  await fs.mkdir(dir, { recursive: true });
  // Node >=22.13.0 (or >=23.4.0) is required; unsupported runtimes fail closed.
  // createRequire avoids changing shared Node-20 type declarations.
  const { DatabaseSync } = createRequire(path.join(process.cwd(), "package.json"))("node:sqlite") as Sqlite;
  const db = new DatabaseSync(path.join(dir, "event-claims-lock.sqlite"));
  const startedAt = Date.now();
  let transaction = false, owner: Owner | undefined;
  try {
    db.exec("PRAGMA busy_timeout=0");
    for (;;) {
      try { db.exec("BEGIN IMMEDIATE"); transaction = true; }
      catch (error) { if (!busy(error)) throw error; }
      if (transaction) {
        if (await recoverAbandonedOwner(lockPath)) {
          owner = { protocol: PROTOCOL, token: randomUUID(), pid: process.pid, hostname: os.hostname(), acquiredAt: new Date().toISOString() };
          await atomicWriteJson(lockPath, owner);
          return await operation();
        }
        db.exec("ROLLBACK"); transaction = false;
      }
      const elapsed = Date.now() - startedAt;
      if (elapsed >= timeoutMs) throw new FileLockTimeoutError(claimsPath, timeoutMs);
      await wait(Math.min(retryMs, timeoutMs - elapsed));
    }
  } finally {
    try {
      if (owner) {
        const current = JSON.parse(await fs.readFile(lockPath, "utf8"));
        if (current.token !== owner.token) throw new Error("LINE claim lock ownership changed");
        await fs.unlink(lockPath);
      }
    } finally {
      try { if (transaction) db.exec("ROLLBACK"); }
      finally { db.close(); }
    }
  }
}
