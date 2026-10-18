import "server-only";
import { resolveMemberByIdentity } from "./memberIdentity";
import { readMember } from "./memberAuth";
// Verified webhook identity in; only a boolean leaves. No mapping writes or profile logging.
export async function isLinkedSupportMember(lineUserId:string) {
  if(!/^U[a-fA-F0-9]{32}$/.test(lineUserId))return false;
  try {
    const record=await resolveMemberByIdentity("line",lineUserId);
    if(record?.status!=="active")return false;
    const profile=await readMember(record.memberId);
    return profile?.id===record.memberId;
  } catch { return false; }
}
