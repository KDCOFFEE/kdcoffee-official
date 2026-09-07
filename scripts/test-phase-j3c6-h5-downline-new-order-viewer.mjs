import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const org = read("components/member/MemberReferralOrgChart.tsx");
const commerce = read("lib/membershipCommerce.ts");
const css = read("app/globals.css");
const checks = [
  ["node payload exposes recent order details", /recentOrders: ReferralOrgOrderDetail\[\]/.test(org)],
  ["new order count becomes explicit order trigger", /member-org-order-trigger/.test(org) && /新訂單 \{node\.recentOrderCount\}/.test(org)],
  ["order viewer opens from selected downline", /setOrderNode/.test(org) && /MemberOrgOrderViewer/.test(org)],
  ["viewer shows source member number", /來源會員/.test(org) && /node\.memberNumber/.test(org)],
  ["viewer shows safe order items", /消費內容/.test(org) && /sourceItems\.map/.test(org)],
  ["viewer shows PV and configured rate", /effectivePV/.test(org) && /rewardRate/.test(org) && /PV ×/.test(org)],
  ["viewer shows reward amount without recalculation", /projectedCreditAmount/.test(org) && /creditAmount/.test(org)],
  ["backend reuses canonical readOrder", /orgOrders\.get/.test(commerce) && /safeOrgOrderItems/.test(commerce)],
  ["backend keeps recent window at 30 days", /recentOrderCutoff/.test(commerce)],
  ["backend binds reward only to current beneficiary", /reward\.beneficiaryMemberId === memberId/.test(commerce)],
  ["no private contact fields exposed in viewer", !/(shippingAddress|phone|email|recipientName)/.test(org)],
  ["desktop order drawer CSS exists", /\.member-org-order-panel/.test(css)],
  ["mobile order sheet CSS exists", /@media \(max-width: 760px\)[\s\S]*\.member-org-order-panel/.test(css)],
];
let pass = 0;
for (const [name, ok] of checks) {
  if (!ok) { console.error(`FAIL ${name}`); process.exitCode = 1; }
  else { console.log(`PASS ${name}`); pass += 1; }
}
if (pass === checks.length) console.log(`PHASE J.3C.6 H5 Downline new-order viewer assertions: ${pass} PASS`);
