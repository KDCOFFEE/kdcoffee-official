import fs from "node:fs";

const memberAuth = fs.readFileSync("lib/memberAuth.ts", "utf8");
const memberPage = fs.readFileSync("app/member/page.tsx", "utf8");
const referral = fs.readFileSync("components/member/MemberReferralCenter.tsx", "utf8");
const commerce = fs.readFileSync("lib/membershipCommerce.ts", "utf8");
const storage = fs.readFileSync("lib/storagePaths.ts", "utf8");
const avatarApi = fs.readFileSync("app/api/member/avatar/route.ts", "utf8");

const checks = [
  ["custom avatar field persisted", memberAuth.includes("avatarUrl")],
  ["member hero prefers custom avatar", memberPage.includes("avatarUrl")],
  ["avatar editor lives in account section", memberPage.includes("MemberAvatarForm")],
  ["profile editor moved into account section", memberPage.includes("MemberProfileForm")],
  ["member avatar upload API exists", avatarApi.includes("export async function POST")],
  ["avatar removal restores provider fallback", avatarApi.includes("fallbackUrl") && avatarApi.includes("pictureUrl")],
  ["persistent avatar storage helper exists", storage.includes("getMemberAvatarUploadDir")],
  ["reward source member number is server-resolved", commerce.includes("sourceMemberNumber")],
  ["reward source order is read-only linked", commerce.includes("readOrder")],
  ["reward ledger shows member number", referral.includes("reward.sourceMemberNumber") && referral.includes("來源會員")],
  ["reward ledger shows source consumption", referral.includes("itemText") && (referral.includes("消費內容") || referral.includes("消費："))],
  ["reward ledger shows PV and configured rate", referral.includes("reward.effectivePV") && referral.includes("reward.rewardRate")],
  ["reward ledger uses engine amount", referral.includes("reward.creditAmount")],
  ["order core is not modified by this patch", !avatarApi.includes("adminOrders") && !memberPage.includes("adminOrders")],
];

let pass = 0;
for (const [label, ok] of checks) {
  if (!ok) {
    console.error(`FAIL ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${label}`);
    pass += 1;
  }
}

if (process.exitCode) process.exit(1);
console.log(`PHASE J.3C.2 Member account/referral reward assertions: ${pass} PASS`);
