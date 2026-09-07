import fs from "node:fs";

const center = fs.readFileSync("components/member/MemberReferralCenter.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const checks = [
  ["team explorer has premium context card", center.includes("member-team-current-card")],
  ["team explorer keeps breadcrumb navigation", center.includes("member-team-breadcrumb") && center.includes("setTeamPath")],
  ["team member identity remains member number only", center.includes("會員 {node.memberNumber}") && !center.includes("node.safeDisplayName")],
  ["team cards preserve direct referral count", center.includes("node.directReferralCount")],
  ["team cards preserve descendant team count", center.includes("node.teamCount")],
  ["team generation remains root-relative", center.includes("你的第 {node.level} 代")],
  ["reward filter buttons show counts", center.includes("releasedRewards.length") && center.includes("pendingRewards.length")],
  ["reward ledger has structured order information", center.includes("member-reward-order-info")],
  ["reward ledger preserves source member number", center.includes("reward.sourceMemberNumber")],
  ["reward ledger preserves consumption", center.includes("itemText")],
  ["reward ledger preserves engine PV and rate", center.includes("reward.effectivePV") && center.includes("reward.rewardRate")],
  ["reward ledger preserves engine amount", center.includes("money(reward.creditAmount)")],
  ["pagination remains present", center.includes("member-reward-pagination") && center.includes("上一頁") && center.includes("下一頁")],
  ["premium team visual CSS exists", css.includes("Phase J.3C.4A") && css.includes(".member-team-current-card")],
  ["premium reward card CSS exists", css.includes(".member-reward-ledger-body") && css.includes(".member-reward-order-info")],
  ["mobile responsive visual rules exist", css.includes("@media (max-width:720px)") && css.includes(".member-team-node-counts")],
  ["no order API introduced", !center.includes("/api/orders") && !center.includes("adminOrders")],
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
console.log(`PHASE J.3C.4A Premium referral visual UX assertions: ${pass} PASS`);
