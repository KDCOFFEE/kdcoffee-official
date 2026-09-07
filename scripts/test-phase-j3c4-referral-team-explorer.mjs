import fs from "node:fs";

const commerce = fs.readFileSync("lib/membershipCommerce.ts", "utf8");
const center = fs.readFileSync("components/member/MemberReferralCenter.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const checks = [
  ["team nodes preserve parent relationship", commerce.includes("parentMemberNumber") && commerce.includes("parentMemberId")],
  ["team nodes expose direct referral count", commerce.includes("directReferralCount") && commerce.includes("directCountByMemberId")],
  ["team nodes expose descendant team count", commerce.includes("teamCount") && commerce.includes("descendantCount")],
  ["team explorer starts from generation one", center.includes("我的第一代") && center.includes("currentTeamLevel")],
  ["clicking member explores direct downline", center.includes("setTeamPath([...teamPath") && center.includes("查看下線")],
  ["generation remains relative to logged-in root", center.includes("你的第 {node.level} 代")],
  ["member rows show direct and team counts", center.includes("直推 <b>{node.directReferralCount}</b> 人") && center.includes("團隊 <b>{node.teamCount}</b> 人")],
  ["downline display uses member number rather than safe display name", center.includes("會員 {node.memberNumber}") && !center.includes("node.safeDisplayName")],
  ["reward history renders paged rewards", center.includes("rewardsPerPage = 10") && center.includes("pagedRewards.map")],
  ["reward history supports status filter", center.includes('rewardFilter') && center.includes('"pending"') && center.includes('"released"')],
  ["reward history supports generation filter", center.includes("rewardLevel") && center.includes("全部代數")],
  ["reward pagination controls exist", center.includes("上一頁") && center.includes("下一頁") && center.includes("rewardPageCount")],
  ["reward engine values remain source of truth", center.includes("reward.creditAmount") && center.includes("reward.effectivePV") && center.includes("reward.rewardRate")],
  ["responsive explorer and reward filter CSS exists", css.includes(".member-team-node") && css.includes(".member-reward-filters") && css.includes("@media (max-width:720px)")],
  ["no order/cart/checkout write implementation added to member component", !center.includes("adminOrders") && !center.includes("/api/orders")],
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
console.log(`PHASE J.3C.4 Referral team explorer/reward history assertions: ${pass} PASS`);
