import "server-only";

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
      publicStates: { worksList: isProductListedInWorks(selected) ? "YES" : "NO" },
    });
    if (!projected.ok) return worksArtworkOwnerReadFailure("OWNER_READ_MODEL_FAILED");
    return { ok: true, data: projected.value };
  } catch {
    // Includes filesystem/configuration errors and unexpected internal failures.
    // Never serialize/log raw exceptions, source JSON, credentials or paths.
    return worksArtworkOwnerReadFailure("INTERNAL_ERROR");
  }
}
