// node --experimental-strip-types --import ./scripts/member-credit-entry-detail-test-bootstrap.mjs scripts/test-member-credit-entry-detail.mts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CreditEntry, ReferralReward, RetailPromotionReward } from "../lib/membershipCommerce";
import { selectMemberCreditEntryDetail, attachMemberCreditDetailProducts } from "../lib/memberCreditEntryDetail";
import { selectMemberCreditPassbook, type MemberCreditPassbookPage } from "../lib/memberCreditPassbook";
import Ledger from "../components/member/MemberCreditLedger";
import Detail from "../components/member/MemberCreditEntryDetail";
import Passbook from "../components/member/MemberCreditPassbook";
import Provider from "../components/member/MemberCenterCopyProvider";
import CopyManager from "../components/admin/MemberCenterCopyManager";
import { normalizeMemberCopyOverrides, MEMBER_CENTER_COPY_CATALOG } from "../lib/memberCenterCopy";

let checks = 0;
function check(label: string, verify: () => void) { verify(); console.log(`PASS ${++checks}: ${label}`); }
const root = await mkdtemp(path.join(os.tmpdir(), "kd-entry-detail-"));
process.env.KD_DATA_DIR = root;
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.AUTH_SESSION_SECRET = randomBytes(48).toString("hex");
process.env.MEMBER_IDENTITY_SECRET = randomBytes(48).toString("hex");
globalThis.fetch = async () => { throw new Error("Network forbidden in isolated fixture"); };
const globals = globalThis as typeof globalThis & { __creditTestCookie?: string; __passbookHookFixture?: HookFixture };
const commerce = await import("../lib/membershipCommerce");
const identity = await import("../lib/memberIdentity");
const auth = await import("../lib/memberAuth");
const store = await import("../lib/memberCreditPassbookStore");
const copyStore = await import("../lib/memberCenterCopyStore");
const { GET } = await import("../app/api/member/credit/history/route");
const at = (day: number) => new Date(Date.UTC(2026, 9, day, 3)).toISOString();
const credit = (id: string, amount: number, day: number, memberId: string, sourceType: CreditEntry["sourceType"], sourceReference: string): CreditEntry => ({
  creditEntryId: id, memberId, sourceType, sourceReference, amount, remainingAmount: Math.max(0, amount),
  issuedAt: at(day), createdAt: at(day), expiresAt: at(100), status: amount < 0 ? "consumed" : "available", metadata: {},
});
const reward = (id: string, entry: CreditEntry, order: string, self = false): ReferralReward => ({
  rewardId: id, sourceOrderNumber: order, sourceMemberId: self ? entry.memberId : "DOWNLINE_INTERNAL_ID", beneficiaryMemberId: entry.memberId,
  referralLevel: self ? 0 : 1, rewardType: self ? "self_purchase" : "repeat_purchase", calculationMode: "pv", paidAmountBasis: 100,
  basePV: 100, discountRatio: 1, effectivePV: 100, rewardRate: .05, rewardPV: entry.amount, pvRewardMoneyValue: 1,
  calculatedCreditAmount: entry.amount, ruleVersion: 1, ancestrySnapshot: ["PRIVATE_ANCESTRY"], createdAt: at(1), eligibleAt: at(1),
  scheduledReleaseAt: entry.createdAt, releasedAt: entry.createdAt, status: "released", rewardCreditEntryId: entry.creditEntryId,
  reversalCreditEntryId: null, idempotencyKey: "PRIVATE_REWARD_IDEMPOTENCY",
});
// Controlled React-hook fixture for real component state/event callbacks; not a browser/DOM test.
class HookFixture {
  slots: unknown[] = []; cursor = 0; effects: Array<() => void> = [];
  useState<T>(initial: T | (() => T)) {
    const index = this.cursor++;
    if (!(index in this.slots)) this.slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
    return [this.slots[index] as T, (next: T | ((value: T) => T)) => {
      this.slots[index] = typeof next === "function" ? (next as (value: T) => T)(this.slots[index] as T) : next;
    }] as const;
  }
  useRef<T>(value: T) { return this.useState({ current: value })[0]; }
  useId() { return this.useState("fixture-title")[0]; }
  useContext() { return {}; }
  useEffect(effect: () => void, deps: unknown[]) {
    const index = this.cursor++, previous = this.slots[index] as unknown[] | undefined;
    if (!previous || deps.some((value, position) => value !== previous[position])) this.effects.push(effect);
    this.slots[index] = deps;
  }
  render(render: () => unknown) { this.cursor = 0; globals.__passbookHookFixture = this; try { return render(); } finally { delete globals.__passbookHookFixture; } }
  flush() { const effects = this.effects.splice(0); for (const effect of effects) effect(); }
}
type Node = { type: unknown; props: Record<string, unknown> };
function nodes(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!isValidElement(tree)) return [];
  const node = tree as Node;
  return [node, ...nodes(node.props.children)];
}
const callback = (node: Node, name: string) => node.props[name] as (event?: unknown) => void | Promise<void>;
const render = (component: ReturnType<typeof createElement>, overrides: Record<string, string> = {}) =>
  // eslint-disable-next-line react/no-children-prop -- typed SSR Provider fixture.
  renderToStaticMarkup(createElement(Provider, { initialOverrides: overrides, children: component }));

try {
  const member = await identity.ensureLegacyCanonicalMember({ memberId: "detail_member", identities: [{ provider: "email", subject: "detail@example.test" }] });
  const other = await identity.ensureLegacyCanonicalMember({ memberId: "other_detail_member", identities: [{ provider: "email", subject: "other@example.test" }] });
  await auth.saveMember({ id: member.memberId, email: "detail@example.test", createdAt: at(1), lastLoginAt: at(1) });
  const state = await commerce.readMembershipCommerceState();
  const a = credit("PRIVATE_credit5", 5, 2, member.memberId, "referral", "referral_reward:PRIVATE_reward5");
  const b = credit("PRIVATE_credit15", 15, 3, member.memberId, "referral", "referral_reward:PRIVATE_reward15");
  const self = credit("PRIVATE_self", 20, 4, member.memberId, "member_reward", "referral_reward:PRIVATE_self_reward");
  const retail = credit("PRIVATE_retail", 25, 5, member.memberId, "promotion", "retail_promotion_reward:PRIVATE_retail_reward");
  const foreign = credit("PRIVATE_foreign", 999, 6, other.memberId, "referral", "referral_reward:PRIVATE_foreign_reward");
  const grant = credit("PRIVATE_admin", 100, 7, member.memberId, "manual", "admin_credit_adjustment:grant:fixture");
  const debit = credit("PRIVATE_debit", -5, 8, member.memberId, "manual", "admin_credit_adjustment:deduct:fixture");
  debit.adjustmentAllocations = [{ creditEntryId: grant.creditEntryId, amount: 5 }];
  state.creditEntries = Object.fromEntries([a, b, self, retail, foreign, grant, debit].map(e => [e.creditEntryId, e]));
  state.referralRewards = Object.fromEntries([reward("PRIVATE_reward5", a, "KD20261007-5"), reward("PRIVATE_reward15", b, "KD20261007-15"),
    reward("PRIVATE_self_reward", self, "KD20261007-20", true), reward("PRIVATE_foreign_reward", foreign, "KD20261007-999")].map(r => [r.rewardId, r]));
  const retailReward: RetailPromotionReward = { rewardId: "PRIVATE_retail_reward", sourceOrderNumber: "KD20261007-25", beneficiaryMemberId: member.memberId,
    referralCode: "PRIVATE_CODE", attributedAt: at(1), attributionExpiresAt: at(100), attributionSource: "member-share-link", eligibleMerchandiseAmount: 500,
    rewardRate: .05, rewardPV: 25, calculatedCreditAmount: 25, ruleVersion: 1, roundingModeSnapshot: "round-down", baseWaitingDaysSnapshot: 0,
    returnProtectionDaysSnapshot: 0, totalWaitingDaysSnapshot: 0, reversalPolicySnapshot: "cancel-pending-and-reverse-released",
    successfulCompletionAt: at(1), successfulPickupBusinessDate: "2026-10-01", releaseEligibleBusinessDate: "2026-10-05", createdAt: at(1),
    releasedAt: retail.createdAt, sourceOrderFinalState: "completed", status: "released", rewardCreditEntryId: retail.creditEntryId,
    reversalCreditEntryId: null, idempotencyKey: "PRIVATE_RETAIL_KEY" };
  state.retailPromotionRewards = { [retailReward.rewardId]: retailReward };
  state.updatedAt = at(8);
  const detail = (entry: CreditEntry) => selectMemberCreditEntryDetail(state, member.memberId, entry.creditEntryId);
  check("+5 maps only to its exact referral reward via reference and backlink", () => { assert.equal(detail(a)?.orderNumber, "KD20261007-5"); assert.equal(detail(a)?.creditAmount, 5); });
  check("+15 maps only to its own source, not the +5 source", () => { assert.equal(detail(b)?.orderNumber, "KD20261007-15"); assert.equal(detail(b)?.creditAmount, 15); });
  check("self-purchase maps to its canonical own-purchase source", () => assert.equal(detail(self)?.titleKey, "member.selfPurchase.title"));
  check("retail maps only to exact canonical retail source", () => { assert.equal(detail(retail)?.orderNumber, "KD20261007-25"); assert.equal(detail(retail)?.titleKey, "member.retailPromotion.title"); });
  check("Admin grant and deduct never gain fake reward actions", () => { assert.equal(detail(grant), null); assert.equal(detail(debit), null); });
  check("cross-member entry is uniformly unavailable", () => { assert.equal(detail(foreign), null); assert.equal(selectMemberCreditEntryDetail(state, member.memberId, "missing"), null); });
  const malformed = structuredClone(state); malformed.referralRewards.PRIVATE_reward5.rewardCreditEntryId = b.creditEntryId;
  check("matching amount/date cannot replace missing canonical backlink", () => assert.equal(selectMemberCreditEntryDetail(malformed, member.memberId, a.creditEntryId), null));
  malformed.referralRewards.PRIVATE_reward5 = { ...state.referralRewards.PRIVATE_reward5, beneficiaryMemberId: other.memberId };
  check("tampered source reference cannot reveal another beneficiary", () => assert.equal(selectMemberCreditEntryDetail(malformed, member.memberId, a.creditEntryId), null));
  const conflicting = structuredClone(state); conflicting.creditEntries[a.creditEntryId].metadata.orderId = "KD20261007-999";
  check("conflicting metadata order pointer is rejected rather than followed", () => assert.equal(selectMemberCreditEntryDetail(conflicting, member.memberId, a.creditEntryId), null));
  const reversed = structuredClone(state), reversal = credit("PRIVATE_reversal", -5, 9, member.memberId, "referral", "referral_reward_reversal:PRIVATE_reward5");
  reversal.metadata.reversesCreditEntryId = a.creditEntryId;
  reversed.creditEntries[reversal.creditEntryId] = reversal;
  reversed.referralRewards.PRIVATE_reward5.reversalCreditEntryId = reversal.creditEntryId;
  reversed.referralRewards.PRIVATE_reward5.status = "reversed";
  check("linked reversal retains exact source and signed canonical amount", () => {
    const detail = selectMemberCreditEntryDetail(reversed, member.memberId, reversal.creditEntryId);
    assert.equal(detail?.orderNumber, "KD20261007-5"); assert.equal(detail?.creditAmount, -5); assert.equal(detail?.statusKey, "member.rewards.label.2c0a067be7");
  });
  reversed.creditEntries[reversal.creditEntryId].metadata.reversesCreditEntryId = b.creditEntryId;
  check("reversal cannot claim a different original credit source", () => assert.equal(selectMemberCreditEntryDetail(reversed, member.memberId, reversal.creditEntryId), null));
  const legacy = structuredClone(state), legacyEntry = credit("PRIVATE_legacy", 5, 2, member.memberId, "referral", "referral_conversion:legacy_rel:KD20261007-5");
  legacy.creditEntries[legacyEntry.creditEntryId] = legacyEntry;
  legacy.referrals.legacy_rel = { relationshipId: "legacy_rel", referrerMemberId: member.memberId, referredMemberId: "DOWNLINE_INTERNAL_ID", referralCode: "PRIVATE_CODE", safeDisplayName: "PRIVATE_PERSON", status: "qualified", createdAt: at(1), updatedAt: at(2) };
  legacy.referralConversions.legacy_conversion = { conversionId: "legacy_conversion", relationshipId: "legacy_rel", orderId: "KD20261007-5", status: "rewarded", rewardCreditEntryId: legacyEntry.creditEntryId, pendingRewardAmount: 0, occurredAt: at(1) };
  check("legacy conversion uses exact relationship/order/credit link, with unrecorded points left unknown", () => {
    const detail = selectMemberCreditEntryDetail(legacy, member.memberId, legacyEntry.creditEntryId);
    assert.equal(detail?.orderNumber, "KD20261007-5"); assert.equal(detail?.rewardPoints, null); assert.ok(!JSON.stringify(detail).includes("PRIVATE_"));
  });
  legacy.referrals.legacy_rel.referrerMemberId = other.memberId;
  check("legacy relationship belonging to another referrer has no detail", () => assert.equal(selectMemberCreditEntryDetail(legacy, member.memberId, legacyEntry.creditEntryId), null));
  const arbitrary = credit("metadata_only", 5, 2, member.memberId, "member_reward", "unknown"); arbitrary.metadata.orderId = "KD20261007-999";
  check("metadata-only order ID and a grant's redemption reservation do not fabricate a source", () => {
    assert.equal(selectMemberCreditEntryDetail({ ...state, creditEntries: { ...state.creditEntries, metadata_only: arbitrary } }, member.memberId, arbitrary.creditEntryId), null);
  });
  const products = attachMemberCreditDetailProducts(detail(a)!, { orderNumber: "KD20261007-5", customer: { name: "PRIVATE_CUSTOMER" }, adminNotes: "PRIVATE_ADMIN_NOTES",
    items: [{ name: "莫內花語", optionLabel: "半磅咖啡豆", quantity: 1, privateCalculation: "PRIVATE_CALC" }] });
  check("product projection excludes customer/admin/calculation data", () => {
    assert.equal(products.products[0].name, "莫內花語"); assert.ok(!JSON.stringify(products).includes("PRIVATE_"));
    assert.equal(attachMemberCreditDetailProducts(detail(a)!, { orderNumber: "KD20261007-999", items: [{ name: "FOREIGN_PRODUCT" }] }).products.length, 0);
  });
  const row = { ...selectMemberCreditPassbook(state, member.memberId).entries.find(e => e.change === 5)!, detail: products };
  const html5 = render(createElement(Detail, { entry: row, onDismiss() {}, pointDisplayName: "PV" }));
  const html15 = render(createElement(Detail, { entry: selectMemberCreditPassbook(state, member.memberId).entries.find(e => e.change === 15)!, onDismiss() {} }));
  check("actual detail SSR contains one +5 source and no unrelated +15 or foreign source", () => { assert.ok(html5.includes("KD20261007-5") && html5.includes("+5 PV") && html5.includes("莫內花語")); assert.ok(!html5.includes("KD20261007-15") && !html5.includes("999")); });
  check("actual +15 detail SSR excludes +5 source", () => { assert.ok(html15.includes("KD20261007-15")); assert.ok(!html15.includes("KD20261007-5")); });
  for (const [value, order] of [[self, "KD20261007-20"], [retail, "KD20261007-25"]] as const) check(`${value.sourceType} SSR displays only selected source`, () => {
    const row = selectMemberCreditPassbook(state, member.memberId).entries.find(e => e.change === value.amount)!;
    const html = render(createElement(Detail, { entry: row, onDismiss() {} })); assert.ok(html.includes(order)); assert.ok(!html.includes("KD20261007-5"));
  });
  const ownPage = selectMemberCreditPassbook(state, member.memberId);
  const listHtml = render(createElement(Ledger, { initialPage: ownPage }));
  check("only four traceable sources show row detail buttons; amounts/balances remain unchanged", () => {
    assert.equal((listHtml.match(/class="entryAction"/g) ?? []).length, 4);
    assert.deepEqual(ownPage.entries.map(e => e.balanceAfter), [160, 165, 65, 40, 20, 5]);
  });
  const overrides: Record<string, string> = { "member.rewards.storeCredit.title": "測試咖啡金", "member.dashboard.label.622f3c5acb": "枚", "member.rewards.kdPoints.title": "咖啡點",
    "credit.passbook.entryDetails": "看這一筆", "credit.passbook.detail.creditAmount": "本笔{creditName}", "credit.passbook.detail.status": "驗收狀態" };
  check("shared names units point names and explicit copy keys apply to detail", () => {
    const html = render(createElement(Detail, { entry: row, onDismiss() {}, pointDisplayName: "PV" }), overrides);
    for (const value of ["本笔測試咖啡金", "+5 枚", "+5 咖啡點", "驗收狀態", "餘額 5 枚"]) assert.ok(html.includes(value), value);
    assert.ok(render(createElement(Ledger, { initialPage: ownPage }), overrides).includes("看這一筆"));
  });
  await copyStore.saveMemberCenterCopy({ expectedRevision: 0, overrides });
  check("existing Admin copy storage retains all new templates and historical KD弊/枚", () => {
    const normalized = normalizeMemberCopyOverrides({ ...overrides, "member.referral.label.5b29dc001e": "KD弊" });
    assert.equal(normalized["member.referral.label.5b29dc001e"], "KD弊"); assert.equal(normalized["member.dashboard.label.622f3c5acb"], "枚");
    for (const key of Object.keys(overrides)) assert.equal(normalized[key], overrides[key]);
  });
  const storedCopy = await copyStore.readMemberCenterCopy();
  check("new copy survives actual save/read and catalog exposes every new field", () => {
    assert.deepEqual(storedCopy.overrides, overrides);
    for (const key of ["entryDetails", "entryDetailsAria", "detail.status", "detail.createdAt", "detail.creditAmount", "detail.status.expired"]) assert.ok(MEMBER_CENTER_COPY_CATALOG.some(e => e.key === `credit.passbook.${key}`));
  });
  const adminFixture = new HookFixture();
  const drawAdmin = () => adminFixture.render(() => CopyManager({ initialRevision: 0, initialOverrides: {} }));
  let adminTree = drawAdmin();
  callback(nodes(adminTree).find(n => n.type === "select")!, "onChange")({ target: { value: "storeCredit" } }); adminTree = drawAdmin();
  check("actual Admin editor exposes all six new fields in the existing credit group", () => {
    for (const key of ["entryDetails", "entryDetailsAria", "detail.status", "detail.createdAt", "detail.creditAmount", "detail.status.expired"]) assert.ok(nodes(adminTree).some(n => n.type === "input" && n.props.id === `credit.passbook.${key}`));
  });
  callback(nodes(adminTree).find(n => n.props.id === "credit.passbook.entryDetails")!, "onChange")({ target: { value: "測試單筆按鈕" } }); adminTree = drawAdmin();
  check("actual Admin field edit updates its existing override state", () => assert.equal(nodes(adminTree).find(n => n.props.id === "credit.passbook.entryDetails")?.props.value, "測試單筆按鈕"));
  const stateFile = path.join(root, "membership-commerce/commerce-state.json");
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, JSON.stringify(state));
  await mkdir(path.join(root, "orders"), { recursive: true });
  await writeFile(path.join(root, "orders/KD20261007-5.json"), JSON.stringify({ orderNumber: "KD20261007-5", items: products.products, customer: "PRIVATE_CUSTOMER" }));
  const bytesBefore = await readFile(stateFile, "utf8");
  const hydrated = await store.getMemberCreditPassbook(member.memberId);
  check("real store hydrates only exact selected source's member-safe products", () => assert.equal(hydrated.entries.find(e => e.change === 5)?.detail?.products[0].name, "莫內花語"));
  delete globals.__creditTestCookie;
  const unauthorized = await GET(new Request("http://localhost/api/member/credit/history"));
  check("unauthenticated history API cannot return source data", () => assert.equal(unauthorized.status, 401));
  globals.__creditTestCookie = auth.createSessionToken(member.memberId);
  const response = await GET(new Request("http://localhost/api/member/credit/history?rewardId=PRIVATE_foreign_reward&sourceId=PRIVATE_foreign&orderId=KD20261007-999"));
  const payload: MemberCreditPassbookPage = await response.json();
  check("tampered client IDs cannot select any foreign source; API uses current session only", () => {
    assert.equal(response.status, 200); const serialized = JSON.stringify(payload);
    for (const secret of ["PRIVATE_", "KD20261007-999", "customer", "metadata", "idempotency", "sourceMemberId", "beneficiaryMemberId", "rewardId", "creditEntryId"]) assert.ok(!serialized.includes(secret), secret);
    assert.equal(payload.entries.length, 6);
  });
  check("full-detail header remains a navigation link separate from row buttons", () => {
    const html = render(createElement(Passbook, { initialPage: ownPage, availableCredit: 160 }));
    assert.ok(html.includes('href="/member?rewardView=released#rewards"')); assert.equal((html.match(/class="entryAction"/g) ?? []).length, 4);
  });

  // Exercise actual Ledger + Detail callbacks with controlled hook and native-dialog seams.
  const more = structuredClone(state); more.creditEntries = {};
  for (let n = 1; n <= 45; n++) more.creditEntries[`row${n}`] = { ...a, creditEntryId: `row${n}`, amount: 1, remainingAmount: 1, createdAt: at(n) };
  // Exact backlinks must remain unique, so use own verified detail on the first row of each UI page fixture only.
  const first = selectMemberCreditPassbook(more, member.memberId), second = selectMemberCreditPassbook(more, member.memberId, 0, first.nextCursor!);
  first.entries[0].detail = products; second.entries[0].detail = products;
  const third = selectMemberCreditPassbook(more, member.memberId, 0, second.nextCursor!);
  const fixture = new HookFixture(), scrollArea = { current: { scrollTop: 0 } as HTMLDivElement };
  let pageChangeCalls = 0, requests = 0;
  const draw = () => fixture.render(() => Ledger({ initialPage: first, scrollArea, onPageChange: () => { pageChangeCalls++; scrollArea.current.scrollTop = 0; } }));
  const next = (tree: unknown) => nodes(tree).filter(n => n.type === "button" && !n.props["aria-haspopup"]).at(-1)!;
  const detailNode = (tree: unknown) => nodes(tree).find(n => n.type === Detail)!;
  const pageNumber = (tree: unknown) => (nodes(tree).find(n => (n.props.copyKey === "credit.passbook.pageLabel"))!.props.values as { page: number }).page;
  const parent = { open: true };
  const openAndDismiss = (tree: unknown, mode: "X" | "Esc" | "backdrop", expectedPage: number, top: number) => {
    scrollArea.current.scrollTop = top;
    const action = nodes(tree).find(n => n.props.className === "entryAction")!;
    let focused = false; const trigger = { focus(options: FocusOptions) { assert.equal(options.preventScroll, true); focused = true; } };
    callback(action, "onClick")({ currentTarget: trigger });
    const opened = draw(); assert.equal(pageNumber(opened), expectedPage);
    const props = detailNode(opened).props as Parameters<typeof Detail>[0];
    const detailFixture = new HookFixture(); const dialogTree = detailFixture.render(() => Detail(props)) as Node;
    let stopped = false, prevented = false;
    const event = { stopPropagation() { stopped = true; }, preventDefault() { prevented = true; }, clientX: -1, clientY: -1, target: null as unknown, currentTarget: null as unknown };
    const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; callback(dialogTree, "onClose")(event); }, getBoundingClientRect: () => ({ left: 0, right: 500, top: 0, bottom: 500 }) };
    (dialogTree.props.ref as { current: unknown }).current = dialog; detailFixture.flush(); assert.equal(dialog.open, true);
    if (mode === "X") callback(nodes(dialogTree).find(n => n.type === "button")!, "onClick")();
    else if (mode === "Esc") { callback(dialogTree, "onCancel")(event); assert.equal(prevented, true); }
    else { event.target = dialog; event.currentTarget = dialog; callback(dialogTree, "onClick")(event); }
    assert.equal(stopped, true); assert.equal(dialog.open, false); assert.equal(parent.open, true); assert.equal(focused, true);
    const closed = draw(); assert.equal(pageNumber(closed), expectedPage); assert.equal(detailNode(closed).props.entry, null);
    assert.equal(scrollArea.current.scrollTop, top); return closed;
  };
  let tree = draw(); tree = openAndDismiss(tree, "X", 1, 310);
  check("page 1 X close retains parent modal/page/scroll and restores entry focus", () => assert.equal(pageChangeCalls, 0));
  globalThis.fetch = async () => { requests++; return new Response(JSON.stringify(requests === 1 ? second : third)); };
  await callback(next(tree), "onClick")(); await new Promise(resolve => setImmediate(resolve)); tree = draw();
  check("page 2 is loaded once and retains 20-row pagination", () => { assert.equal(pageNumber(tree), 2); assert.equal(nodes(tree).filter(n => n.type === "li").length, 20); assert.equal(requests, 1); });
  const cacheBefore = JSON.stringify(fixture.slots[0]);
  tree = openAndDismiss(tree, "X", 2, 620);
  check("page 2 X preserves midpoint, exact ledger cache and does not refetch", () => { assert.equal(requests, 1); assert.equal(JSON.stringify(fixture.slots[0]), cacheBefore); });
  tree = openAndDismiss(tree, "Esc", 2, 620);
  check("Esc follows the same close/focus/return path without bubbling to parent", () => { assert.equal(requests, 1); assert.equal(JSON.stringify(fixture.slots[0]), cacheBefore); });
  tree = openAndDismiss(tree, "backdrop", 2, 620);
  check("supported backdrop dismissal returns identically", () => assert.equal(requests, 1));
  const previous = nodes(tree).find(n => n.type === "button" && !n.props["aria-haspopup"])!;
  callback(previous, "onClick")(); tree = draw(); await callback(next(tree), "onClick")(); tree = draw();
  check("visited next page reuses the same page cache after detail round trip", () => { assert.equal(pageNumber(tree), 2); assert.equal(requests, 1); });
  const source = readFileSync("components/member/MemberReferralCenter.tsx", "utf8"), css = readFileSync("components/member/MemberCreditPassbook.module.css", "utf8");
  check("reward Details/pending have no general ledger dependency", () => { assert.ok(!source.includes("MemberCreditLedger")); assert.ok(source.includes('rewardView === "pending"')); });
  check("mobile action and balance use distinct cells and narrow separate lines", () => {
    assert.ok(css.includes(".row:has(.entryAction) .balance { grid-column:2; grid-row:3; }"));
    assert.ok(css.includes(".row:has(.entryAction) .balance { grid-column:1 / -1; grid-row:4; }"));
    assert.ok(css.includes("min-height:36px") && css.includes("overflow-wrap:anywhere"));
  });
  check("projection/API/return state never modify the canonical ledger", () => assert.equal(bytesBefore, readFileSync(stateFile, "utf8")));
  console.log(`PASS ${checks} single-entry detail checks; isolated data + real component callbacks, no browser claim`);
} finally {
  delete globals.__passbookHookFixture; delete globals.__creditTestCookie;
  assert.ok(root.startsWith(path.join(os.tmpdir(), "kd-entry-detail-")));
  await rm(root, { recursive: true, force: true });
}
