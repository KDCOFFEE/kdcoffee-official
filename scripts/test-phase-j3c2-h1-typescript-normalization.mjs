import fs from "node:fs";

const source = fs.readFileSync("lib/membershipCommerce.ts", "utf8");

const checks = [
  [
    "undefined source order is normalized before safeOrderItems",
    source.includes("sourceItems: safeOrderItems(sourceOrder ?? null)")
  ],
  [
    "reward source order remains read-only",
    source.includes("readOrder(")
  ],
  [
    "reward source member number remains server-resolved",
    source.includes("registry.members[item.sourceMemberId]?.memberNumber")
  ],
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
console.log(`PHASE J.3C.2-H1 TypeScript normalization assertions: ${pass} PASS`);
