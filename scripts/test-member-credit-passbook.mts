// node --experimental-strip-types --import ./scripts/credit-integration-test-bootstrap.mjs scripts/test-member-credit-passbook.mts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CreditEntry } from "../lib/membershipCommerce";

const root = await mkdtemp(path.join(os.tmpdir(), "kd-credit-passbook-test-"));
const secret = randomBytes(48).toString("hex");
process.env.KD_DATA_DIR = root;
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.AUTH_SESSION_SECRET = secret;
process.env.MEMBER_IDENTITY_SECRET = secret;
globalThis.fetch = async () => { throw new Error("External network forbidden in isolated test"); };
const globals = globalThis as typeof globalThis & { __creditTestCookie?: string };
const commerce = await import("../lib/membershipCommerce");
const identity = await import("../lib/memberIdentity");
const auth = await import("../lib/memberAuth");
const store = await import("../lib/memberCreditPassbookStore");
const { selectMemberCreditPassbook, CREDIT_PASSBOOK_PAGE_SIZE } = await import("../lib/memberCreditPassbook");
const { resolveMemberCopy, normalizeMemberCopyOverrides, MEMBER_CENTER_COPY_CATALOG } = await import("../lib/memberCenterCopy");
const { GET } = await import("../app/api/member/credit/history/route");
const { default: Provider, MemberRewardCopyValue } = await import("../components/member/MemberCenterCopyProvider");
const copyStore = await import("../lib/memberCenterCopyStore");
const { default: Ledger } = await import("../components/member/MemberCreditLedger");
const { default: Passbook } = await import("../components/member/MemberCreditPassbook");
const { default: Rewards } = await import("../components/member/MemberReferralCenter");
const fsSource = (file: string) => readFileSync(file, "utf8");
let checks = 0;
function check(name: string, assertion: () => void) { assertion(); checks++; console.log(`PASS ${checks}: ${name}`); }
const render = (element: ReturnType<typeof createElement>, overrides: Record<string, string> = {}) =>
  // eslint-disable-next-line react/no-children-prop -- Provider children are required in its typed SSR fixture props.
  renderToStaticMarkup(createElement(Provider, { initialOverrides: overrides, children: element }));

try {
  const member = await identity.ensureLegacyCanonicalMember({ memberId: "passbook_fixture", identities: [{ provider: "email", subject: "passbook@example.test" }] });
  await auth.saveMember({ id: member.memberId, email: "passbook@example.test", createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() });
  const grant = await commerce.adjustMemberCreditByAdmin({ memberId: member.memberId, direction: "grant", amount: 10000,
    reason: "INTERNAL_REASON_DO_NOT_EXPOSE", note: "PRIVATE_NOTE_DO_NOT_EXPOSE", idempotencyKey: "PRIVATE_GRANT_KEY", now: new Date("2026-10-06T23:30:00Z") });
  await commerce.adjustMemberCreditByAdmin({ memberId: member.memberId, direction: "deduct", amount: 5000,
    reason: "INTERNAL_DEDUCTION_REASON", idempotencyKey: "PRIVATE_DEBIT_KEY", now: new Date("2026-10-06T23:35:00Z") });
  const ledgerBefore = JSON.stringify(await commerce.readMembershipCommerceState());
  const page = await store.getMemberCreditPassbook(member.memberId);
  check("canonical 0 → +10000 → -5000 snapshots newest first", () => assert.deepEqual(page.entries.map((e) => [e.change, e.balanceAfter]), [[-5000, 5000], [10000, 10000]]));
  const available = await commerce.getAvailableCredit(member.memberId, new Date("2026-10-07T00:00:00Z"));
  check("current available balance remains 5000", () => assert.equal(available, 5000));
  const dashboard = await commerce.getMemberCommerceDashboard(member.memberId, new Date("2026-10-07T00:00:00Z"));
  check("proves reward-only projection excludes Admin while canonical history includes both", () => {
    assert.equal(dashboard.rewardCreditSources.length, 0); assert.equal(dashboard.credits.length, 2); assert.equal(page.entries.length, 2);
  });
  const html = render(createElement(Ledger, { initialPage: page }));
  check("actual SSR renders signed changes and balances", () => {
    for (const text of ["-5,000 元", "餘額 5,000 元", "+10,000 元", "餘額 10,000 元", "後台發放抵用金", "後台調整抵用金"]) assert.ok(html.includes(text), text);
    assert.ok(html.indexOf("-5,000") < html.indexOf("+10,000"));
  });
  check("Taipei member date/time retained", () => assert.ok(html.includes("2026/10/07 07:35")));
  check("safe projection and actual UI contain no private technical fields", () => {
    const output = JSON.stringify(page) + html;
    for (const text of ["PRIVATE_", "INTERNAL_", "creditEntryId", "sourceReference", "metadata", "audit", grant.entry.creditEntryId]) assert.ok(!output.includes(text), text);
  });
  const modal = render(createElement(Passbook, { availableCredit: 5000, initialPage: page }));
  check("card opens an accessible compact dialog with full-detail link", () => {
    assert.ok(modal.includes('aria-haspopup="dialog"')); assert.ok(modal.includes('aria-labelledby="member-credit-passbook-title"'));
    assert.ok(modal.includes("抵用金明細")); assert.ok(modal.includes("查看詳情 →")); assert.ok(modal.includes("5,000 元"));
    assert.ok(modal.includes('/member?rewardView=released#rewards'));
  });
  const referral = await commerce.getMemberReferralCenter(member.memberId);
  const full = render(createElement(Rewards, { initialData: { ...referral, availableCreditBalance: 5000,
    rewardCreditSources: dashboard.rewardCreditSources, pendingRetailPromotionRewards: dashboard.pendingRetailPromotionRewards,
    displayRules: { pointDisplayName: "KD點", pvRewardMoneyValue: 1, payoutQualification: { mode: "general", qualificationBasis: "money",
      generalMember: { windowDays: 30, threshold: 0 }, activeSubscriptionMember: { windowDays: 30, threshold: 0 } }, baseWaitingDays: 0, returnProtectionDays: 0 } } }));
  check("full and pending detail surface do not prepend the general ledger", () => {
    assert.ok(full.includes("REWARD DETAILS")); assert.ok(full.includes("推薦與會員回饋")); assert.ok(!full.includes("抵用金異動紀錄"));
    assert.ok(!full.includes("後台發放抵用金")); assert.ok(!full.includes("後台調整抵用金"));
  });
  const changed = render(createElement(Ledger, { initialPage: page }), { "member.rewards.storeCredit.title": "驗收咖啡金", "member.dashboard.label.622f3c5acb": "枚" });
  check("shared name and existing unit overrides apply without mutation", () => {
    assert.ok(changed.includes("後台調整驗收咖啡金")); assert.ok(changed.includes("-5,000 枚")); assert.ok(changed.includes("餘額 5,000 枚"));
    assert.equal(normalizeMemberCopyOverrides({ "member.referral.label.5b29dc001e": "KD弊" })["member.referral.label.5b29dc001e"], "KD弊");
  });
  const empty = selectMemberCreditPassbook({ creditEntries: {} }, member.memberId);
  check("empty and zero show general credit wording", () => {
    const output = render(createElement(Passbook, { availableCredit: 0, initialPage: empty }));
    assert.ok(output.includes("目前尚無抵用金異動紀錄")); assert.ok(output.includes("0 元")); assert.ok(!output.includes("尚未有推薦"));
  });
  const entry = (id: string, amount = 50): CreditEntry => ({ ...grant.entry, creditEntryId: id, amount, memberId: member.memberId,
    remainingAmount: amount, sourceType: "member_reward", sourceReference: "referral_reward:private", metadata: {}, createdAt: "2026-10-06T23:00:00Z" });
  const reward = selectMemberCreditPassbook({ creditEntries: { reward: entry("reward") }, creditReservations: {} }, member.memberId);
  check("reward-generated entry shows a verified resulting balance without writing a snapshot", () => {
    assert.equal(reward.entries[0].change, 50); assert.equal(reward.entries[0].balanceAfter, 50);
    const output = render(createElement(Ledger, { initialPage: reward })); assert.ok(output.includes("會員回饋")); assert.ok(!output.includes("歷史餘額未記錄")); assert.ok(output.includes("餘額 50 元"));
  });
  check("referral and retail mapping remain distinct", () => {
    const referralEntry = { ...entry("r"), sourceType: "referral" as const };
    const retailEntry = { ...entry("p"), sourceType: "promotion" as const, sourceReference: "retail_promotion_reward:private" };
    const result = selectMemberCreditPassbook({ creditEntries: { r: referralEntry, p: retailEntry } }, member.memberId);
    assert.deepEqual(new Set(result.entries.map((e) => e.descriptionKey)), new Set(["credit.passbook.referral", "credit.passbook.retailReward"]));
  });
  check("zero snapshot stays zero and malformed snapshot stays unknown", () => {
    const zero = { ...entry("z", -50), metadata: { balanceBefore: 50, balanceAfter: 0 } };
    const invalid = { ...entry("x", -50), metadata: { balanceBefore: 100, balanceAfter: 80 } };
    assert.equal(selectMemberCreditPassbook({ creditEntries: { z: zero } }, member.memberId).entries[0].balanceAfter, 0);
    assert.equal(selectMemberCreditPassbook({ creditEntries: { x: invalid } }, member.memberId).entries[0].balanceAfter, null);
  });
  const many = Object.fromEntries(Array.from({ length: 45 }, (_, n) => [`e${n}`, {
    ...entry(`e${String(n).padStart(3, "0")}`), createdAt: new Date(Date.parse("2026-10-06T23:00:00Z") + n * 60000).toISOString(),
  }]));
  check("bounded stable pagination covers records exactly once and excludes other member", () => {
    const state = { creditReservations: {}, creditEntries: { ...many, other: { ...entry("other"), memberId: "another-member" } } };
    const a = selectMemberCreditPassbook(state, member.memberId); const b = selectMemberCreditPassbook(state, member.memberId, a.nextOffset!);
    const c = selectMemberCreditPassbook(state, member.memberId, b.nextOffset!);
    assert.deepEqual([a.entries.length, b.entries.length, c.entries.length, c.nextOffset], [CREDIT_PASSBOOK_PAGE_SIZE, 20, 5, null]);
    assert.equal(new Set([...a.entries, ...b.entries, ...c.entries].map((e) => e.date)).size, 45);
    assert.throws(() => selectMemberCreditPassbook(state, member.memberId, -1));
  });
  const anonymous = await GET(new Request("http://localhost/api/member/credit/history"));
  check("API rejects anonymous access", () => assert.equal(anonymous.status, 401));
  globals.__creditTestCookie = auth.createSessionToken(member.memberId);
  const response = await GET(new Request("http://localhost/api/member/credit/history?memberId=another-member"));
  check("API uses actual authenticated identity, ignores caller memberId and disables caching", () => {
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
  });
  assert.deepEqual(await response.json(), page); checks++;
  const invalid = await GET(new Request("http://localhost/api/member/credit/history?offset=-1"));
  check("API rejects invalid offsets", () => assert.equal(invalid.status, 400));
  check("name templates allow deliberate independent overrides", () => {
    assert.equal(resolveMemberCopy({ "credit.passbook.adminGrant": "歷史名稱" }, "credit.passbook.adminGrant"), "歷史名稱");
  });
  const css = await readFile("components/member/MemberCreditPassbook.module.css", "utf8");
  check("desktop has three columns; mobile gives the labeled balance its own wrapping line", () => {
    const mobile = css.split("@media(max-width:600px)")[1].split("@media(max-width:340px)")[0];
    assert.ok(css.includes("grid-template-columns:minmax(0,1fr) auto auto"));
    assert.ok(mobile.includes("grid-template-columns:minmax(0,1fr) auto"));
    assert.ok(mobile.includes(".balance { grid-column:1 / -1; justify-self:end; }"));
    assert.ok(css.includes("grid-template-columns:subgrid")); assert.ok(css.includes("font-variant-numeric:tabular-nums"));
    assert.ok(css.includes("overflow-wrap:anywhere")); assert.ok(css.includes("max-width:340px")); assert.ok(!html.includes("<table"));
  });
  check("date sits above one logical description/delta/balance transaction row", () => {
    assert.equal((html.match(/class="transaction"/g) ?? []).length, 2);
    assert.ok(html.includes('<div class="transaction"><strong class="description">後台調整抵用金</strong><strong class="delta debit">-5,000 元</strong><span class="balance">餘額 5,000 元</span>'));
  });
  check("genuinely unresolved balances have an editable label and one note", () => {
    const output = render(createElement(Ledger, { initialPage: { entries: [{ ...reward.entries[0], balanceAfter: null }, { ...reward.entries[0], balanceAfter: null }], nextOffset: null } }));
    assert.equal(output.split("餘額待確認").length - 1, 2);
    assert.equal(output.split("部分早期紀錄缺少完整異動資料，當時餘額仍待確認。").length - 1, 1);
    assert.ok(!html.includes("部分早期紀錄缺少完整異動資料，當時餘額仍待確認。"));
  });
  check("first page renders twenty rows and navigation remains bounded", () => {
    const first = selectMemberCreditPassbook({ creditEntries: many, creditReservations: {} }, member.memberId);
    const output = render(createElement(Ledger, { initialPage: first }));
    assert.equal((output.match(/class="row"/g) ?? []).length, 20);
    assert.match(output, /disabled="">上一頁/); assert.ok(output.includes("第 1 頁"));
    assert.ok(!output.includes("載入更多"));
    const source = fsSource("components/member/MemberCreditLedger.tsx");
    assert.ok(source.includes("if (pages[pageIndex + 1]) { move(pageIndex + 1); return; }"));
    assert.ok(source.includes("onClick={() => move(pageIndex - 1)}"));
    assert.ok(source.includes("onPageChange?.()"));
    assert.ok(!source.includes("showModal") && !source.includes(".close()"));
  });
  check("cursor skips new incoming rows and handles same-date ties without overlap", () => {
    const state = { creditEntries: many, creditReservations: {} };
    const first = selectMemberCreditPassbook(state, member.memberId);
    const inserted = { ...entry("new"), createdAt: "2026-10-07T23:00:00Z" };
    const second = selectMemberCreditPassbook({ creditReservations: {}, creditEntries: { ...many, new: inserted } }, member.memberId, 0, first.nextCursor!);
    assert.equal(second.entries.length, 20);
    assert.equal(new Set([...first.entries, ...second.entries].map((row) => row.date)).size, 40);
    assert.deepEqual(second.entries, selectMemberCreditPassbook(state, member.memberId, 20).entries);
    const tied = Object.fromEntries(Array.from({ length: 42 }, (_, n) => [String(n), entry(String(n).padStart(3, "0"), n + 1)]));
    const a = selectMemberCreditPassbook({ creditEntries: tied, creditReservations: {} }, member.memberId);
    const b = selectMemberCreditPassbook({ creditEntries: tied }, member.memberId, 0, a.nextCursor!);
    const c = selectMemberCreditPassbook({ creditEntries: tied }, member.memberId, 0, b.nextCursor!);
    assert.equal(new Set([...a.entries, ...b.entries, ...c.entries].map((row) => row.change)).size, 42);
    assert.equal(c.nextCursor, null);
  });
  const badCursor = await GET(new Request("http://localhost/api/member/credit/history?cursor=bad"));
  check("API rejects malformed cursor instead of leaking a technical error", () => assert.equal(badCursor.status, 400));
  const source = fsSource("components/member/MemberReferralCenter.tsx");
  check("all/pending/released retain reward detail deep links with no general ledger dependency", () => {
    assert.ok(!source.includes("MemberCreditLedger")); assert.ok(source.includes('rewardView === "pending"'));
    assert.ok(source.includes('rewardView === "released"')); assert.ok(source.includes("RewardLedgerCompactCard"));
  });
  const passbookKeys = MEMBER_CENTER_COPY_CATALOG.filter((item) => item.key.startsWith("credit.passbook.") || item.key.startsWith("credit.reward."));
  const custom = Object.fromEntries(passbookKeys.map((item) => [item.key, "編輯：" + item.defaultText]));
  const stored = await copyStore.saveMemberCenterCopy({ expectedRevision: 0, overrides: {
    ...custom, "member.rewards.storeCredit.title": "測試咖啡金", "member.dashboard.label.622f3c5acb": "枚",
    "member.referral.label.5b29dc001e": "KD弊", "member.rewards.kdPoints.title": "測試點",
  } });
  const reread = await copyStore.readMemberCenterCopy();
  check("every passbook/status key is editable and survives existing persistent copy storage", () => {
    assert.deepEqual(reread, stored);
    for (const item of passbookKeys) assert.equal(reread.overrides[item.key], custom[item.key]);
    assert.equal(reread.overrides["member.referral.label.5b29dc001e"], "KD弊");
    assert.equal(reread.overrides["member.dashboard.label.622f3c5acb"], "枚");
  });
  check("persisted templates render names amounts and page values together without rebuilding", () => {
    const output = render(createElement(Ledger, { initialPage: page }), reread.overrides);
    for (const text of ["編輯：後台調整測試咖啡金", "-5,000 枚", "編輯：餘額 5,000 枚", "編輯：第 1 頁", "編輯：上一頁", "編輯：下一頁"]) assert.ok(output.includes(text), text);
    assert.equal(resolveMemberCopy(reread.overrides, "credit.passbook.pageLabel", { page: 2 }), "編輯：第 2 頁");
  });
  check("technical reward/source codes never escape into member labels", () => {
    for (const code of ["admin_grant", "admin_deduct", "referral_reward", "retail_promotion", "self_purchase", "credit_release", "pending", "released", "cancelled", "reversed", "unknown_internal_type"]) {
      const output = render(createElement(MemberRewardCopyValue, { value: code }), reread.overrides);
      assert.ok(output && !output.includes(code), code);
    }
    const fallback = render(createElement(Ledger, { initialPage: { entries: [{ ...reward.entries[0], descriptionKey: "missing.internal.key" }], nextOffset: null } }));
    assert.ok(fallback.includes("抵用金入帳") && !fallback.includes("missing.internal.key"));
  });
  const ledgerAfter = JSON.stringify(await commerce.readMembershipCommerceState());
  check("read selectors/API do not mutate canonical ledger", () => assert.equal(ledgerAfter, ledgerBefore));
  console.log(`PASS ${checks} member credit passbook checks; real ledger/auth, temporary data only`);
} finally {
  delete globals.__creditTestCookie;
  await rm(root, { recursive: true, force: true });
}
