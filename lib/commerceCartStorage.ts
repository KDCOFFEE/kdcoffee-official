import {
  MAX_CART_ITEMS, MIGRATION_REASONS, CommerceCartValidationError,
  assertCartFields, isCartRecord, cartSnapshot, cartPrice, cartQuantityLimit,
  validateUnifiedCartItem,
} from "./commerceCart";
import type { UnifiedCartItem, MigrationIssue, MigrationNotice } from "./commerceCart";

export const CURRENT_CART_STORAGE_KEY = "kdcoffee-cart-v16";
export const LEGACY_CART_STORAGE_KEYS = [
  "kdcoffee-cart-v15", "kdcoffee-cart-v13", "kdcoffee-cart-v3", "kdcoffee-cart-v2", "kdcoffee-cart-v1",
] as const;
export type LegacyCartStorageKey = (typeof LEGACY_CART_STORAGE_KEYS)[number];
export type CartStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
export type CartEnvelope = {
  version: 16;
  items: UnifiedCartItem[];
  migration: {
    completed: boolean;
    sourceKey?: LegacyCartStorageKey;
    unresolved: MigrationIssue[];
    notices: MigrationNotice[];
  };
};
export type CartStorageRead =
  | { kind: "current"; envelope: CartEnvelope }
  | { kind: "legacy"; sourceKey: LegacyCartStorageKey; items: unknown[] }
  | { kind: "empty" }
  | { kind: "invalid"; key: string; reason: "MALFORMED_JSON" | "INVALID_ENVELOPE" | "UNSUPPORTED_VERSION" | "INVALID_LEGACY_DATA" | "STORAGE_UNAVAILABLE" };

export function isLegacyCartStorageKey(value: unknown): value is LegacyCartStorageKey {
  return typeof value === "string" && (LEGACY_CART_STORAGE_KEYS as readonly string[]).includes(value);
}
function invalid(): never { throw new CommerceCartValidationError("Invalid cart envelope"); }
function sourceIndex(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value >= MAX_CART_ITEMS) return invalid();
  return value;
}
function requestedQuantity(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) return invalid();
  return value;
}
export function validateMigrationIssue(value: unknown): MigrationIssue {
  if (!isCartRecord(value)) return invalid();
  assertCartFields(value, ["sourceIndex", "reason", "slug", "name", "optionLabel",
    "requestedQuantity", "totalRequestedQuantity", "quantityLimit"]);
  if (!(MIGRATION_REASONS as readonly unknown[]).includes(value.reason)) return invalid();
  return {
    sourceIndex: sourceIndex(value.sourceIndex), reason: value.reason as MigrationIssue["reason"],
    ...(value.slug !== undefined ? { slug: cartSnapshot(value.slug, "issue slug", 160) } : {}),
    ...(value.name !== undefined ? { name: cartSnapshot(value.name, "issue name") } : {}),
    ...(value.optionLabel !== undefined ? { optionLabel: cartSnapshot(value.optionLabel, "issue option") } : {}),
    ...(value.requestedQuantity !== undefined ? { requestedQuantity: requestedQuantity(value.requestedQuantity) } : {}),
    ...(value.totalRequestedQuantity !== undefined ? { totalRequestedQuantity: requestedQuantity(value.totalRequestedQuantity) } : {}),
    ...(value.quantityLimit !== undefined ? { quantityLimit: cartQuantityLimit(value.quantityLimit) } : {}),
  };
}
export function validateMigrationNotice(value: unknown): MigrationNotice {
  if (!isCartRecord(value)) return invalid();
  assertCartFields(value, ["sourceIndex", "reason", "previousUnitPrice", "currentUnitPrice"]);
  if (value.reason !== "PRICE_CHANGED") return invalid();
  return { sourceIndex: sourceIndex(value.sourceIndex), reason: "PRICE_CHANGED",
    previousUnitPrice: cartPrice(value.previousUnitPrice), currentUnitPrice: cartPrice(value.currentUnitPrice) };
}
export function validateCartEnvelope(value: unknown): CartEnvelope {
  if (!isCartRecord(value)) return invalid();
  assertCartFields(value, ["version", "items", "migration"]);
  if (value.version !== 16 || !Array.isArray(value.items) || value.items.length > MAX_CART_ITEMS
    || !isCartRecord(value.migration)) return invalid();
  const migration = value.migration;
  assertCartFields(migration, ["completed", "sourceKey", "unresolved", "notices"]);
  if (typeof migration.completed !== "boolean"
    || !Array.isArray(migration.unresolved) || migration.unresolved.length > MAX_CART_ITEMS
    || !Array.isArray(migration.notices) || migration.notices.length > MAX_CART_ITEMS
    || (migration.sourceKey !== undefined && !isLegacyCartStorageKey(migration.sourceKey))) return invalid();
  if (!migration.completed && (migration.sourceKey !== undefined || migration.unresolved.length || migration.notices.length)) return invalid();
  return {
    version: 16, items: value.items.map(validateUnifiedCartItem),
    migration: {
      completed: migration.completed,
      ...(migration.sourceKey !== undefined ? { sourceKey: migration.sourceKey as LegacyCartStorageKey } : {}),
      unresolved: migration.unresolved.map(validateMigrationIssue),
      notices: migration.notices.map(validateMigrationNotice),
    },
  };
}
/** Read only. An existing invalid/future key fails closed without erasing or guessing. */
export function readCartStorage(storage: Pick<CartStorage, "getItem">): CartStorageRead {
  for (const key of [CURRENT_CART_STORAGE_KEY, ...LEGACY_CART_STORAGE_KEYS]) {
    let text: string | null;
    try { text = storage.getItem(key); } catch { return { kind: "invalid", key, reason: "STORAGE_UNAVAILABLE" }; }
    if (text === null) continue;
    let value: unknown;
    try { value = JSON.parse(text) as unknown; } catch { return { kind: "invalid", key, reason: "MALFORMED_JSON" }; }
    if (key === CURRENT_CART_STORAGE_KEY) {
      if (isCartRecord(value) && value.version !== 16) return { kind: "invalid", key, reason: "UNSUPPORTED_VERSION" };
      try { return { kind: "current", envelope: validateCartEnvelope(value) }; }
      catch { return { kind: "invalid", key, reason: "INVALID_ENVELOPE" }; }
    }
    if (!Array.isArray(value) || value.length > MAX_CART_ITEMS) return { kind: "invalid", key, reason: "INVALID_LEGACY_DATA" };
    return { kind: "legacy", sourceKey: key as LegacyCartStorageKey, items: value };
  }
  return { kind: "empty" };
}
export type CartStorageWrite =
  | { ok: true; legacyRemoved: boolean }
  | { ok: false; reason: "INVALID_ENVELOPE" | "WRITE_FAILED" | "VERIFICATION_FAILED" };
/** Delete only the selected source, and only after verified completed migration.
 * Other legacy keys remain untouched. No live/browser wiring or cross-tab behavior.
 */
export function writeCartEnvelope(storage: CartStorage, input: unknown): CartStorageWrite {
  let envelope: CartEnvelope;
  try { envelope = validateCartEnvelope(input); } catch { return { ok: false, reason: "INVALID_ENVELOPE" }; }
  const encoded = JSON.stringify(envelope);
  try { storage.setItem(CURRENT_CART_STORAGE_KEY, encoded); }
  catch { return { ok: false, reason: "WRITE_FAILED" }; }
  try {
    const written = storage.getItem(CURRENT_CART_STORAGE_KEY);
    if (written === null || JSON.stringify(validateCartEnvelope(JSON.parse(written) as unknown)) !== encoded) {
      return { ok: false, reason: "VERIFICATION_FAILED" };
    }
  } catch { return { ok: false, reason: "VERIFICATION_FAILED" }; }
  const source = envelope.migration.completed ? envelope.migration.sourceKey : undefined;
  if (!source) return { ok: true, legacyRemoved: false };
  try { storage.removeItem(source); return { ok: true, legacyRemoved: true }; }
  catch { return { ok: true, legacyRemoved: false }; } // Verified v16 still prevents repeat migration.
}
