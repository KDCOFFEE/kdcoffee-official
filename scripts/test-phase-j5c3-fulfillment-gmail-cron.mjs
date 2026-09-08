import fs from "node:fs";

const route = fs.readFileSync("app/api/internal/fulfillment-gmail-sync/route.ts", "utf8");
const runner = fs.readFileSync("scripts/run-fulfillment-gmail-sync.mjs", "utf8");

const checks = [
  ["internal endpoint uses bearer-secret authentication",
    route.includes("FULFILLMENT_CRON_SECRET") &&
    route.includes('const prefix = "Bearer "') &&
    route.includes("timingSafeEqual")],
  ["internal endpoint invokes existing Gmail engine",
    route.includes("syncSevenElevenGmail({ maxMessages: 100 })")],
  ["internal endpoint is POST-only in patch",
    route.includes("export async function POST") && !route.includes("export async function GET")],
  ["cron runner calls the formal web service endpoint",
    runner.includes("/api/internal/fulfillment-gmail-sync") &&
    runner.includes('method: "POST"')],
  ["cron runner requires same secret",
    runner.includes("FULFILLMENT_CRON_SECRET") &&
    runner.includes("Authorization: `Bearer ${secret}`")],
  ["cron runner terminates with failure on bad response",
    runner.includes("process.exit(1)") &&
    runner.includes("if (!response.ok)")],
  ["cron runner has bounded request time",
    runner.includes("90_000") && runner.includes("AbortController")],
];

let pass = 0;
for (const [name, ok] of checks) {
  if (!ok) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
  } else {
    pass += 1;
    console.log(`PASS ${pass}: ${name}`);
  }
}
if (!process.exitCode) {
  console.log(`\nJ.5C.3 targeted regression complete: ${pass} PASS`);
}
