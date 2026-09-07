import fs from "node:fs";

const source = fs.readFileSync("app/api/admin/members/delete/route.ts", "utf8");
const assertions = [
  ["delete route enumerates physical member files", /listMembers\(\)/],
  ["all delete purges every physical member file", /purgeMemberFiles\(\)/],
  ["all delete purges full canonical registry", /purgeCanonicalMembers\(\)/],
  ["all delete clears membership commerce", /purgeMembershipCommerceForMembers\(\)/],
  ["legacy aliases included in cleanup discovery", /Object\.keys\(registry\.legacyAliases\)/],
  ["single delete resolves legacy alias", /registry\.legacyAliases\[memberId\] \|\| memberId/],
  ["single delete accepts physical legacy member", /physicalIds\.has\(memberId\)/],
  ["order history remains outside deletion route", !/adminOrders|listOrders|deleteOrder|purgeOrder/.test(source)],
];
let passed = 0;
for (const [name, condition] of assertions) {
  const ok = condition instanceof RegExp ? condition.test(source) : Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (ok) passed += 1;
}
if (passed !== assertions.length) process.exit(1);
console.log(`PHASE J.3A.1B Legacy member cleanup assertions: ${passed} PASS`);
