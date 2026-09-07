import fs from "node:fs";

const source = fs.readFileSync("components/member/MemberReferralOrgChart.tsx", "utf8");

const assertions = [
  ["desktop pointer capture ignores member cards", source.includes('target.closest(".member-org-node-card, button, a, input, select, textarea")')],
  ["blank canvas still uses pointer capture for pan", source.includes("event.currentTarget.setPointerCapture(event.pointerId)")],
  ["member card click opens downline root", source.includes("if ((event.target as HTMLElement).closest(\"button\")) return;") && source.includes("onOpen(node);")],
  ["order trigger remains independently clickable", source.includes("onClick={() => onOpenOrders(node)}")],
  ["explicit drilldown remains independently clickable", source.includes("onClick={() => onOpen(node)}")],
  ["mobile pan zoom handlers preserved", source.includes("onPointerMove={(event) =>") && source.includes("after.length >= 2")],
];

let passed = 0;
for (const [name, ok] of assertions) {
  if (!ok) {
    console.error(`FAIL ${name}`);
    process.exitCode = 1;
  } else {
    passed += 1;
    console.log(`PASS ${name}`);
  }
}

if (!process.exitCode) {
  console.log(`PHASE J.3C.6 H6 Desktop interaction assertions: ${passed} PASS`);
}
