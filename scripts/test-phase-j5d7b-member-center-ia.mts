import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { defaultMemberCopySource } from "./member-copy-render-boundary-digest.mjs";

const root = process.cwd();
const read = async (file: string) => defaultMemberCopySource(await readFile(path.join(root, file), "utf8"), file);
const [page, nav, disclosure, qualification, retail, referral, share, routes, css] = await Promise.all([
  read("app/member/page.tsx"),
  read("components/member/MemberSectionNav.tsx"),
  read("components/member/MemberMobileDisclosure.tsx"),
  read("components/member/MemberQualificationSummary.tsx"),
  read("components/member/RetailPromotionCenter.tsx"),
  read("components/member/MemberReferralCenter.tsx"),
  read("components/member/KdShareDialog.tsx"),
  read("lib/retailPromotionRoutes.ts"),
  read("app/globals.css"),
]);

let passed = 0;
function test(name: string, assertion: () => void) {
  assertion();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

test("mobile navigation uses the six approved compact labels", () => {
  for (const label of ["總覽", "帳戶", "配送", "推薦", "回饋", "訂單"]) assert.match(nav, new RegExp(`mobileLabel: "${label}"`));
});
test("desktop navigation keeps the six full labels", () => {
  for (const label of ["會員總覽", "帳戶資料", "定期配送", "推薦", "回饋", "訂單"]) assert.match(nav, new RegExp(`label: "${label}"`));
});
test("complete account editor is outside the overview and in a hidden top-level panel", () => assert.match(page, /<\/div>\s*<section id="account" data-member-section role="tabpanel" hidden>[\s\S]*MemberProfileForm/));
test("complete subscription editor is in a separate hidden top-level panel", () => assert.match(page, /<section id="subscription" data-member-section role="tabpanel" hidden>[\s\S]*MemberSubscriptionExperience/));
test("overview has no second share quick action", () => assert.doesNotMatch(page, /分享推薦連結|邀請朋友加入/));
test("overview exposes only four management quick actions", () => assert.equal((page.match(/<a href="#(?:rewards|subscription|orders|account)"><strong>/g) ?? []).length, 4));
test("quick actions contain no numbering or helper subcopy", () => assert.doesNotMatch(page, /<a href="#(?:rewards|subscription|orders|account)"><i>|查看待入帳與已入帳|管理下一次配送|管理會員資訊/));
test("order primary layer is limited to three recent orders", () => assert.match(page, /orders\.slice\(0, 3\)\.map/));
test("order primary layer does not render fulfillment event timeline", () => assert.doesNotMatch(page, /fulfillment\.events\.slice/));
test("Retail Promotion remains a summary without a second share action", () => {
  assert.match(retail, /pendingReward/); assert.match(retail, /releasedReward/); assert.doesNotMatch(retail, /KdShareDialog|retail-promotion-primary-action/); assert.match(retail, /查看詳情/);
});
test("Retail Promotion details remain in an accessible dialog", () => assert.match(retail, /<dialog[\s\S]*aria-labelledby="retail-promotion-dialog-title"/));
test("old permanent share block remains removed", () => assert.doesNotMatch(referral, /member-referral-invite-v2|member-referral-share-primary|member-referral-qr/));
test("referral team is inline and has no team dialog", () => assert.doesNotMatch(referral, /teamDialogRef|member-team-dialog-title|setTeamDetailsOpen/));
test("Member Center has one primary share entry in Recommendation", () => {
  assert.equal((referral.match(/<KdShareDialog/g) ?? []).length, 1);
  assert.equal((referral.match(/className=\{styles\.primaryAction\}/g) ?? []).length, 1);
});
test("share dialog has a labelled editable textarea", () => assert.match(share, /<label className="kd-share-copy-editor">[\s\S]*<textarea value=\{shareText\}/));
test("edited text is passed to navigator.share", () => assert.match(share, /navigator\.share\(\{ title: "KD Coffee", text: shareText, url: shareUrl \}\)/));
test("canonical public homepage URL is used", () => {
  assert.match(share, /retailPromotionShareUrl\(`\$\{window\.location\.origin\}\//);
  assert.match(routes, /if \(normalized === "\/"\) return true/);
  assert.match(routes, /url\.searchParams\.set\("ref", referralCode\)/);
});
test("clipboard fallback copies complete share content", () => assert.match(share, /copyText\(`\$\{shareText\}\\n\\n\$\{shareUrl\}`\)/));
test("QR is rendered only after an explicit action", () => assert.match(share, /qrOpen \? <section className="kd-share-qr"/));
test("QR encodes the canonical share URL", () => assert.match(share, /encodeURIComponent\(canonicalShareUrl\(\)\)/));
test("reward detail is an accessible dialog with focus return", () => {
  assert.match(referral, /<dialog ref=\{rewardDialogRef\}[\s\S]*aria-labelledby="member-reward-ledger-title"/);
  assert.match(referral, /rewardTriggerRef\.current\?\.focus/);
});
test("progressive sections are closed by default and open on hash navigation", () => {
  assert.match(disclosure, /defaultOpen = false/); assert.match(disclosure, /setOpen\(true\)/);
});
test("top-level navigation activates one mutually exclusive panel", () => {
  assert.match(nav, /querySelectorAll<HTMLElement>\("\[data-member-section\]"\)/);
  assert.match(nav, /section\.hidden = section\.id !== item\.id/);
});
test("overview has a compact qualification summary and on-demand detail", () => {
  assert.match(page, /MemberQualificationSummary progress=\{referralCenter\.qualificationProgress\}/);
  assert.match(qualification, /member-qualification-summary-badge/);
  assert.match(qualification, /推薦回饋資格/);
  assert.match(qualification, /有效至/);
  assert.match(qualification, /查看詳情[\s\S]*→/);
  assert.match(qualification, /<dialog/);
});
test("qualification primary summary has no progress bar", () => assert.doesNotMatch(qualification, /member-qualification-progress|member-progress-track/));
test("overview ends with at most three canonical recent activity entries", () => {
  assert.match(page, /member-recent-activity/);
  assert.equal((page.match(/className="member-activity-row"/g) ?? []).length, 3);
});
test("recent activities are distinct rows with canonical destinations", () => {
  assert.match(page, /className="member-activity-row" href="#orders"/);
  assert.match(page, /className="member-activity-row" href="#subscription"/);
  assert.match(page, /className="member-activity-row" href="#rewards"/);
});
test("order activity does not concatenate delivery or reward content", () => {
  const orderRow = page.match(/\{latestOrder \? \([\s\S]*?<\/a>[\s\S]*?\) : null\}/)?.[0] ?? "";
  assert.match(orderRow, /latestOrder\.orderNumber/);
  assert.doesNotMatch(orderRow, /nextSubscriptionCycle|pendingRewardPoints|subscriptionShipping/);
});
test("mobile activity rows stay within the compact 56 to 72 pixel target", () => assert.match(css, /@media\(max-width:700px\)\{[\s\S]*?\.member-recent-activity \.member-activity-row\{[\s\S]*?min-height:60px/));
test("quick actions use only the Chinese heading", () => {
  assert.match(page, /<header><h2>快速功能<\/h2><\/header>/);
  assert.doesNotMatch(page, /QUICK ACTIONS/);
});
test("mobile stats remain a compact two-by-two layout", () => assert.match(css, /member-dashboard-grid\s*\{[^}]*grid-template-columns:\s*(?:repeat\(2,minmax\(0,1fr\)\)|1fr 1fr)/));
test("legacy global grid is superseded by scoped native horizontal navigation", () => {
  assert.match(nav, /tabListRef/);
  assert.match(nav, /activeTab\.offsetLeft/);
});
test("share and detail dialogs become full-screen on mobile", () => assert.match(css, /\.kd-share-dialog,\.member-ia-dialog\{width:100vw;[\s\S]*height:100dvh/));

console.log(`\nJ.5D.7B Member Center IA: ${passed}/${passed} PASS`);
