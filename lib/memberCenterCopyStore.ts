import { promises as fs } from "fs";
import path from "path";
import { atomicWriteJson, withFileLock } from "./jsonFileStore";
import { getPersistentDataRoot } from "./storagePaths";
import { memberCopyValidationError, normalizeMemberCopyOverrides, type MemberCopyOverrides } from "./memberCenterCopy";

export type MemberCenterCopyStore = { version: 1; revision: number; overrides: MemberCopyOverrides };
export class MemberCopyConflictError extends Error {}
export class MemberCopyValidationError extends Error {}

export function getMemberCenterCopyFile() {
  const root = getPersistentDataRoot();
  return path.join(root || path.join(process.cwd(), "data"), "member-center", "display-copy.json");
}

/** Reads never initialize, migrate or repair any persisted file. */
export async function readMemberCenterCopy(filePath = getMemberCenterCopyFile()): Promise<MemberCenterCopyStore> {
  try {
    const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
    return { version: 1, revision: Number.isSafeInteger(raw?.revision) && raw.revision >= 0 ? raw.revision : 0, overrides: normalizeMemberCopyOverrides(raw?.overrides) };
  } catch {
    return { version: 1, revision: 0, overrides: {} };
  }
}

export async function saveMemberCenterCopy(input: { expectedRevision: number; overrides: unknown; filePath?: string }): Promise<MemberCenterCopyStore> {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new MemberCopyValidationError("設定版本不正確，請重新載入。" );
  if (!input.overrides || typeof input.overrides !== "object" || Array.isArray(input.overrides)) throw new MemberCopyValidationError("顯示文字格式不正確。" );
  for (const [key, value] of Object.entries(input.overrides)) {
    const error = memberCopyValidationError(key, value);
    if (error) throw new MemberCopyValidationError(error);
  }
  const filePath = input.filePath ?? getMemberCenterCopyFile();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  return withFileLock(filePath, async () => {
    const current = await readMemberCenterCopy(filePath);
    if (current.revision !== input.expectedRevision) throw new MemberCopyConflictError("顯示文字已由另一個視窗更新，請重新載入後再儲存。" );
    const updated: MemberCenterCopyStore = { version: 1, revision: current.revision + 1, overrides: normalizeMemberCopyOverrides(input.overrides) };
    await atomicWriteJson(filePath, updated);
    return updated;
  });
}
