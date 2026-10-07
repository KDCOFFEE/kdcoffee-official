import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const referral = read("components/member/MemberReferralCenter.tsx");
const share = read("components/member/KdShareDialog.tsx");
const retail = read("components/member/RetailPromotionCenter.tsx");
const memberPage = read("app/member/page.tsx");
const auth = read("lib/memberAuth.ts");
const email = read("components/member/EmailAuthForms.tsx");
const css = read("app/globals.css");

const assertions = [
  ["one unified share entry remains under Recommendation without a Retail Promotion duplicate", /<section id="referral"[\s\S]*<KdShareDialog\b[\s\S]*<section id="rewards"/u.test(referral) && (referral.match(/<KdShareDialog\b/gu) ?? []).length === 1 && (referral.match(/className=\{styles\.primaryAction\}/gu) ?? []).length === 1 && !/KdShareDialog|shareOpen|retail-promotion-primary-action/u.test(retail)],
  ["referral team has no duplicate share entry", !referral.includes("member-referral-invite-v2") && !referral.includes("member-referral-share-primary")],
  ["copy link remains available inside the share dialog", share.includes("複製連結") && share.includes("copyText")],
  ["copy fallback", share.includes('document.execCommand("copy")')],
  ["qr code is available on demand", share.includes("quickchart.io/qr") && share.includes("qrOpen ?")],
  ["native share uses edited copy with fallback", share.includes("navigator.share") && share.includes("text: shareText") && share.includes("分享內容已複製")],
  ["referral tracking explanation remains consumer-facing", share.includes("推薦關係會由系統自動記錄") && !share.includes("HMAC")],
  ["member page preserves referral return", memberPage.includes("referralCode") && memberPage.includes("/member?ref=")],
  ["safe return allows only canonical referral code", auth.includes('/^KD[A-F0-9]{10}$/') && auth.includes('url.pathname !== "/member"')],
  ["email auth preserves referral return", email.includes('/^\\/member\\?ref=KD[A-F0-9]{10}$/')],
  ["responsive share dialog", css.includes(".kd-share-dialog") && css.includes("height:100dvh")],
  ["natural editable share copy", share.includes("最近喝到一家我很喜歡的咖啡，想分享給你") && share.includes("<textarea")],
  ["qr download capability", share.includes("下載 QR Code") && share.includes("anchor.download")],
];

let pass = 0;
for (const [name, ok] of assertions) {
  if (!ok) {
    console.error(`FAIL ${name}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${name}`);
    pass += 1;
  }
}
if (process.exitCode) process.exit(1);
console.log(`PHASE J.3A Member referral invite compatibility assertions: ${pass} PASS`);
