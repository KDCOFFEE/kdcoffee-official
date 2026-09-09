import { NextResponse } from "next/server";

import { isAdminAuthenticated, verifyAdminPassword } from "@/lib/adminAuth";
import { listMembers, purgeMemberFiles } from "@/lib/memberAuth";
import {
  getIdentityRegistrySnapshot,
  purgeCanonicalMembers,
  setCanonicalMemberAccountStatus,
} from "@/lib/memberIdentity";
import { purgeMembershipCommerceForMembers } from "@/lib/membershipCommerce";

const FULL_RESET_CONFIRMATION = "完整重置會員身分";
const SINGLE_MEMBER_ACTIONS = ["disable", "reactivate", "full-reset"] as const;

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "管理員登入已失效" }, { status: 401 });
  try {
    const body = await request.json();
    const mode = body.mode === "all" ? "all" : "single";
    const action = String(body.action || "");
    const memberId = String(body.memberId || "");
    const password1 = String(body.password1 || "");
    const password2 = String(body.password2 || "");
    const confirmation = String(body.confirmation || "");

    if (mode === "all") {
      if (!password1 || !password2 || password1 !== password2) return NextResponse.json({ error: "兩次輸入的管理員密碼必須完全一致" }, { status: 400 });
      if (!verifyAdminPassword(password1)) return NextResponse.json({ error: "管理員密碼不正確" }, { status: 403 });
      if (confirmation !== "刪除全部會員") return NextResponse.json({ error: "請正確輸入「刪除全部會員」" }, { status: 400 });
      const [registry, memberFiles] = await Promise.all([
        getIdentityRegistrySnapshot(),
        listMembers(),
      ]);
      const targets = new Set<string>([
        ...Object.keys(registry.members),
        ...Object.keys(registry.legacyAliases),
        ...Object.values(registry.legacyAliases),
        ...memberFiles.map((member) => member.id),
      ]);

      // All-mode intentionally clears every membership/referral test-data record,
      // every physical member credential/profile file (including legacy/orphan files),
      // and the canonical identity registry. Order history is stored separately and is untouched.
      await purgeMembershipCommerceForMembers();
      const removedFiles = await purgeMemberFiles();
      await purgeCanonicalMembers();
      return NextResponse.json({ ok: true, removed: Math.max(targets.size, removedFiles) });
    }

    if (!SINGLE_MEMBER_ACTIONS.includes(action as typeof SINGLE_MEMBER_ACTIONS[number])) {
      return NextResponse.json({ error: "缺少或不支援的會員操作" }, { status: 400 });
    }
    if (!memberId) return NextResponse.json({ error: "缺少會員識別碼" }, { status: 400 });
    if (!password1) return NextResponse.json({ error: "請輸入管理員密碼" }, { status: 400 });
    if (action === "full-reset" && (!password2 || password1 !== password2)) {
      return NextResponse.json({ error: "兩次輸入的管理員密碼必須完全一致" }, { status: 400 });
    }
    if (!verifyAdminPassword(password1)) return NextResponse.json({ error: "管理員密碼不正確" }, { status: 403 });

    if (action === "disable" || action === "reactivate") {
      const registry = await getIdentityRegistrySnapshot();
      const canonicalId = registry.legacyAliases[memberId] || memberId;
      if (!registry.members[canonicalId]) return NextResponse.json({ error: "找不到這位會員" }, { status: 404 });
      const member = await setCanonicalMemberAccountStatus(
        memberId,
        action === "disable" ? "disabled" : "active",
      );
      return NextResponse.json({ ok: true, memberId: member.memberId, status: member.status });
    }

    if (confirmation !== FULL_RESET_CONFIRMATION) {
      return NextResponse.json({ error: `請正確輸入「${FULL_RESET_CONFIRMATION}」` }, { status: 400 });
    }

    const [registry, memberFiles] = await Promise.all([
      getIdentityRegistrySnapshot(),
      listMembers(),
    ]);

    const canonicalId = registry.legacyAliases[memberId] || memberId;
    const legacyIds = Object.entries(registry.legacyAliases)
      .filter(([, targetId]) => targetId === canonicalId)
      .map(([legacyId]) => legacyId);
    const physicalIds = new Set(memberFiles.map((member) => member.id));
    const exists = Boolean(registry.members[canonicalId]) || physicalIds.has(memberId) || physicalIds.has(canonicalId) || legacyIds.some((id) => physicalIds.has(id));

    if (!exists) return NextResponse.json({ error: "找不到這位會員" }, { status: 404 });

    const targets = [...new Set([memberId, canonicalId, ...legacyIds])];
    await purgeMembershipCommerceForMembers(targets);
    const removedFiles = await purgeMemberFiles(targets);
    await purgeCanonicalMembers(targets);
    return NextResponse.json({ ok: true, removed: Math.max(1, removedFiles) });
  } catch (error) {
    console.error("member lifecycle action failed", error);
    return NextResponse.json({ error: "會員操作失敗，請先停止操作並檢查伺服器紀錄" }, { status: 500 });
  }
}
