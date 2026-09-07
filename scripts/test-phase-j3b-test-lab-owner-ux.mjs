import fs from "node:fs";

const component = fs.readFileSync("components/admin/MembershipTestLab.tsx", "utf8");
const css = fs.readFileSync("components/admin/MembershipTestLab.css", "utf8");

const assertions = [
  ["Owner quick start exists", component.includes("今天要測什麼？")],
  ["five-level reward boundary is first-class", component.includes("五代獎金邊界") && component.includes("A → B → C → D → E → F → G")],
  ["guided referral boundary map exists", component.includes("五代獎金邊界測試") && component.includes("第6代：獎金邊界")],
  ["reward boundary expectation is explicit", component.includes("F 下單：A 必須拿到第 5 代獎勵") && component.includes("G 下單：A 是第 6 代，不得拿到獎勵")],
  ["other presets remain available", component.includes("snapshot.presets.map") && component.includes("其他測試情境")],
  ["existing API endpoint preserved", component.includes('fetch("/api/admin/membership-test-lab"')],
  ["reset safety preserved", component.includes("CLEAR SIMULATION ONLY")],
  ["order simulation preserved", component.includes('action: "create-order"')],
  ["scheduler preserved", component.includes('action: "run-scheduler"')],
  ["attack tests preserved", component.includes('action: "attack"')],
  ["Owner UX CSS exists", css.includes(".test-lab-owner-start") && css.includes(".test-lab-guided")],
  ["responsive Owner UX exists", css.includes("@media(max-width:720px)")],
  ["engineering tools are collapsed by default", component.includes('details className="test-lab-engineering-tools"')],
  ["guided PASS FAIL result exists", component.includes("PASS ✓") && component.includes("FAIL ✕")],
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
console.log(`PHASE J.3B Owner Test Lab UX assertions: ${pass} PASS`);
