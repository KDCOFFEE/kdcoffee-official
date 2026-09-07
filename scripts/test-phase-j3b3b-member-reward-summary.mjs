import fs from "node:fs";
const ui = fs.readFileSync("components/admin/MembershipTestLab.tsx", "utf8");
const css = fs.readFileSync("components/admin/MembershipTestLab.css", "utf8");

const checks = [
  ["reward summary helper exists", ui.includes("buildOwnerRewardSummary")],
  ["summary aggregates actual reward amounts", ui.includes("calculatedCreditAmount") && ui.includes("reduce((sum, reward) => sum + reward.calculatedCreditAmount")],
  ["summary uses actual beneficiary member", ui.includes("beneficiaryMemberId === member.memberId")],
  ["summary shows A through G", ui.includes("createOwnerSimulatorMembers") && ui.includes("會員獎金總覽")],
  ["summary shows cumulative reward", ui.includes("本次累計獎金")],
  ["summary shows reward sources", ui.includes("獎金來源") && ui.includes("sourceMemberId")],
  ["A is visually featured", ui.includes('member.letter === "A" ? "featured"')],
  ["order detail remains preserved", ui.includes("owner-order-result")],
  ["PV-first simulator remains preserved", ui.includes("依 PV（建議）")],
  ["responsive summary CSS exists", css.includes("owner-reward-summary-grid") && css.includes("@media (max-width: 620px)")],
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
console.log(`PHASE J.3B.3B Member reward summary assertions: ${pass} PASS`);
