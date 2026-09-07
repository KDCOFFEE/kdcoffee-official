import fs from "node:fs";
const referral = fs.readFileSync("components/member/MemberReferralCenter.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const checks = [
  ["four reward summary metrics exist", ["累計推薦回饋","已入帳","待入帳","本月回饋"].every((x) => referral.includes(x))],
  ["released total uses engine credit amount", referral.includes("sum + reward.creditAmount")],
  ["pending total uses engine projected amount", referral.includes("sum + reward.projectedCreditAmount")],
  ["cancelled and reversed rewards excluded from pending", referral.includes('["released", "cancelled", "reversed"].includes(reward.status)')],
  ["monthly total is based on releasedAt", referral.includes("reward.releasedAt") && referral.includes("currentTaipeiMonth")],
  ["source member number is explicit", referral.includes("來源會員") && referral.includes("reward.sourceMemberNumber")],
  ["source consumption remains visible", (referral.includes("消費內容") || referral.includes("消費：")) && referral.includes("itemText")],
  ["PV and configured reward rate remain visible", referral.includes("reward.effectivePV") && referral.includes("reward.rewardRate.toLocaleString")],
  ["displayed credited amount remains engine amount", referral.includes("reward.creditAmount")],
  ["released status wording is owner-approved", referral.includes('return "已入帳 ✓"')],
  ["ledger summary responsive CSS exists", css.includes(".member-reward-summary-grid") && css.includes("@media(max-width:560px)")],
  ["no order/cart/checkout implementation imported", !referral.includes("app/api/orders") && !referral.includes("checkout") && !referral.includes("cart")],
];

let pass = 0;
for (const [label, ok] of checks) {
  if (!ok) {
    console.error(`FAIL ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${label}`);
    pass++;
  }
}
if (process.exitCode) process.exit(1);
console.log(`PHASE J.3C.3 Member referral reward ledger UX assertions: ${pass} PASS`);
