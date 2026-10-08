import { promises as fs } from "fs";
import path from "path";
import { atomicWriteJson, withFileLock } from "./jsonFileStore";
import { getMembershipRulesFile } from "./storagePaths";
import { getActiveMembershipRules, readMembershipRulesStore, validateMembershipRulesStore, MembershipRulesValidationError, MembershipRulesVersionConflictError, type MembershipRulesStore } from "./membershipBusinessRules";
import { resolvePointDisplayName } from "./pointDisplayName";

export async function readPointDisplayName(filePath = getMembershipRulesFile()) {
  return resolvePointDisplayName((await getActiveMembershipRules(new Date(), filePath)).rules);
}
export async function readPointDisplayNameSetting(filePath = getMembershipRulesFile()) {
  const store = await readMembershipRulesStore(filePath);
  return { revision: store.revision, pointDisplayName: resolvePointDisplayName(store.versions.at(-1)!.rules) };
}
/** One locked, revision-checked write to the authoritative file. No copy-file write. */
export async function savePointDisplayName(input: { expectedRevision: number; pointDisplayName: unknown; now?: Date }, filePath = getMembershipRulesFile()) {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new MembershipRulesValidationError("設定版本不正確，請重新載入。");
  const name = input.pointDisplayName;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 24) throw new MembershipRulesValidationError("點數顯示名稱需為 1～24 個字元");
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  return withFileLock(filePath, async () => {
    let raw: MembershipRulesStore;
    try { raw = JSON.parse(await fs.readFile(filePath, "utf8")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      raw = await readMembershipRulesStore(filePath);
    }
    const current = validateMembershipRulesStore(raw);
    if (current.revision !== input.expectedRevision) throw new MembershipRulesVersionConflictError();
    const latest = current.versions.at(-1)!;
    // A label edit must never activate unrelated, scheduled business rules early.
    if (Date.parse(latest.effectiveAt) > now.getTime()) throw new MembershipRulesValidationError("有尚未生效的制度版本，請由會員制度設定管理點數名稱。");
    const rules = structuredClone(raw.versions.at(-1)!.rules);
    rules.referral = { ...rules.referral, pointDisplayName: name.trim() };
    const rulesVersion = current.activeRulesVersion + 1;
    const updated = { ...raw, revision: current.revision + 1, activeRulesVersion: rulesVersion, updatedAt: timestamp,
      versions: [...raw.versions, { rulesVersion, effectiveAt: timestamp, createdAt: timestamp, createdBy: "owner" as const, rules }] };
    // Validate without materializing defaults or rewriting any existing snapshot.
    validateMembershipRulesStore(updated);
    await atomicWriteJson(filePath, updated);
    return { revision: updated.revision, pointDisplayName: name.trim() };
  });
}
