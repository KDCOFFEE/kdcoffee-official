import fs from "node:fs";

const source = fs.readFileSync("components/member/MemberReferralOrgChart.tsx", "utf8");

const assertions = [
  ["touch pointers are still captured for pinch zoom", source.includes('event.pointerType !== "touch" && interactiveTarget')],
  ["desktop interactive targets are excluded from canvas drag", source.includes('interactiveTarget = target.closest(".member-org-node-card, button, a, input, select, textarea")')],
  ["pointer capture remains enabled for touch gestures", source.includes("event.currentTarget.setPointerCapture(event.pointerId)")],
  ["multi-touch pinch zoom logic remains", source.includes("after.length >= 2 && before.length >= 2")],
  ["pinch changes scale", source.includes("updateScale(scale * (afterDistance / beforeDistance))")],
  ["mobile pan remains", source.includes("if (after.length === 1)")],
  ["member card drilldown remains", source.includes("onOpen(node);")],
  ["new-order viewer trigger remains", source.includes("onClick={() => onOpenOrders(node)}")],
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
  console.log(`PHASE J.3C.6 H7 Mobile pinch restore assertions: ${passed} PASS`);
}
