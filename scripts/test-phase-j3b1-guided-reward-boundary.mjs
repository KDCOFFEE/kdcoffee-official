import fs from "node:fs";

const component = fs.readFileSync("components/admin/MembershipTestLab.tsx", "utf8");
const css = fs.readFileSync("components/admin/MembershipTestLab.css", "utf8");

const assertions = [
  ["A through G boundary is explicit", component.includes("A → B → C → D → E → F → G")],
  ["sixth generation boundary is explicit", component.includes("第 6 代 G") && component.includes("第 6 代，不得拿到獎勵")],
  ["guided runner exists", component.includes("runFiveLevelRewardBoundary")],
  ["F validates level five reward", component.includes('memberId: "SIM_MEMBER_F"') && component.includes("A 必須拿到第 5 代獎勵")],
  ["G validates level six exclusion", component.includes('memberId: "SIM_MEMBER_G"') && component.includes("A 是第 6 代，不得拿到獎勵")],
  ["real reward snapshots are inspected", component.includes("finalSnapshot.rewards.filter")],
  ["current reward depth is checked", component.includes("referralMaxRewardDepth") && component.includes("maxDepth === 5")],
  ["PASS FAIL verdict exists", component.includes("PASS ✓") && component.includes("FAIL ✕")],
  ["engineering tools collapsed", component.includes('details className="test-lab-engineering-tools"')],
  ["manual controls preserved", component.includes('action: "create-order"') && component.includes('action: "run-scheduler"') && component.includes('action: "attack"')],
  ["existing Test Lab API reused", component.includes('fetch("/api/admin/membership-test-lab"')],
  ["guided responsive CSS exists", css.includes(".test-lab-guided-result") && css.includes(".test-lab-engineering-tools")],
];

let pass = 0;
for (const [name, ok] of assertions) {
  if (!ok) {
    console.error(`FAIL ${name}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${name}`);
    pass += 1;
  }
}
if (process.exitCode) process.exit(1);
console.log(`PHASE J.3B.1 Guided reward boundary assertions: ${pass} PASS`);
