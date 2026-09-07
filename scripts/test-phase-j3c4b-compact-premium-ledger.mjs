import fs from "node:fs";

const css = fs.readFileSync("app/globals.css", "utf8");
const center = fs.readFileSync("components/member/MemberReferralCenter.tsx", "utf8");

const checks = [
  ["J.3C.4B compact visual layer exists", css.includes("Phase J.3C.4B — Compact Premium Ledger + Team Metric Polish")],
  ["team cards are compacted", css.includes(".member-team-node{") && css.includes("min-height:76px") && css.includes("padding:14px 18px")],
  ["team direct and team metrics remain visible", center.includes("直推 <b>{node.directReferralCount}</b> 人") && center.includes("團隊 <b>{node.teamCount}</b> 人")],
  ["view downline CTA remains conditional", center.includes("node.directReferralCount > 0") && center.includes("查看下線")],
  ["view downline CTA gets premium pill treatment", css.includes(".member-team-node-counts em:not(.is-empty)") && css.includes("border-radius:999px")],
  ["reward list density is reduced", css.includes(".member-reward-ledger-list{") && css.includes("gap:8px")],
  ["reward meta band is compact", css.includes(".member-reward-ledger-meta{") && css.includes("padding:7px 14px!important")],
  ["reward body is compact", css.includes(".member-reward-ledger-body{") && css.includes("padding:12px 14px 11px")],
  ["reward order information is compact two-column desktop", css.includes("grid-template-columns:170px minmax(0,1fr)")],
  ["reward calculation row is compact", css.includes(".member-reward-ledger-bottom{") && css.includes("margin-top:9px!important")],
  ["reward date remains rendered", center.includes("formatDate(reward.releasedAt || reward.sourceOrderCreatedAt)")],
  ["reward generation remains rendered", center.includes("reward.referralLevel")],
  ["source member remains rendered", center.includes("reward.sourceMemberNumber")],
  ["consumption remains rendered", center.includes("itemText") && center.includes("消費內容")],
  ["PV and configured rate remain rendered", center.includes("reward.effectivePV") && center.includes("reward.rewardRate.toLocaleString")],
  ["Reward Engine credited amount remains rendered", center.includes("money(reward.creditAmount)")],
  ["reward status remains rendered", center.includes("rewardStatusLabel(reward, qualificationLabel)")],
  ["pagination remains present", center.includes("member-reward-pagination") && center.includes("上一頁") && center.includes("下一頁")],
  ["mobile compact ledger rules exist", css.includes("@media (max-width:720px)") && css.includes(".member-reward-ledger-bottom>strong")],
  ["no production referral/order logic added", !center.includes("app/api/orders") && !center.includes("checkout") && !center.includes("cart")],
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
console.log(`PHASE J.3C.4B Compact Premium Ledger assertions: ${passed} PASS`);
