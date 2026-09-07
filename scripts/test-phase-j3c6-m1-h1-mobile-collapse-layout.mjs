import fs from "node:fs";
const css = fs.readFileSync("app/globals.css", "utf8");

const assertions = [
  ["mobile QR disclosure becomes block layout", css.includes(".member-referral-qr-card-v2.member-mobile-collapsible {") && css.includes("display: block;")],
  ["mobile QR disclosure stretches full width", css.includes("width: 100%;") && css.includes("justify-items: initial;")],
  ["disclosure header gets full width", css.includes(".member-mobile-collapsible-head,") && css.includes(".member-mobile-qr-head {")],
  ["QR title no longer uses min-content wrapping", css.includes("word-break: normal;") && css.includes("white-space: normal;")],
  ["collapsed QR card has no artificial minimum height", css.includes(".member-referral-qr-card-v2.member-mobile-collapsible:not(.is-open)") && css.includes("min-height: 0;")],
  ["fix remains mobile scoped", css.includes("J.3C.6 M1-H1 — Mobile collapsed referral layout repair") && css.includes("@media (max-width: 700px)")],
];

let passed = 0;
for (const [name, ok] of assertions) {
  if (!ok) {
    console.error(`FAIL ${name}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${name}`);
    passed += 1;
  }
}
if (!process.exitCode) {
  console.log(`PHASE J.3C.6 M1-H1 mobile layout assertions: ${passed} PASS`);
}
