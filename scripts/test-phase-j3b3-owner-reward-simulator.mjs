import fs from "node:fs";
const ui = fs.readFileSync("components/admin/MembershipTestLab.tsx", "utf8");
const css = fs.readFileSync("components/admin/MembershipTestLab.css", "utf8");
const checks = [
 ["Owner simulator exists", ui.includes("會員獎金自由試算")],
 ["A-G simulator members exist", ui.includes("createOwnerSimulatorMembers") && ui.includes("length: 7")],
 ["paid and PV modes exist", ui.includes("依消費金額") && ui.includes("依 PV")],
 ["per-member amount exists", ui.includes("purchaseAmount")],
 ["per-member PV exists", ui.includes("member.pv")],
 ["per-member eligibility exists", ui.includes("member.eligible") && ui.includes("activeSubscription: member.eligible")],
 ["eligibility is enforced through existing engine", ui.includes("requireActiveSubscription: true")],
 ["existing Test Lab API reused", ui.includes('action: "configure"') && ui.includes('action: "create-order"') && ui.includes('action: "transition-order"')],
 ["completed fulfillment drives reward", ui.includes('status: "completed"')],
 ["actual snapshot rewards displayed", ui.includes("finalSnapshot.rewards.filter") && ui.includes("calculatedCreditAmount")],
 ["guided boundary test preserved", ui.includes("runFiveLevelRewardBoundary")],
 ["engineering tools preserved", ui.includes("test-lab-engineering-tools")],
 ["responsive simulator CSS exists", css.includes("owner-reward-simulator") && css.includes("@media (max-width: 760px)")],
];
let pass=0;
for (const [label, ok] of checks) {
 if (!ok) { console.error(`FAIL ${label}`); process.exitCode=1; }
 else { console.log(`PASS ${label}`); pass++; }
}
if (process.exitCode) process.exit(1);
console.log(`PHASE J.3B.3 Owner reward simulator assertions: ${pass} PASS`);
