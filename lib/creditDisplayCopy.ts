import "server-only";
import { readMemberCenterCopy } from "./memberCenterCopyStore";
import { resolveMemberCopy, type MemberCopyValues } from "./memberCenterCopy";
import { CREDIT_SYSTEM_MESSAGE_KEYS } from "./creditCopyCatalog";

export async function readCreditDisplayCopy() {
  const { overrides } = await readMemberCenterCopy();
  return (key: string, values: MemberCopyValues = {}) => resolveMemberCopy(overrides, key, values);
}

export async function creditSystemMessage(message: string) {
  const key = CREDIT_SYSTEM_MESSAGE_KEYS[message];
  return key ? (await readCreditDisplayCopy())(key) : message;
}
