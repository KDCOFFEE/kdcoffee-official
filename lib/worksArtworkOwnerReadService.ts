import "server-only";
import { createHash } from "crypto";
import { validateWorksState } from "./worksArtworkValidation";
import { WORKS_FIRST_EDIT_FIELDS } from "./worksArtworkResolver";
import { getWorksEditorialLegacyDependencies } from "./productPageContent";

import { readFile } from "node:fs/promises";
import { getWebsiteDataFile } from "./storagePaths";
import { worksRecord, worksReference } from "./worksArtworkContract";
import { isProductListedInWorks } from "./productListing";
import { projectWorksArtworkOwner } from "./worksArtworkOwnerProjection";
import type { WorksArtworkOwnerProjection } from "./worksArtworkReadModel";

const messages = Object.freeze({
  UNAUTHENTICATED: "請先登入後台。",
  FORBIDDEN: "此工作區限 Owner 使用。",
  INVALID_ARTWORK_REFERENCE: "作品參照格式不正確。",
  ARTWORK_NOT_FOUND: "找不到這件作品。",
  ARTWORK_SOURCE_INVALID: "作品來源資料需要確認。",
  OWNER_READ_MODEL_FAILED: "作品檢視資料無法安全產生。",
  INTERNAL_ERROR: "作品資料暫時無法讀取。",
});
export type WorksArtworkOwnerReadErrorCode = keyof typeof messages;
export type WorksArtworkOwnerReadFailure = {
  readonly ok: false;
  readonly error: { readonly code: WorksArtworkOwnerReadErrorCode; readonly message: string };
};
export type WorksArtworkOwnerReadResult =
  | { readonly ok: true; readonly data: WorksArtworkOwnerProjection }
  | WorksArtworkOwnerReadFailure;

export function worksArtworkOwnerReadFailure(code: WorksArtworkOwnerReadErrorCode): WorksArtworkOwnerReadFailure {
  return { ok: false, error: { code, message: messages[code] } };
}

/** Trusted server read; the Admin route authorizes BEFORE invoking this service.
 * Same live file/path contract as getLiveWebsiteData and the canonical coffee
 * reader, without importing static seed data, normalizers or write-capable stores.
 * Never accepts a caller-selected path, snapshot or injectable production loader. */
export async function readWorksArtworkOwnerModel(reference: unknown): Promise<WorksArtworkOwnerReadResult> {
  if (!worksReference(reference)) return worksArtworkOwnerReadFailure("INVALID_ARTWORK_REFERENCE");
  try {
    const text = await readFile(getWebsiteDataFile(), "utf8");
    if (Buffer.byteLength(text, "utf8") > 8 * 1024 * 1024) return worksArtworkOwnerReadFailure("ARTWORK_SOURCE_INVALID");
    let source: unknown;
    try { source = JSON.parse(text) as unknown; }
    catch { return worksArtworkOwnerReadFailure("ARTWORK_SOURCE_INVALID"); }
    if (!worksRecord(source) || !worksRecord(source.menu) || !Array.isArray(source.menu.products) || source.menu.products.length > 1000) {
      return worksArtworkOwnerReadFailure("ARTWORK_SOURCE_INVALID");
    }
    const catalog: Record<string, unknown>[] = [];
    const identifiers = new Set<string>();
    let selected: Record<string, unknown> | undefined;
    for (const product of source.menu.products) {
      if (!worksRecord(product) || !worksReference(product.slug) || identifiers.has(product.slug)) {
        return worksArtworkOwnerReadFailure("ARTWORK_SOURCE_INVALID");
      }
      identifiers.add(product.slug);
      catalog.push(product);
      if (product.slug === reference) selected = product;
    }
    if (!selected) return worksArtworkOwnerReadFailure("ARTWORK_NOT_FOUND");

    // Reuse the actual Works-list selector. Detail/purchase have no approved
    // read adapter here and remain UNKNOWN; publish.website is not a substitute.
    // Existing coffee pricing helpers require checkout/SKU demand or expose raw
    // commerce, not an approved Owner display summary. Do not calculate prices.
    const projected = projectWorksArtworkOwner({
      product: selected,
      catalog,
      editorialBinding: "CURRENT_PUBLIC",
      publicStates: { worksList: isProductListedInWorks(selected) ? "YES" : "NO" },
    });
    if (!projected.ok) return worksArtworkOwnerReadFailure("OWNER_READ_MODEL_FAILED");
    return { ok: true, data: { ...projected.value, writePreparation: getWorksArtworkWritePreparation(selected) } };
  } catch {
    // Includes filesystem/configuration errors and unexpected internal failures.
    // Never serialize/log raw exceptions, source JSON, credentials or paths.
    return worksArtworkOwnerReadFailure("INTERNAL_ERROR");
  }
}

/** Server-computed optimistic edit context. No persistence and no secrets.
 * Canonical encoding: JSON primitives, arrays in order, object keys sorted.
 * Presence tuples distinguish missing from explicit null/empty.
 * Frozen W3.4B dependencies: identity, first-three field presence/states,
 * normalized shortCopy/mood/subtitle, normalized flavor description, and the
 * whole-productPageContent VALIDITY BIT (not its unrelated content).
 * Works revision is a separate CAS guard; it is NOT hashed into this token.
 * No whole namespace, layout, future fields, media or Commerce participates.
 */
export function getWorksArtworkWritePreparation(product: Record<string, unknown>) {
  const own = (key: string) => Object.prototype.hasOwnProperty.call(product, key);
  let worksRevision = 0;
  let firstFields: Record<string, unknown> = {};
  if (own("worksPage")) {
    const checked = validateWorksState(product.worksPage);
    if (!checked.ok) throw new Error("Invalid Works state.");
    worksRevision = checked.value.revision;
    firstFields = checked.value.fields;
  }
  function canonical(value: unknown): string {
    if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
    if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (worksRecord(value)) return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
    throw new Error("Invalid edit context.");
  }
  const identity = ["id", "slug"].map(key => own(key) ? [key, true, product[key]] : [key, false]);
  const fields = WORKS_FIRST_EDIT_FIELDS.map(key =>
    Object.prototype.hasOwnProperty.call(firstFields, key) ? [key, true, firstFields[key]] : [key, false]);
  const dependencies = {
    // Bump the rule marker if the legacy fixed-story/fallback rules change.
    rules: "W3.4B-hero-story-flavor-v1",
    contractVersion: 1,
    identity,
    fields,
    legacy: getWorksEditorialLegacyDependencies(product),
  };
  return { worksRevision, editToken: "w3e1." + createHash("sha256").update(canonical(dependencies), "utf8").digest("hex") };
}

/** Shared current projection, called only with canonical server-side data. */
export function projectCurrentWorksArtworkOwner(product: Record<string, unknown>, catalog: readonly Record<string, unknown>[]) {
  const projected = projectWorksArtworkOwner({
    product, catalog, editorialBinding: "CURRENT_PUBLIC",
    publicStates: { worksList: isProductListedInWorks(product) ? "YES" : "NO" },
  });
  if (!projected.ok) return projected;
  return { ok: true as const, value: { ...projected.value, writePreparation: getWorksArtworkWritePreparation(product) } };
}
