import fs from "node:fs";

const commerce = fs.readFileSync("lib/membershipCommerce.ts", "utf8");
const center = fs.readFileSync("components/member/MemberReferralCenter.tsx", "utf8");
const chart = fs.readFileSync("components/member/MemberReferralOrgChart.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const checks = [
  ["referral center exposes organization chart button", center.includes("查看組織圖") && center.includes("setOrgChartOpen(true)")],
  ["organization chart modal is wired to existing referral center", center.includes("<MemberReferralOrgChart") && center.includes("data={data.orgChart}")],
  ["server payload includes independent organization chart view", commerce.includes("const orgChart =") && commerce.includes("orgDepth = 10")],
  ["reward depth remains separate from chart navigation depth", commerce.includes("referralMaxRewardDepth") && commerce.includes("Organization chart is a navigation view, not a reward-depth rule")],
  ["chart payload preserves member and parent ids for tree navigation", commerce.includes("memberId: node.memberId") && commerce.includes("parentMemberId: node.parentMemberId")],
  ["chart is limited to three displayed generations", chart.includes("depth={2}") && chart.includes("顯示 3 代內")],
  ["clickable downline can become new chart root", chart.includes("setHistory((current) => [...current, node.memberId])") && chart.includes("查看他的組織圖")],
  ["navigation supports back and return-to-root", chart.includes("返回上一層") && chart.includes("回到我的組織圖")],
  ["desktop and mobile chart use the same tree structure", chart.includes("member-org-tree") && css.includes(".member-org-tree") && css.includes("@media (max-width: 900px)")],
  ["chart supports pan and zoom", chart.includes("onPointerMove") && chart.includes("onWheel") && chart.includes("touch-action: none") === false],
  ["mobile touch gesture CSS exists", css.includes("touch-action: none") && css.includes("member-org-viewport")],
  ["new order metric uses read-only canonical order reads", commerce.includes("orgOrderPairs") && commerce.includes("await readOrder(orderNumber)") && commerce.includes("recentOrderCutoff")],
  ["pending reward metric remains Reward Engine sourced", commerce.includes('reward.status === "scheduled"') && commerce.includes("projectedCreditAmount")],
  ["current-period released metric remains Reward Engine sourced", commerce.includes('reward.status === "released"') && commerce.includes("currentPeriodKey")],
  ["org chart does not add order/cart/checkout write calls in member UI", !chart.includes("/api/orders") && !chart.includes("checkout") && !chart.includes("saveOrder")],
  ["privacy remains member-number based", chart.includes("會員 {node.memberNumber}") && !chart.includes("safeDisplayName")],
  ["premium chart CSS is present", css.includes("PHASE J.3C.6") && css.includes(".member-org-shell") && css.includes(".member-org-node-card")],
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
console.log(`PHASE J.3C.6 Referral organization chart assertions: ${pass} PASS`);
