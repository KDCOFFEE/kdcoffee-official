import fs from "node:fs";

const css = fs.readFileSync("app/globals.css", "utf8");

const checks = [
  ["referral summary spans full dashboard width", css.includes(".member-dashboard-content > #referral-summary") && css.includes("grid-column: 1 / -1")],
  ["referral center spans full dashboard width", css.includes(".member-dashboard-content > .member-referral-center-v2")],
  ["orders span full dashboard width", css.includes(".member-dashboard-content > .member-orders")],
  ["early responsive collapse exists", css.includes("@media (max-width: 1180px)") && css.includes(".member-dashboard-content {\n    display: block;")],
  ["referral invite becomes single column", css.includes(".member-referral-invite-v2 {\n    grid-template-columns: 1fr;")],
  ["share text can wrap normally", css.includes("overflow-wrap: anywhere") && css.includes("word-break: break-word")],
  ["QR stays bounded", css.includes("width: min(100%, 240px)")],
  ["mobile referral actions become one column", css.includes(".member-referral-actions-v2 {\n    display: grid;\n    grid-template-columns: 1fr;")],
  ["mobile KPI cards become one column", css.includes(".member-referral-kpis {\n    grid-template-columns: 1fr;")],
  ["login methods stack on mobile", css.includes(".member-login-method-row {\n    align-items: flex-start;\n    flex-direction: column;")],
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
console.log(`PHASE J.3C.1B Responsive member layout assertions: ${pass} PASS`);
