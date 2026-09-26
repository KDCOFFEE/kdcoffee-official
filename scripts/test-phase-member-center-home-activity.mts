import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => readFile(path.join(root, file), "utf8");
const [page, nav, styles] = await Promise.all([
  read("app/member/page.tsx"),
  read("components/member/MemberSectionNav.tsx"),
  read("components/member/MemberCenterExperience.module.css"),
]);

let passed = 0;
function test(name: string, assertion: () => void | Promise<void>) {
  return Promise.resolve(assertion()).then(() => {
    passed += 1;
    console.log(`PASS ${String(passed).padStart(2, "0")}: ${name}`);
  });
}

await test("Member Center exposes a readable homepage link", () => assert.match(nav, /<Link href="\/" className=\{styles\.homeLink\}>[\s\S]*返回首頁[\s\S]*<\/Link>/));
await test("homepage destination is the site root", () => assert.match(nav, /<Link href="\/"/));
await test("homepage action is outside tablist semantics", () => {
  const homeLink = nav.match(/<Link href="\/"[\s\S]*?<\/Link>/)?.[0] ?? "";
  assert.doesNotMatch(homeLink, /role="tab"/);
  assert.match(nav, /<div className=\{styles\.tabList\} role="tablist"/);
});
await test("existing five member tabs remain", () => assert.equal((nav.match(/\{ id: "/g) ?? []).length, 5));
await test("existing tab labels remain unchanged", () => {
  for (const label of ["會員總覽", "帳戶資料", "定期配送", "推薦與回饋", "訂單"]) assert.match(nav, new RegExp(`label: "${label}"`));
});
await test("hash activation remains intact", () => {
  assert.match(nav, /window\.location\.hash\.slice\(1\)/);
  assert.match(nav, /window\.addEventListener\("hashchange", syncHash\)/);
  assert.match(nav, /href=\{`#\$\{item\.id\}`\}/);
});
await test("active tab behavior remains intact", () => {
  assert.match(nav, /className=\{activeId === item\.id \? "is-active" : undefined\}/);
  assert.match(nav, /aria-selected=\{activeId === item\.id\}/);
  assert.match(nav, /section\.hidden = section\.id !== item\.id/);
});
await test("homepage action has a comfortable target and visible focus", () => {
  assert.match(styles, /\.navigation \.homeLink \{[\s\S]*?min-height: 44px/);
  assert.match(styles, /\.navigation \.homeLink:focus-visible \{[\s\S]*?outline:/);
});
await test("Recent Activity still renders all existing activity types", () => {
  for (const label of ["最近訂單", "定期配送", "會員回饋"]) assert.match(page, new RegExp(label));
});
await test("order activity still links to orders", () => assert.match(page, /className="member-activity-row" href="#orders"/));
await test("subscription activity still links to subscription", () => assert.match(page, /className="member-activity-row" href="#subscription"/));
await test("referral activity still links to referral", () => assert.match(page, /className="member-activity-row" href="#referral"/));
await test("mobile activity presentation is a one-column card stack", () => {
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.recentActivity :global\(\.member-activity-list\) \{[\s\S]*?grid-template-columns: 1fr;[\s\S]*?gap: 9px;[\s\S]*?border: 0;/);
  assert.match(styles, /\.recentActivity :global\(\.member-activity-row\),[\s\S]*?flex-direction: column;[\s\S]*?padding: 13px 14px;[\s\S]*?border: 1px solid/);
});
await test("mobile activity row no longer forces the old cramped height", () => {
  const rule = styles.match(/\.recentActivity :global\(\.member-activity-row\),[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.match(rule, /min-height: auto/);
  assert.doesNotMatch(rule, /min-height: 60px/);
});
await test("mobile activity action text remains visibly rendered", () => {
  const rule = styles.match(/\.recentActivity :global\(\.member-activity-action\) > span \{[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.match(rule, /position: static/);
  assert.match(rule, /width: auto/);
  assert.match(rule, /clip: auto/);
  assert.doesNotMatch(rule, /position: absolute|width: 1px|clip: rect/);
});
await test("mobile activity copy can wrap without clipping", () => {
  assert.match(styles, /\.recentActivity :global\(\.member-activity-copy\) > strong \{[\s\S]*?white-space: normal/);
  assert.match(styles, /\.recentActivity :global\(\.member-activity-copy\) > span \{[\s\S]*?overflow-wrap: anywhere;[\s\S]*?white-space: normal/);
});
await test("desktop Recent Activity markup and canonical links remain valid", () => assert.equal((page.match(/href="#(?:orders|subscription|referral)"/g) ?? []).length >= 7, true));
await test("Recent Activity data calculations remain canonical", () => {
  assert.match(page, /const latestOrder = orders\[0\]/);
  assert.match(page, /const nextSubscriptionCycle = commerce\.cycles[\s\S]*?\.sort\(\(left, right\) => left\.plannedDate\.localeCompare\(right\.plannedDate\)\)\[0\]/);
  assert.match(page, /const pendingRewardPoints = referralCenter\.rewards[\s\S]*?reward\.rewardPV, 0\)/);
});

await test("phase styling remains scoped to the member experience module", () => {
  assert.match(nav, /import styles from "\.\/MemberCenterExperience\.module\.css"/);
  assert.match(nav, /className=\{`member-center-nav \$\{styles\.navigation\}`\}/);
  assert.match(page, /import memberExperienceStyles from "@\/components\/member\/MemberCenterExperience\.module\.css"/);
  assert.match(page, /className=\{`member-recent-activity \$\{memberExperienceStyles\.recentActivity\}`\}/);
  assert.match(styles, /\.navigation \{/);
  assert.match(styles, /\.recentActivity :global\(\.member-activity-list\)/);
  assert.doesNotMatch(nav, /globals\.css/);
  assert.doesNotMatch(page, /globals\.css/);
});

await test("member navigation and activity introduce no product or cart behavior", () => {
  const recentActivity = page.match(/<section className=\{`member-recent-activity[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.notEqual(recentActivity, "");
  assert.deepEqual(
    [...recentActivity.matchAll(/className="member-activity-row" href="([^"]+)"/g)].map((match) => match[1]),
    ["#orders", "#subscription", "#referral"],
  );
  assert.doesNotMatch(`${nav}\n${recentActivity}`, /@\/components\/commerce|useCart|addItem|updateQuantity|removeItem|\/checkout|\/works\//);
});

console.log(`\nMember Center home navigation + mobile activity: ${passed}/${passed} PASS`);
