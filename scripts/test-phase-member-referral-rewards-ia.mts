import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { defaultMemberCopySource } from "./member-copy-render-boundary-digest.mjs";

const root = process.cwd();
const read = async (file: string) => defaultMemberCopySource(await readFile(path.join(root, file), "utf8"), file);
const [page, nav, navCss, referral, referralCss, retail, share, org, globals, commerce] = await Promise.all([
  read("app/member/page.tsx"),
  read("components/member/MemberSectionNav.tsx"),
  read("components/member/MemberCenterExperience.module.css"),
  read("components/member/MemberReferralCenter.tsx"),
  read("components/member/MemberReferralExperience.module.css"),
  read("components/member/RetailPromotionCenter.tsx"),
  read("components/member/KdShareDialog.tsx"),
  read("components/member/MemberReferralOrgChart.tsx"),
  read("app/globals.css"),
  read("lib/membershipCommerce.ts"),
]);

let passed = 0;
function test(name: string, assertion: () => void) {
  assertion();
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")}: ${name}`);
}

test("navigation has exactly six member tabs", () => assert.equal((nav.match(/\{ id: "/g) ?? []).length, 6));
test("navigation has the approved section ids", () => assert.deepEqual([...nav.matchAll(/\{ id: "([^"]+)"/g)].map((match) => match[1]), ["member-overview", "account", "subscription", "referral", "rewards", "orders"]));
test("desktop labels are complete", () => ["會員總覽", "帳戶資料", "定期配送", "推薦", "回饋", "訂單"].forEach((label) => assert.match(nav, new RegExp(`label: "${label}"`))));
test("mobile labels are readable", () => ["總覽", "帳戶", "配送", "推薦", "回饋", "訂單"].forEach((label) => assert.match(nav, new RegExp(`mobileLabel: "${label}"`))));
test("Home remains a normal root Link", () => assert.match(nav, /<Link href="\/" className=\{styles\.homeLink\}>/));
test("Home stays outside tab semantics", () => assert.doesNotMatch(nav.match(/<Link href="\/"[\s\S]*?<\/Link>/)?.[0] ?? "", /role="tab"|aria-selected/));
test("Recommendation is a top-level panel", () => assert.match(referral, /<section id="referral"[\s\S]*data-member-section role="tabpanel" hidden>/));
test("Rewards is a top-level panel", () => assert.match(referral, /<section id="rewards"[\s\S]*data-member-section role="tabpanel" hidden>/));
test("old combined title is gone", () => assert.doesNotMatch(`${page}\n${referral}`, /<h2[^>]*>推薦與回饋<\/h2>/));
test("Member routes and hash destinations are canonical", () => assert.match(nav, /href=\{`\/member#\$\{item\.id\}`\}/));
test("initial hash is synchronized", () => assert.match(nav, /window\.location\.hash\.slice\(1\)/));
test("back and forward hash changes are synchronized", () => {
  assert.match(nav, /addEventListener\("hashchange", syncRoute\)/);
  assert.match(nav, /addEventListener\("popstate", syncRoute\)/);
});
test("only the active top-level section is shown", () => assert.match(nav, /section\.hidden = section\.id !== item\.id/));
test("active tabs expose ARIA selection", () => assert.match(nav, /aria-selected=\{activeId === item\.id\}/));
test("tab strip has a dedicated scroll ref", () => assert.match(nav, /tabListRef/));
test("active visibility uses horizontal offsets", () => assert.match(nav, /activeTab\.offsetLeft/));
test("active visibility writes only horizontal scrolling", () => assert.match(nav, /scrollTo\(\{ left:/));
test("active visibility never uses scrollIntoView", () => assert.doesNotMatch(nav, /scrollIntoView/));
test("mobile tabs use natural flex widths", () => assert.match(navCss, /display: flex;[\s\S]*flex: 0 0 auto;[\s\S]*min-width: max-content/));
test("mobile tab strip scrolls horizontally", () => assert.match(navCss, /overflow-x: auto/));
test("mobile tab strip blocks vertical overflow", () => assert.match(navCss, /overflow-y: hidden/));
test("mobile scrollbar is hidden", () => assert.match(navCss, /scrollbar-width: none[\s\S]*::-webkit-scrollbar/));
test("mobile momentum scrolling is enabled", () => assert.match(navCss, /-webkit-overflow-scrolling: touch/));
test("mobile overscroll is contained to the tab strip", () => assert.match(navCss, /overscroll-behavior-x: contain/));
test("tabs keep a 44 pixel touch target", () => assert.match(navCss, /\.navigation \.tabList a \{[\s\S]*min-height: 44px/));
test("Home remains fixed beside the scroll strip", () => assert.match(navCss, /grid-template-columns: 44px minmax\(0, 1fr\)/));
test("mobile nav no longer forces equal tab columns", () => assert.doesNotMatch(navCss, /repeat\(6, minmax\(0, 1fr\)\)/));
test("pending reward card points to the pending Rewards detail", () => assert.match(page, /href="\/member\?rewardView=pending#rewards"[\s\S]*待入帳回饋/));
test("My Rewards quick action points to Rewards", () => assert.match(page, /<a href="#rewards"><strong>我的回饋<\/strong><\/a>/));
test("reward activity points to Rewards", () => assert.match(page, /member-activity-row" href="#rewards"[\s\S]*會員回饋/));
test("server-loaded referral data is passed into the client experience", () => assert.match(page, /<MemberReferralCenter initialData=\{referralExperienceData\} \/>/));
test("referral center does not refetch its endpoint", () => assert.doesNotMatch(referral, /fetch\("\/api\/member\/referral"/));
test("member page owns the canonical referral fetch", () => assert.equal((page.match(/getMemberReferralCenter\(/g) ?? []).length, 1));
test("Recommendation owns the one share dialog", () => assert.equal((referral.match(/<KdShareDialog/g) ?? []).length, 1));
test("Recommendation has the one primary share button", () => assert.equal((referral.match(/className=\{styles\.primaryAction\}/g) ?? []).length, 1));
test("share dialog preserves native share", () => assert.match(share, /navigator\.share/));
test("share dialog preserves clipboard fallback", () => assert.match(share, /navigator\.clipboard|execCommand\("copy"\)/));
test("share dialog preserves on-demand QR", () => assert.match(share, /quickchart\.io\/qr[\s\S]*qrOpen/));
test("Recommendation exposes the referral code", () => assert.match(referral, /data\.referralCode/));
test("Recommendation exposes the canonical referral URL", () => assert.match(referral, /data\.referralUrl/));
test("Recommendation answers who invited the member", () => assert.match(referral, /誰邀請我[\s\S]*data\.referrerMemberNumber/));
test("server projection exposes the referrer member number without mutation", () => assert.match(commerce, /const referrerMemberNumber[\s\S]*referringRelationship\.referrerMemberId/));
test("unresolved referrer member number remains null", () => assert.match(commerce, /registry\.members\[referringRelationship\.referrerMemberId\]\?\.memberNumber \?\? null/));
test("Recommendation uses a neutral null state without an invented identifier", () => {
  assert.match(referral, /data\.referrerMemberNumber \? `會員 \$\{data\.referrerMemberNumber\}` : "無推薦人資料"/);
  assert.doesNotMatch(referral, /未知會員|UNKNOWN|自然加入 KD Coffee/);
});
test("team explorer is inline", () => assert.match(referral, /<section className="member-referral-team-v2">/));
test("initial team dialog is removed", () => assert.doesNotMatch(referral, /teamDialogRef|member-team-dialog-title|setTeamDetailsOpen/));
test("organization chart opens directly from Recommendation", () => assert.match(referral, /orgChartTriggerRef[\s\S]*setOrgChartOpen\(true\)/));
test("organization chart close restores trigger focus", () => assert.match(referral, /setOrgChartOpen\(false\); window\.setTimeout\(\(\) => orgChartTriggerRef\.current\?\.focus\(\), 0\)/));
test("mobile org chart has an understandable return action", () => assert.match(org, /member-org-return[\s\S]*← 返回推薦/));
test("mobile return action has a 44 pixel target", () => assert.match(globals, /\.member-org-return\{[^}]*min-height:44px/));
test("organization chart stays limited to three displayed generations", () => assert.match(org, /depth=\{2\}[\s\S]*顯示 3 代內|顯示 3 代內[\s\S]*depth=\{2\}/));
test("organization chart preserves drag handling", () => assert.match(org, /onPointerMove/));
test("organization chart preserves pinch tracking", () => assert.match(org, /pointers\.current/));
test("organization chart preserves zoom and fit controls", () => assert.match(org, /aria-label="縮小"[\s\S]*aria-label="放大"[\s\S]*適合畫面/));
test("organization chart preserves recent order viewer", () => assert.match(org, /MemberOrgOrderViewer/));
test("Rewards includes Retail Promotion", () => assert.match(referral, /id="rewards"[\s\S]*<RetailPromotionCenter \/>/));
test("Retail Promotion has no second share dialog", () => assert.doesNotMatch(retail, /KdShareDialog|shareOpen|retail-promotion-primary-action/));
test("Retail Promotion explains guest attribution and Recommendation sharing", () => assert.match(retail, /訪客身分完成購買[\s\S]*「推薦」/));
test("Rewards includes member reward summary", () => assert.match(referral, /id="rewards"[\s\S]*MY REWARDS/));
test("Rewards includes qualification progress", () => assert.match(referral, /id="rewards"[\s\S]*MemberQualificationProgress/));
test("reward history remains on demand", () => assert.match(referral, /rewardDialogRef[\s\S]*回饋明細/));
test("Reward Engine fields remain the displayed source", () => ["reward.creditAmount", "reward.projectedCreditAmount", "reward.effectivePV", "reward.rewardRate", "reward.rewardPV"].forEach((field) => assert.match(referral, new RegExp(field.replace(".", "\\.")))));
test("member UI explains that displayed values use formal stored records", () => assert.match(referral, /回饋點數與折抵金額都以正式紀錄為準/));
test("new referral layout wraps safely on mobile", () => assert.match(referralCss, /@media \(max-width: 700px\)[\s\S]*grid-template-columns: 1fr/));
test("long referral URLs may wrap without page overflow", () => assert.match(referralCss, /overflow-wrap: anywhere/));
test("page swipe is not captured by the member navigation", () => assert.doesNotMatch(navCss, /touch-action:\s*none/));
test("phase UI sources contain no protected-data write paths", () => assert.doesNotMatch(`${page}\n${nav}\n${referral}\n${retail}`, /data\/(?:fulfillment|member-identity|membership-commerce)|public\/(?:data|uploads)/));

console.log(`\nMember Center Referral / Rewards IA: ${passed}/${passed} PASS`);
