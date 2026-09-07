import fs from "node:fs";
const ui = fs.readFileSync("components/admin/MembershipTestLab.tsx", "utf8");
const css = fs.readFileSync("components/admin/MembershipTestLab.css", "utf8");

const checks = [
  ["PV is the default owner mode", ui.includes('useState<"paid_amount" | "pv">("pv")')],
  ["PV is labeled as recommended", ui.includes("依 PV（建議）")],
  ["paid amount is comparison mode", ui.includes("依消費金額（比較）")],
  ["only selected basis column renders", ui.includes('simulatorMode === "pv" ? <th>本次 PV</th> : <th>本次消費 NT$</th>')],
  ["PV mode ignores paid amount basis", ui.includes('regularUnitPrice: simulatorMode === "paid_amount"')],
  ["paid mode ignores PV basis", ui.includes('basePV: simulatorMode === "pv"')],
  ["reward percent is not multiplied by 100", !ui.includes("reward.rewardRate * 100")],
  ["reward percent is owner-readable", ui.includes("獎金比例") && ui.includes("reward.rewardRate.toLocaleString()")],
  ["PV formula is displayed", ui.includes("PV ×") || (ui.includes("reward.effectivePV") && ui.includes("reward.rewardRate"))],
  ["actual reward amount remains displayed", ui.includes("實際獎金") && ui.includes("calculatedCreditAmount")],
  ["eligibility control remains", ui.includes("可領獎") && ui.includes("member.eligible")],
  ["existing reward engine flow remains", ui.includes('action: "create-order"') && ui.includes('status: "completed"')],
  ["PV-first responsive styling exists", css.includes("J.3B.3A PV-first Owner simulator refinement")],
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
console.log(`PHASE J.3B.3A PV-first Owner simulator assertions: ${pass} PASS`);
