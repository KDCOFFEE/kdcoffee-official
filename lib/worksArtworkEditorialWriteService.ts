import "server-only";

import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { getWebsiteDataFile } from "./storagePaths";
import { atomicWriteJson, withFileLock } from "./jsonFileStore";
import { worksRecord, worksReference } from "./worksArtworkContract";
import { validateWorksCommand, validateWorksState } from "./worksArtworkValidation";
import { WORKS_FIRST_EDIT_FIELDS, isWorksFirstEditField, isWorksEditorialText } from "./worksArtworkResolver";
import { modelWorksWrite } from "./worksArtworkWriteModel";
import { resolveWorksProductPageContent } from "./productPageContent";
import { getWorksArtworkWritePreparation, projectCurrentWorksArtworkOwner } from "./worksArtworkOwnerReadService";
import type { WorksArtworkOwnerProjection } from "./worksArtworkReadModel";

const messages = {
  INVALID_REFERENCE: "作品參照格式不正確。",
  ARTWORK_NOT_FOUND: "找不到這件作品。",
  INVALID_WRITE_REQUEST: "儲存請求格式不正確。",
  FIELD_NOT_WRITABLE: "此欄位或操作尚未開放。",
  VALIDATION_FAILED: "作品內容未通過驗證。",
  REVISION_CONFLICT: "這件作品已在其他地方更新，請重新載入後再確認。",
  PERSISTENCE_FAILED: "儲存暫時無法完成，請重新讀取確認目前內容。",
  INTERNAL_ERROR: "作品來源或儲存狀態需要確認。",
} as const;
type ErrorCode = keyof typeof messages;
export type WorksEditorialWriteResult =
  | { readonly ok: true; readonly outcome: "SAVED" | "NO_CHANGE"; readonly requestId: string;
      readonly worksRevision: number; readonly editToken: string; readonly changedFields: readonly string[];
      readonly ownerModel: WorksArtworkOwnerProjection }
  | { readonly ok: false; readonly error: { readonly code: ErrorCode; readonly message: string;
      readonly commitState: "NOT_COMMITTED" | "COMMITTED" } };
const failure = (code: ErrorCode, committed = false): WorksEditorialWriteResult =>
  ({ ok: false, error: { code, message: messages[code], commitState: committed ? "COMMITTED" : "NOT_COMMITTED" } });

/** Validate ALL connected fields, including states not targeted by this command.
 * The public resolver rejects unsupported inherit/malformed text before we accept
 * an Owner DTO. Projection.ok alone deliberately is NOT the acceptance gate.
 */
function finalEditorialReadBack(product: Record<string, unknown>, catalog: readonly Record<string, unknown>[]): WorksArtworkOwnerProjection | null {
  try {
    const content = resolveWorksProductPageContent(product);
    const expected = {
      "hero.supportingCopy": content["product-hero"].lead,
      "story.body": content["product-hero"].storyLead,
      "flavor.narrative": content["flavor-notes"].description,
    };
    const projected = projectCurrentWorksArtworkOwner(product, catalog);
    if (!projected.ok) return null;
    const ids = { "hero.supportingCopy": "content.hero", "story.body": "content.story", "flavor.narrative": "content.flavor" } as const;
    const stored = Object.prototype.hasOwnProperty.call(product, "worksPage") ? validateWorksState(product.worksPage) : null;
    if (stored && !stored.ok) return null;
    for (const key of WORKS_FIRST_EDIT_FIELDS) {
      const state = stored?.ok ? stored.value.fields[key] : undefined;
      if (state !== undefined && (state.mode !== "value" || !isWorksEditorialText(state.value))) return null;
      const field = projected.value.fields.find(f => f.id === ids[key]);
      if (!field || field.state === "invalid" || field.value !== expected[key]) return null;
      if (state !== undefined && field.source.connected !== true) return null;
    }
    return projected.value;
  } catch {
    return null;
  }
}

/** TRUSTED OWNER CALLER ONLY. No HTTP transport is exposed.
 * Future transport MUST perform signed Admin authentication, Owner authorization,
 * and same-origin validation BEFORE invoking this service. No caller path/loader
 * or auth boolean is accepted. Tests use the existing KD_DATA_DIR root contract.
 * requestId is correlation only; old retries conflict, not persistent dedupe.
 */
export async function writeWorksArtworkEditorialCommand(reference: unknown, raw: unknown): Promise<WorksEditorialWriteResult> {
  if (!worksReference(reference)) return failure("INVALID_REFERENCE");
  const checked = validateWorksCommand(raw);
  if (!checked.ok) {
    const codes = checked.errors.map(e => e.code);
    if (codes.some(c => /FIELD|SCOPE|OWNER|AMBIGUOUS/.test(c))) return failure("FIELD_NOT_WRITABLE");
    return failure(codes.some(c => /VALUE|TEXT|EMPTY|LENGTH/.test(c)) ? "VALIDATION_FAILED" : "INVALID_WRITE_REQUEST");
  }
  const command = checked.value;
  if (command.targetRef !== reference) return failure("INVALID_REFERENCE");
  for (const operation of command.operations) {
    if (!isWorksFirstEditField(operation.field) || operation.scope !== "updateEditorialContent" ||
      operation.state.mode !== "value") return failure("FIELD_NOT_WRITABLE");
    if (!isWorksEditorialText(operation.state.value)) return failure("VALIDATION_FAILED");
  }
  let committed = false;
  try {
    const file = getWebsiteDataFile();
    return await withFileLock(file, async (): Promise<WorksEditorialWriteResult> => {
      // NEVER read outside this whole-file lock or substitute default/seed JSON.
      const text = await readFile(file, "utf8");
      if (Buffer.byteLength(text, "utf8") > 8 * 1024 * 1024) return failure("INTERNAL_ERROR");
      let source: unknown;
      try { source = JSON.parse(text); } catch { return failure("INTERNAL_ERROR"); }
      if (!worksRecord(source) || !worksRecord(source.menu) || !Array.isArray(source.menu.products) ||
        source.menu.products.length > 1000) return failure("INTERNAL_ERROR");
      const catalog: Record<string, unknown>[] = [];
      const seen = new Set<string>();
      let index = -1;
      for (const product of source.menu.products) {
        if (!worksRecord(product) || !worksReference(product.slug) || seen.has(product.slug)) return failure("INTERNAL_ERROR");
        seen.add(product.slug);
        if (product.slug === reference) index = catalog.length;
        catalog.push(product);
      }
      if (index < 0) return failure("ARTWORK_NOT_FOUND");
      const product = catalog[index];
      const ownState = Object.prototype.hasOwnProperty.call(product, "worksPage");
      const stored = ownState ? validateWorksState(product.worksPage) : null;
      if (stored && !stored.ok) return failure("INTERNAL_ERROR");
      const preparation = getWorksArtworkWritePreparation(product);
      if (command.expectedWorksRevision !== preparation.worksRevision || command.expectedEditToken !== preparation.editToken) return failure("REVISION_CONFLICT");
      const changedFields = command.operations.filter(op =>
        !stored?.ok || !isDeepStrictEqual(stored.value.fields[op.field], op.state)).map(op => op.field);
      if (!changedFields.length) {
        const currentModel = finalEditorialReadBack(product, catalog);
        if (!currentModel) return failure("VALIDATION_FAILED");
        return { ok: true, outcome: "NO_CHANGE", requestId: command.requestId, ...preparation,
          changedFields: [], ownerModel: currentModel };
      }
      const candidate = modelWorksWrite({
        targetRef: reference, currentEditToken: preparation.editToken,
        ...(ownState ? { currentState: product.worksPage } : {}),
      }, command);
      if (!candidate.ok) return failure("VALIDATION_FAILED");
      const next = JSON.parse(text) as Record<string, unknown> & { menu: { products: Record<string, unknown>[] } };
      const selected = next.menu.products[index];
      selected.worksPage = candidate.value.state;
      // Fail closed if any future change leaks beyond the one allowed namespace.
      const beforeOutside = { ...product }; delete beforeOutside.worksPage;
      const afterOutside = { ...selected }; delete afterOutside.worksPage;
      if (!isDeepStrictEqual(beforeOutside, afterOutside) ||
        catalog.some((p, i) => i !== index && !isDeepStrictEqual(p, next.menu.products[i]))) return failure("INTERNAL_ERROR");
      const after = finalEditorialReadBack(selected, next.menu.products);
      if (!after) return failure("VALIDATION_FAILED");
      // Match canonical writers' root version/updatedAt contract, only on change.
      if (!Number.isSafeInteger(source.version) || (source.version as number) < 0 ||
        source.version === Number.MAX_SAFE_INTEGER) return failure("INTERNAL_ERROR");
      next.version = (source.version as number) + 1;
      next.updatedAt = new Date().toISOString();
      const finalPreparation = getWorksArtworkWritePreparation(selected);
      const result: WorksEditorialWriteResult = {
        ok: true, outcome: "SAVED", requestId: command.requestId, ...finalPreparation,
        changedFields, ownerModel: after,
      };
      await atomicWriteJson(file, next);
      committed = true;
      return result;
    });
  } catch {
    // A lock-release failure AFTER rename is not evidence that a save failed.
    // Caller must reload after any persistence error; never blindly retry.
    return failure("PERSISTENCE_FAILED", committed);
  }
}
