import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const referral = read("components/member/MemberReferralCenter.tsx");
const memberPage = read("app/member/page.tsx");
const auth = read("lib/memberAuth.ts");
const email = read("components/member/EmailAuthForms.tsx");
const css = read("app/globals.css");

const assertions = [
  ["personal referral code remains visible", referral.includes("查看推薦碼與連結") && referral.includes("推薦碼 <strong>{data.referralCode}</strong>")],
  ["visible referral url remains available", referral.includes("data.referralUrl") && referral.includes("複製連結")],
  ["copy referral code and url remain available", referral.includes('copy(data.referralCode, "推薦碼")') && referral.includes('copy(data.referralUrl, "分享連結")') && referral.includes("copyText")],
  ["copy fallback", referral.includes('document.execCommand("copy")')],
  ["qr code", referral.includes("quickchart.io/qr") && referral.includes("member-referral-qr-frame")],
  ["native share with copy fallback", referral.includes("navigator.share") && referral.includes("fullShareText") && referral.includes("分享內容已複製")],
  ["referral tracking privacy remains implicit", referral.includes("分享給朋友的內容不會強調推薦制度") && referral.includes("referralUrl")],
  ["member page preserves referral return", memberPage.includes("referralCode") && memberPage.includes("/member?ref=")],
  ["safe return allows only canonical referral code", auth.includes('/^KD[A-F0-9]{10}$/') && auth.includes('url.pathname !== "/member"')],
  ["email auth preserves referral return", email.includes('/^\\/member\\?ref=KD[A-F0-9]{10}$/')],
  ["responsive invite ui", css.includes("member-referral-invite") && css.includes("@media(max-width:560px)")],
  ["natural share copy", referral.includes("最近喝到一家我很喜歡的咖啡，想分享給你")],
  ["qr download capability", referral.includes("下載 QR Code 圖片") && referral.includes("anchor.download")],
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
