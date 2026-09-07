import fs from "node:fs";
const page = fs.readFileSync("app/member/page.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const checks = [
  ["approved welcome hero exists", page.includes("member-welcome-hero")],
  ["personalized welcome preserved", page.includes('`${memberName}，歡迎回來`')],
  ["member identity shown in hero", page.includes("member-welcome-meta") && page.includes("loginMethods.memberNumber")],
  ["four dashboard metrics preserved", page.includes("可用抵用金") && page.includes("待入帳回饋") && page.includes("直接推薦") && page.includes("最近訂單")],
  ["member status banner exists", page.includes("member-qualification-banner")],
  ["quick actions exist", page.includes("member-quick-action-grid") && page.includes("分享推薦連結")],
  ["existing lower member content preserved", page.includes("MemberSubscriptionExperience") && page.includes("MemberReferralCenter")],
  ["account data remains available", page.includes("member-account-summary")],
  ["visual desktop four-column dashboard", css.includes("grid-template-columns: repeat(4, minmax(0, 1fr))")],
  ["responsive dashboard exists", css.includes("@media (max-width: 960px)") && css.includes("@media (max-width: 700px)")],
  ["no reward engine implementation added", !page.includes("createReferralRewardsFromFulfillment")],
  ["no production PV rule implementation added", !page.includes("referralMaxRewardDepth")],
];
let pass = 0;
for (const [label, ok] of checks) {
  if (!ok) {
    console.error(`FAIL ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${label}`);
    pass++;
  }
}
if (process.exitCode) process.exit(1);
console.log(`PHASE J.3C.1A Member Dashboard Visual Redesign assertions: ${pass} PASS`);
