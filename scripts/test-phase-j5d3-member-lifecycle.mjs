import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(file, "utf8");

const files = {
  identity: await read("lib/memberIdentity.ts"),
  auth: await read("lib/memberAuth.ts"),
  route: await read("app/api/admin/members/delete/route.ts"),
  panel: await read("components/admin/MemberDeletionPanel.tsx"),
  detail: await read("app/admin/members/[memberId]/page.tsx"),
  list: await read("app/admin/members/page.tsx"),
};

const lifecycleBranchStart = files.route.indexOf('if (action === "disable" || action === "reactivate")');
const fullResetBranchStart = files.route.indexOf("if (confirmation !== FULL_RESET_CONFIRMATION)");
const lifecycleBranch = files.route.slice(lifecycleBranchStart, fullResetBranchStart);
const fullResetBranch = files.route.slice(fullResetBranchStart);
const statusMutationStart = files.identity.indexOf("export async function setCanonicalMemberAccountStatus");
const statusMutationEnd = files.identity.indexOf("export async function resolveMemberByIdentity", statusMutationStart);
const statusMutation = files.identity.slice(statusMutationStart, statusMutationEnd);
const guardedStatusMatch = statusMutation.match(/if \(!\[(.*?)\]\.includes\(member\.status\)\)/);
const guardedStatuses = new Set(
  [...(guardedStatusMatch?.[1].matchAll(/"([^"]+)"/g) ?? [])].map((match) => match[1]),
);
const permitsLifecycleTransition = (current, next) =>
  guardedStatuses.has(current) && ["active", "disabled"].includes(next);
const changedApplicationSources = execFileSync(
  "git",
  ["diff", "--name-only", "--", "app", "components", "lib"],
  { encoding: "utf8" },
).split(/\r?\n/).filter(Boolean);
const protectedCorePattern = /(?:^|\/)(?:checkout|orders?|fulfillment)(?:\/|[^/]*\.(?:ts|tsx|js|jsx)$)/i;
const phaseJ5D4AOrderFiles = new Set([
  "app/admin/orders/[orderNumber]/page.tsx",
  "app/api/admin/orders/[orderNumber]/route.ts",
  "app/api/member/orders/[orderNumber]/cancel/route.ts",
  "components/admin/OrderStatusForm.tsx",
  "lib/orderCancellation.ts",
]);

const checks = [
  ["CanonicalMemberStatus includes disabled", /CanonicalMemberStatus\s*=\s*[^;]*"disabled"/.test(files.identity)],
  ["registry validator accepts disabled", files.identity.includes('["active", "disabled", "possible-duplicate", "merged-tombstone"]')],
  ["lock-safe status mutation exists", files.identity.includes("export async function setCanonicalMemberAccountStatus") && files.identity.includes("return withRegistryLock(async (filePath) =>")],
  ["transition guard precedes idempotent return", statusMutation.indexOf("![\"active\", \"disabled\"].includes(member.status)") >= 0 && statusMutation.indexOf("![\"active\", \"disabled\"].includes(member.status)") < statusMutation.indexOf("member.status === status")],
  ["active -> disabled is permitted", permitsLifecycleTransition("active", "disabled")],
  ["active -> active is idempotently permitted", permitsLifecycleTransition("active", "active")],
  ["disabled -> active is permitted", permitsLifecycleTransition("disabled", "active")],
  ["disabled -> disabled is idempotently permitted", permitsLifecycleTransition("disabled", "disabled")],
  ["possible-duplicate -> disabled is rejected", !permitsLifecycleTransition("possible-duplicate", "disabled")],
  ["possible-duplicate -> active is rejected", !permitsLifecycleTransition("possible-duplicate", "active")],
  ["merged-tombstone -> disabled is rejected", !permitsLifecycleTransition("merged-tombstone", "disabled")],
  ["merged-tombstone -> active is rejected", !permitsLifecycleTransition("merged-tombstone", "active")],
  ["disable audit action exists", files.identity.includes('"member-disabled"')],
  ["reactivate audit action exists", files.identity.includes('"member-reactivated"')],
  ["getCurrentMember blocks disabled", /getCurrentMember[\s\S]*?identityState\.member\?\.status === "disabled"\) return null/.test(files.auth)],
  ["Email authentication blocks disabled", /authenticateEmailMember[\s\S]*?identityState\.member\.status === "disabled"\)[\s\S]*?throw new MemberAccountDisabledError\(\)/.test(files.auth)],
  ["Email registration still checks existing identity", /registerEmailMember[\s\S]*?resolveMemberByIdentity\("email", email\)/.test(files.auth)],
  ["LINE mapped disabled member is blocked", /if \(mapped\)[\s\S]*?mapped\.status === "disabled"/.test(files.auth)],
  ["LINE disabled member cannot reach provisioning", files.auth.indexOf('mapped.status === "disabled"') < files.auth.indexOf("provisionCanonicalMember({", files.auth.indexOf("export async function loginLineMember")) && files.auth.indexOf('canonical.status === "disabled"') < files.auth.indexOf("provisionCanonicalMember({", files.auth.indexOf("export async function loginLineMember"))],
  ["disable route does not call purge functions", lifecycleBranchStart >= 0 && !lifecycleBranch.includes("purgeMembershipCommerceForMembers") && !lifecycleBranch.includes("purgeMemberFiles") && !lifecycleBranch.includes("purgeCanonicalMembers")],
  ["reactivate route does not call purge functions", lifecycleBranchStart >= 0 && !lifecycleBranch.includes("purgeMembershipCommerceForMembers") && !lifecycleBranch.includes("purgeMemberFiles") && !lifecycleBranch.includes("purgeCanonicalMembers")],
  ["full-reset requires explicit action", files.route.includes('["disable", "reactivate", "full-reset"]') && files.route.includes("!SINGLE_MEMBER_ACTIONS.includes(action")],
  ["full-reset requires exact confirmation text", files.route.includes('const FULL_RESET_CONFIRMATION = "完整重置會員身分"') && files.route.includes("confirmation !== FULL_RESET_CONFIRMATION")],
  ["full-reset uses purgeMembershipCommerceForMembers", fullResetBranch.includes("purgeMembershipCommerceForMembers(targets)")],
  ["full-reset uses purgeMemberFiles", fullResetBranch.includes("purgeMemberFiles(targets)")],
  ["full-reset uses purgeCanonicalMembers", fullResetBranch.includes("purgeCanonicalMembers(targets)")],
  ["UI says 停用會員", files.panel.includes("停用會員")],
  ["UI says 重新啟用會員", files.panel.includes("重新啟用會員")],
  ["UI says Owner 完整重置會員身分", files.panel.includes("Owner 完整重置會員身分")],
  ["UI contains exact destructive confirmation phrase", files.panel.includes("確認文字：完整重置會員身分")],
  ["admin member labels include 已停用", files.detail.includes('disabled: "已停用"') && files.list.includes('disabled: "已停用"')],
  ["no unrelated checkout/order/fulfillment application source modified", !changedApplicationSources.some((file) => { const normalized = file.replaceAll("\\", "/"); return protectedCorePattern.test(normalized) && !phaseJ5D4AOrderFiles.has(normalized); })],
];

let failed = 0;
for (const [label, pass] of checks) {
  console.log(`${pass ? "PASS" : "FAIL"} - ${label}`);
  if (!pass) failed += 1;
}

if (failed) {
  console.error(`FAILED: ${failed} assertion(s)`);
  process.exit(1);
}

console.log(`PASS: ${checks.length} J.5D.3 assertions`);
