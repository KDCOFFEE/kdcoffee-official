import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { mock } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
/* eslint-disable react/no-children-prop -- React createElement typings require Provider children in props in this non-JSX fixture. */
import { MEMBER_CENTER_COPY_CATALOG, DEFAULT_MEMBER_CENTER_COPY, memberCopyValidationError, normalizeMemberCopyOverrides, resolveMemberCopy, resolveMemberDisplayValue } from "../lib/memberCenterCopy";
import { readMemberCenterCopy, saveMemberCenterCopy, MemberCopyConflictError, MemberCopyValidationError, getMemberCenterCopyFile } from "../lib/memberCenterCopyStore";
import Provider, { MemberCopyValue, MemberCopyElement } from "../components/member/MemberCenterCopyProvider";
import RewardLedgerCompactCard from "../components/member/RewardLedgerCompactCard";
import MemberCenterCopyManager from "../components/admin/MemberCenterCopyManager";
import { getMemberCommerceDashboard, getMemberReferralCenter } from "../lib/membershipCommerce";
import { provisionCanonicalMember } from "../lib/memberIdentity";
// Read-only JavaScript AST test utility.
import { memberCopyRenderBoundaryDigest } from "./member-copy-render-boundary-digest.mjs";

let checks = 0;
function check(name: string, operation: () => void) { operation(); checks++; console.log(`PASS ${name}`); }
const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-member-copy-"));
const copyFile = path.join(root, "member-center", "display-copy.json");
const previousRoot = process.env.KD_DATA_DIR;
const previousMount = process.env.RAILWAY_VOLUME_MOUNT_PATH;
const previousIdentitySecret = process.env.MEMBER_IDENTITY_SECRET;
process.env.KD_DATA_DIR = root;
process.env.MEMBER_IDENTITY_SECRET = "copy-test-identity-secret-over-thirty-two-characters";
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
try {
  const labelKey = "member.referral.generation1.title";
  check("catalog keys unique", () => assert.equal(new Set(MEMBER_CENTER_COPY_CATALOG.map((entry) => entry.key)).size, MEMBER_CENTER_COPY_CATALOG.length));
  for (const entry of MEMBER_CENTER_COPY_CATALOG) check(`valid default ${entry.key}`, () => assert.equal(memberCopyValidationError(entry.key, entry.defaultText), null));
  check("defaults remain original label", () => assert.equal(resolveMemberCopy({}, labelKey), "第 1 代推薦回饋"));
  check("CASE A label override", () => assert.equal(resolveMemberDisplayValue({ [labelKey]: "好友分享回饋" }, "第 1 代推薦回饋"), "好友分享回饋"));
  for (const invalid of ["", " ", "<script>alert(1)</script>", "{user.balance * 10}", "{unknownToken}", "a".repeat(4001)]) {
    check("invalid override rejected and default retained", () => { assert.ok(memberCopyValidationError(labelKey, invalid)); assert.equal(resolveMemberCopy({ [labelKey]: invalid }, labelKey), DEFAULT_MEMBER_CENTER_COPY[labelKey]); });
  }
  check("unknown key never exposed", () => assert.equal(resolveMemberCopy({}, "member.not.exists", {}, "安全文字"), "安全文字"));
  check("unknown stored fields ignored", () => assert.deepEqual(normalizeMemberCopyOverrides({ unknown: "test", [labelKey]: "好友分享回饋" }), { [labelKey]: "好友分享回饋" }));
  const dynamic = MEMBER_CENTER_COPY_CATALOG.find((entry) => entry.defaultText.includes("尚差 {remainingPoints}"));
  assert.ok(dynamic, "actual remaining-points template exists");
  const values = Object.fromEntries(Object.keys(dynamic.tokens).map((token) => [token, token === "remainingPoints" ? 120 : "KD點"]));
  const template = `再累積 {remainingPoints} 點，即可達成本期資格。${Object.keys(dynamic.tokens).filter((token) => token !== "remainingPoints").map((token) => `{${token}}`).join("")}`;
  check("CASE B actual token value preserved", () => assert.ok(resolveMemberCopy({ [dynamic.key]: template }, dynamic.key, values).includes("再累積 120 點")));
  check("dynamic rendered output matches original formatted values", () => assert.equal(resolveMemberDisplayValue({ [dynamic.key]: template }, resolveMemberCopy({}, dynamic.key, values)), resolveMemberCopy({ [dynamic.key]: template }, dynamic.key, values)));
  check("required tokens cannot be removed", () => assert.ok(memberCopyValidationError(dynamic.key, "直接符合資格")));
  check("missing token value returns safe fallback", () => assert.equal(resolveMemberCopy({ [dynamic.key]: template }, dynamic.key, {}, "資料確認中"), "資料確認中"));
  check("display-only point unit keeps numeric value", () => assert.equal(resolveMemberDisplayValue({ "member.rewards.kdPoints.title": "咖啡點" }, "+ 1,234.5 KD點"), "+ 1,234.5 咖啡點"));
  const absent = await readMemberCenterCopy();
  check("missing file defaults", () => assert.deepEqual(absent, { version: 1, revision: 0, overrides: {} }));
  check("same persistent storage root", () => assert.equal(getMemberCenterCopyFile(), copyFile));
  await assert.rejects(fs.access(copyFile)); checks++;
  const saved = await saveMemberCenterCopy({ expectedRevision: 0, overrides: { [labelKey]: "好友分享回饋" } });
  check("save increments revision", () => assert.equal(saved.revision, 1));
  assert.deepEqual(await readMemberCenterCopy(), saved); checks++;
  await assert.rejects(saveMemberCenterCopy({ expectedRevision: 0, overrides: {} }), MemberCopyConflictError); checks++;
  await assert.rejects(saveMemberCenterCopy({ expectedRevision: 1, overrides: { [labelKey]: "<b>unsafe</b>" } }), MemberCopyValidationError); checks++;
  const concurrent = await Promise.allSettled([saveMemberCenterCopy({ expectedRevision: 1, overrides: {} }), saveMemberCenterCopy({ expectedRevision: 1, overrides: {} })]);
  check("concurrent edit one winner", () => assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1));
  await fs.writeFile(copyFile, "broken JSON", "utf8");
  assert.deepEqual(await readMemberCenterCopy(), absent); checks++;
  await fs.writeFile(copyFile, JSON.stringify({ revision: 3, overrides: { [labelKey]: "", unknown: "bad" } }), "utf8");
  assert.deepEqual((await readMemberCenterCopy()).overrides, {}); checks++;
  const canonical = await provisionCanonicalMember({ provider: "email", subject: "copy-domain@example.test", persistMember: async () => undefined });
  // Compare the canonical DTOs at the same instant, including rolling windows.
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-01T00:00:00.000Z") });
  const beforeDomain = await Promise.all([getMemberCommerceDashboard(canonical.member.memberId), getMemberReferralCenter(canonical.member.memberId)]);
  await saveMemberCenterCopy({ expectedRevision: 3, overrides: { [labelKey]: "好友分享回饋", "member.rewards.kdPoints.title": "咖啡點" } });
  const afterDomain = await Promise.all([getMemberCommerceDashboard(canonical.member.memberId), getMemberReferralCenter(canonical.member.memberId)]);
  check("canonical dashboard referral qualification ledger credit DTOs identical", () => assert.deepEqual(afterDomain, beforeDomain));
  mock.timers.reset();
  const ledger = { referralProgram: "referralGeneration1", amount: 18, pv: 17.5, rate: 5, status: "pending", creditBalance: 300, qualified: false, records: [{ id: "reward-original", amount: 18 }] };
  const snapshot = JSON.stringify(ledger);
  const props = { detailId: "copy-regression", expanded: true, onToggle: () => undefined, title: "第 1 代推薦回饋", displayStatus: "待符合資格", sourceDate: "2026-10-01", sourceOrderNumber: "KD-TEST-001", sourceItems: [], rewardPV: ledger.pv, creditAmount: ledger.amount, pointDisplayName: "KD點", releaseEligibleBusinessDate: null, releasedAt: null, calculationBasis: "pv" as const, calculationBaseValue: 350, rewardRate: ledger.rate, sourceOrderSummary: null, waitingExplanation: null, qualificationSummary: "尚未符合資格", lifecycleLabels: ["訂單完成", "等待資格", "安全等待", "已入帳"], lifecycleStage: 2 };
  const render = (overrides: Record<string, string>) => renderToStaticMarkup(createElement(Provider, { initialOverrides: overrides, children: createElement(RewardLedgerCompactCard, props) }));
  const before = render({});
  const after = render({ [labelKey]: "好友分享回饋" });
  check("actual reward card changed label", () => { assert.ok(before.includes("第 1 代推薦回饋")); assert.ok(after.includes("好友分享回饋")); });
  for (const display of ["18 元", "+ 17.5 KD點", "5%", "待符合資格", "KD-TEST-001"]) check(`business display unchanged ${display}`, () => { assert.ok(before.includes(display)); assert.ok(after.includes(display)); });
  check("canonical percentage points display exactly 5%", () => { assert.ok(before.includes(">5%<")); assert.ok(after.includes(">5%<")); assert.ok(!after.includes("500%")); });
  check("DOM structure unchanged", () => assert.deepEqual(before.match(/<[^>]+>/g), after.match(/<[^>]+>/g)));
  check("ledger qualification points credit unchanged", () => assert.equal(JSON.stringify(ledger), snapshot));
  const escaped = renderToStaticMarkup(createElement(Provider, { initialOverrides: {}, children: createElement(MemberCopyValue, { value: "<script>value</script>" }) }));
  check("data escaped not interpreted", () => { assert.ok(escaped.includes("&lt;script&gt;")); assert.ok(!escaped.includes("<script>")); });
  const attr = renderToStaticMarkup(createElement(Provider, { initialOverrides: { [labelKey]: "好友分享回饋" }, children: createElement(MemberCopyElement<"button">, { as: "button", title: "第 1 代推薦回饋", type: "button", disabled: true }, "test") }));
  check("native attributes preserved display title resolved", () => { assert.ok(attr.includes('title="好友分享回饋"')); assert.ok(attr.includes("disabled")); });
  const admin = renderToStaticMarkup(createElement(MemberCenterCopyManager, { initialRevision: 0, initialOverrides: {} }));
  check("Admin grouped editor renders", () => { assert.ok(admin.includes("會員中心顯示文字與說明")); assert.ok(admin.includes("預設文字：")); assert.ok(admin.includes("恢復預設")); assert.ok(admin.includes("定期配送")); });
  const renamed = render({ "member.dashboard.label.622f3c5acb": "枚", "member.rewards.kdPoints.title": "咖啡點", "credit.reward.qualifying": "資格待確認" });
  check("reward details follow shared credit unit and point name", () => {
    assert.ok(renamed.includes("18 枚")); assert.ok(renamed.includes("17.5 咖啡點")); assert.ok(renamed.includes("資格待確認"));
    assert.ok(renamed.includes("5%")); assert.ok(!renamed.includes("18 元"));
  });
  const baselines = JSON.parse(await fs.readFile(path.join(process.cwd(), "scripts/fixtures/member-copy-render-boundary-baseline.json"), "utf8"));
  for (const [file, digest] of Object.entries(baselines)) check(`presentation regression baseline ${file}`, () => assert.equal(memberCopyRenderBoundaryDigest(requireSource(file), file), digest));
  console.log(`MEMBER COPY PASS: ${checks} checks; isolated storage only.`);
} finally {
  mock.timers.reset();
  if (previousRoot === undefined) delete process.env.KD_DATA_DIR; else process.env.KD_DATA_DIR = previousRoot;
  if (previousMount === undefined) delete process.env.RAILWAY_VOLUME_MOUNT_PATH; else process.env.RAILWAY_VOLUME_MOUNT_PATH = previousMount;
  if (previousIdentitySecret === undefined) delete process.env.MEMBER_IDENTITY_SECRET; else process.env.MEMBER_IDENTITY_SECRET = previousIdentitySecret;
  // Only this test-owned, exact mkdtemp directory is removed.
  assert.ok(root.startsWith(path.join(os.tmpdir(), "kd-member-copy-")));
  await fs.rm(root, { recursive: true, force: true });
}

import { readFileSync } from "node:fs";
function requireSource(file: string) { return readFileSync(path.resolve(file), "utf8"); }
