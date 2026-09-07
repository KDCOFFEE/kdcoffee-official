import fs from "node:fs";

const referral = fs.readFileSync("components/member/MemberReferralCenter.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const assertions = [
  ["share tools have mobile disclosure state", referral.includes("mobileShareOpen") && referral.includes("開啟分享工具") && referral.includes("收合分享工具")],
  ["QR code has mobile disclosure state", referral.includes("mobileQrOpen") && referral.includes("查看 QR Code") && referral.includes("收合 QR Code")],
  ["reward details have mobile disclosure state", referral.includes("mobileRewardDetailsOpen") && referral.includes("查看回饋明細") && referral.includes("收合回饋明細")],
  ["share data and actions remain present", referral.includes("member-referral-message-preview") && referral.includes("分享給朋友") && referral.includes("複製分享內容")],
  ["QR download remains present", referral.includes("下載 QR Code 圖片") && referral.includes("downloadQr")],
  ["reward filters and ledger remain present", referral.includes("member-reward-filters") && referral.includes("member-reward-ledger-list")],
  ["organization chart integration remains present", referral.includes("MemberReferralOrgChart") && referral.includes("查看組織圖")],
  ["mobile collapsible content is hidden by default", css.includes(".member-mobile-collapsible-content {") && css.includes("display: none;")],
  ["mobile open state reveals collapsible content", css.includes(".member-mobile-collapsible.is-open > .member-mobile-collapsible-content")],
  ["desktop collapsible content remains visible", css.includes(".member-mobile-collapsible-content,") && css.includes(".member-mobile-reward-details {")],
  ["quick actions remain two-column on mobile", css.includes(".member-quick-action-grid {") && css.includes("grid-template-columns: repeat(2, minmax(0, 1fr));")],
  ["fifth quick action becomes compact full-width row", css.includes(".member-quick-action-grid a:nth-child(5)") && css.includes("grid-column: 1 / -1;")],
  ["M1 CSS is mobile scoped", css.includes("J.3C.6 M1 — Mobile member center cleanup") && css.includes("@media (max-width: 700px)")],
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
  console.log(`PHASE J.3C.6 M1 Mobile member center cleanup assertions: ${passed} PASS`);
}
