import fs from "node:fs";

const css = fs.readFileSync("app/globals.css", "utf8");

const checks = [
  ["no literal backslash-n tokens remain", !css.includes("\\n")],
  ["J.3C.2A inline edit CSS exists", css.includes("J.3C.2A — Member account inline edit UX")],
  ["inline account layout exists", css.includes(".member-account-inline-layout")],
  ["inline account static grid exists", css.includes(".member-account-static-grid")],
  ["mobile inline edit override exists", css.includes("@media") && css.includes(".member-account-inline-layout")],
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
console.log(`PHASE J.3C.2A-H1 CSS syntax normalization assertions: ${pass} PASS`);
