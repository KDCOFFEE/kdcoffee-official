import fs from "node:fs";

const org = fs.readFileSync("components/member/MemberReferralOrgChart.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const checks = [
  ["summary state exists", org.includes("summaryExpanded")],
  ["mobile summary toggle exists", org.includes("member-org-summary-toggle")],
  ["toggle exposes aria-expanded", org.includes("aria-expanded={summaryExpanded}")],
  ["toggle controls summary", org.includes('aria-controls="member-org-summary"')],
  ["collapsed label exists", org.includes('"展開摘要"')],
  ["expanded label exists", org.includes('"收合摘要"')],
  ["summary gets expanded class", org.includes('member-org-kpis${summaryExpanded ? " is-expanded" : ""}')],
  ["desktop toggle hidden by default", css.includes(".member-org-summary-toggle {\n  display: none;")],
  ["mobile kpis collapsed by default", css.includes(".member-org-kpis {\n    display: none;")],
  ["mobile expanded kpis visible", css.includes(".member-org-kpis.is-expanded {\n    display: grid;")],
  ["mobile header compacted", css.includes("PHASE J.3C.6 H4 — MOBILE COMPACT SUMMARY TOGGLE")],
];

let passed = 0;
for (const [label, ok] of checks) {
  if (!ok) {
    console.error(`FAIL ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${label}`);
    passed += 1;
  }
}
if (!process.exitCode) console.log(`PHASE J.3C.6 H4 Mobile compact summary assertions: ${passed} PASS`);
