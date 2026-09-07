import fs from "node:fs";
const css = fs.readFileSync("app/globals.css", "utf8");
const center = fs.readFileSync("components/member/MemberReferralCenter.tsx", "utf8");

const checks = [
  ["J.3C.4C mobile polish layer exists", css.includes("Phase J.3C.4C — Mobile Member Referral Final Polish")],
  ["reward summary mobile is 2x2", css.includes("grid-template-columns:repeat(2,minmax(0,1fr))!important")],
  ["reward summary cards are mobile-comfortable", css.includes("min-height:96px") && css.includes("font-size:20px!important")],
  ["team node mobile hierarchy is compact", css.includes(".member-team-node>div:first-child") && css.includes("padding:13px!important")],
  ["team metrics are separate mobile cards", css.includes("background:#fcfaf7")],
  ["view downline CTA is full-width mobile", css.includes(".member-team-node-counts em:not(.is-empty)") && css.includes("grid-column:1/-1")],
  ["empty downline state remains understated", css.includes(".member-team-node-counts em.is-empty") && css.includes("background:transparent")],
  ["reward filters use three-way mobile segmented control", css.includes("grid-template-columns:repeat(3,minmax(0,1fr))!important")],
  ["generation selector has full-width mobile row", css.includes(".member-reward-filters select") && css.includes("width:100%!important")],
  ["ledger mobile meta band is reduced", css.includes("padding:6px 10px!important")],
  ["ledger mobile body is reduced", css.includes("padding:9px 10px 8px!important")],
  ["ledger mobile order information is reduced", css.includes("padding:6px 8px!important")],
  ["ledger mobile calculation row is reduced", css.includes("padding-top:6px!important")],
  ["reward date remains rendered", center.includes("formatDate(reward.releasedAt || reward.sourceOrderCreatedAt)")],
  ["reward generation remains rendered", center.includes("reward.referralLevel")],
  ["source member remains rendered", center.includes("reward.sourceMemberNumber")],
  ["consumption remains rendered", center.includes("itemText")],
  ["PV and rate remain rendered", center.includes("reward.effectivePV") && center.includes("reward.rewardRate.toLocaleString")],
  ["Reward Engine amount remains rendered", center.includes("money(reward.creditAmount)")],
  ["reward status remains rendered", center.includes("rewardStatusLabel(reward, qualificationLabel)")],
  ["team drill-down remains rendered", center.includes("node.directReferralCount > 0") && center.includes("查看下線")],
  ["no order/cart/checkout implementation introduced", !center.includes("app/api/orders") && !center.includes("checkout") && !center.includes("cart")],
];

let passed = 0;
for (const [label, ok] of checks) {
  if (!ok) {
    console.error(`FAIL ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${label}`);
    passed++;
  }
}
if (process.exitCode) process.exit(1);
console.log(`PHASE J.3C.4C Mobile member referral final polish assertions: ${passed} PASS`);
