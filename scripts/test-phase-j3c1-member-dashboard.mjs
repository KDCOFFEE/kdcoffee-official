import fs from "node:fs";

const page = fs.readFileSync("app/member/page.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const checks = [
  ["personalized pickup name takes priority", page.includes('member.pickupName?.trim() || member.displayName?.trim() || ""')],
  ["personalized welcome heading exists", page.includes('`${memberName}，歡迎回來`')],
  ["safe no-name fallback exists", page.includes('"歡迎回來"')],
  ["dashboard available credit uses commerce data", page.includes("availableCredit") && page.includes('filter((item) => item.status === "available")')],
  ["dashboard pending reward uses commerce data", page.includes("commerce.pendingCredit")],
  ["dashboard direct referrals use commerce data", page.includes("commerce.referrals.length")],
  ["dashboard latest order uses actual order data", page.includes("const latestOrder = orders[0]")],
  ["account details are demoted into collapsible section", page.includes('className="member-account-summary"')],
  ["member number remains visible", page.includes("loginMethods.memberNumber")],
  ["navigation reflects member tasks", page.includes("會員總覽") && page.includes("推薦與回饋") && page.includes("帳戶資料")],
  ["Taipei date formatter exists", page.includes('timeZone: "Asia/Taipei"') && page.includes("formatTaipeiDateTime")],
  ["dashboard responsive CSS exists", css.includes(".member-dashboard-grid") && css.includes("@media (max-width: 430px)")],
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
console.log(`PHASE J.3C.1 Member Center Dashboard assertions: ${pass} PASS`);
