import fs from "node:fs";

const component = fs.readFileSync("components/admin/MembershipTestLab.tsx", "utf8");

const assertions = [
  ["deterministic Taipei formatter exists", component.includes("function formatTaipeiSimulationTime")],
  ["simulation time uses deterministic formatter", component.includes("formatTaipeiSimulationTime(snapshot.state.simulationNow)")],
  ["timeline time uses deterministic formatter", component.includes("formatTaipeiSimulationTime(entry.occurredAt)")],
  ["no locale-dependent Taipei rendering remains", !component.includes('toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })')],
  ["guided reward boundary runner preserved", component.includes("runFiveLevelRewardBoundary")],
  ["A through G boundary preserved", component.includes("A → B → C → D → E → F → G")],
  ["PASS FAIL guided result preserved", component.includes("PASS ✓") && component.includes("FAIL ✕")],
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
console.log(`PHASE J.3B.1C hydration-complete assertions: ${pass} PASS`);
