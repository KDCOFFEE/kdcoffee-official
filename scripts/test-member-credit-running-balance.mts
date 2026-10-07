// node --experimental-strip-types --import ./scripts/credit-integration-test-bootstrap.mjs scripts/test-member-credit-running-balance.mts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CreditEntry, CreditReservation } from "../lib/membershipCommerce";
import { deriveMemberCreditBalances, type PassbookBalanceState } from "../lib/memberCreditRunningBalance";
import { selectMemberCreditPassbook } from "../lib/memberCreditPassbook";
import Provider from "../components/member/MemberCenterCopyProvider";
import Ledger from "../components/member/MemberCreditLedger";

const member = "running_fixture";
const date = (day: number) => new Date(Date.UTC(2026, 8, day, 3)).toISOString();
const entry = (id: string, amount: number, day: number): CreditEntry => ({ creditEntryId: id, memberId: member,
  sourceType: "member_reward", sourceReference: `fixture:${id}`, amount, remainingAmount: amount,
  issuedAt: date(day), createdAt: date(day), expiresAt: date(100), status: "available", metadata: {} });
const state = (entries: CreditEntry[], reservations: CreditReservation[] = []): PassbookBalanceState => ({
  creditEntries: Object.fromEntries(entries.map((item) => [item.creditEntryId, item])),
  creditReservations: Object.fromEntries(reservations.map((item) => [item.reservationId, item])),
});
const reservation = (id: string, source: string, amount: number, start: number, end: number, status: CreditReservation["status"]): CreditReservation => ({
  reservationId: id, memberId: member, orderId: `fixture:${id}`, requestedAmount: amount, amount,
  allocations: [{ creditEntryId: source, amount }], status, createdAt: date(start), updatedAt: date(end),
});
const balance = (input: PassbookBalanceState, id: string) => selectMemberCreditPassbook(input, member).entries
  .find((row) => row.date === input.creditEntries[id].createdAt)?.balanceAfter;
let checks = 0;
function check(label: string, assertion: () => void) { assertion(); checks++; console.log(`PASS ${checks}: ${label}`); }
const rewards = state([entry("a", 5, 1), entry("b", 15, 2), entry("c", 120, 3)]);
check("reward issuance derives 5 → 20 → 140 and displays newest first", () => {
  assert.deepEqual(selectMemberCreditPassbook(rewards, member).entries.map((row) => [row.change, row.balanceAfter]), [[120, 140], [15, 20], [5, 5]]);
});
check("whole ledger is chronological even when dictionary timestamps are out of order", () => {
  assert.deepEqual(selectMemberCreditPassbook(state([entry("c", 120, 3), entry("a", 5, 1), entry("b", 15, 2)]), member).entries,
    selectMemberCreditPassbook(rewards, member).entries);
});
check("same-millisecond rows use canonical append order, not random ID order", () => {
  const result = selectMemberCreditPassbook(state([entry("z_random", 5, 1), entry("a_random", 15, 1)]), member);
  assert.deepEqual(result.entries.map((row) => row.balanceAfter), [20, 5]);
});
check("known source remainder reduction is explained by reservations, not subtracted twice", () => {
  const grant = { ...entry("a", 100, 1), remainingAmount: 60 };
  const input = state([grant, entry("b", 15, 3)], [reservation("r", "a", 40, 2, 2, "reserved")]);
  assert.deepEqual(selectMemberCreditPassbook(input, member).entries.map((row) => row.balanceAfter), [75, 100]);
});
check("consumption remains deducted from its original reserve time", () => {
  const grant = { ...entry("a", 100, 1), remainingAmount: 60 };
  assert.equal(balance(state([grant, entry("b", 15, 4)], [reservation("r", "a", 40, 2, 3, "consumed")]), "b"), 75);
});
check("release restores available credit before later reward issuance", () => {
  const input = state([entry("a", 100, 1), entry("b", 15, 4)], [reservation("r", "a", 40, 2, 3, "released")]);
  assert.equal(balance(input, "b"), 115);
});
check("source expiry removes prior credit before later issuance", () => {
  const input = state([{ ...entry("a", 100, 1), expiresAt: date(2), status: "expired" }, entry("b", 15, 3)]);
  assert.deepEqual(selectMemberCreditPassbook(input, member).entries.map((row) => row.balanceAfter), [15, 100]);
});
check("release after expiry does not make expired credit available", () => {
  const input = state([{ ...entry("a", 100, 1), expiresAt: date(3), status: "expired" }, entry("b", 15, 5)], [reservation("r", "a", 40, 2, 4, "released")]);
  assert.equal(balance(input, "b"), 15);
});
check("Owner allocation is not a physical remainder rewrite or a second deduction", () => {
  const debit = { ...entry("debit", -40, 2), remainingAmount: 0, status: "consumed" as const,
    sourceReference: "admin_credit_adjustment:deduct:fixture", adjustmentAllocations: [{ creditEntryId: "a", amount: 40 }] };
  const input = state([entry("a", 100, 1), debit, entry("b", 15, 3)]);
  assert.deepEqual(selectMemberCreditPassbook(input, member).entries.map((row) => row.balanceAfter), [75, 60, 100]);
});
check("linked reversal respects already consumed credit and clamps its original source only", () => {
  const reverse = { ...entry("reverse", -100, 3), remainingAmount: 0, status: "consumed" as const,
    sourceReference: "referral_reward_reversal:fixture", metadata: { reversesCreditEntryId: "a" } };
  const input = state([{ ...entry("a", 100, 1), remainingAmount: 0, status: "consumed" }, reverse, entry("b", 15, 4)],
    [reservation("r", "a", 40, 2, 2, "consumed")]);
  assert.deepEqual(selectMemberCreditPassbook(input, member).entries.map((row) => row.balanceAfter), [15, 0, 100]);
});
check("unexplained old consumption does not produce invented historical balances", () => {
  const input = state([{ ...entry("a", 100, 1), remainingAmount: 40 }, entry("b", 15, 2)]);
  assert.equal(deriveMemberCreditBalances(input, member).reason, "unexplained_remaining_change");
  assert.ok(selectMemberCreditPassbook(input, member).entries.every((row) => row.balanceAfter === null));
});
check("unexplained consumed status is rejected even if the physical remainder is unchanged", () => {
  assert.equal(deriveMemberCreditBalances(state([{ ...entry("a", 100, 1), status: "consumed" }]), member).reason, "unexplained_status_change");
});
check("stored after-only snapshot is retained; surrounding contradiction is not guessed", () => {
  const input = state([{ ...entry("a", 5, 1), metadata: { balanceAfter: 105 } }, entry("b", 15, 2)]);
  assert.deepEqual(selectMemberCreditPassbook(input, member).entries.map((row) => row.balanceAfter), [null, 105]);
});
check("malformed snapshot falls back only to fully verified canonical replay", () => {
  const input = state([{ ...entry("a", 5, 1), metadata: { balanceBefore: 0, balanceAfter: 105 } }]);
  assert.equal(balance(input, "a"), 5);
});
check("same-timestamp reservation ambiguity preserves later derivable entries", () => {
  const input = state([{ ...entry("a", 100, 1), remainingAmount: 60 }, entry("b", 15, 2), entry("c", 5, 3)],
    [reservation("r", "a", 40, 2, 2, "reserved")]);
  assert.deepEqual(selectMemberCreditPassbook(input, member).entries.map((row) => row.balanceAfter), [80, null, 100]);
});
check("missing references and cross-member allocations fail closed", () => {
  const input = state([entry("a", 100, 1)], [reservation("r", "other", 40, 2, 2, "reserved")]);
  assert.equal(deriveMemberCreditBalances(input, member).reason, "incomplete_reservation");
});
check("whole-history balances remain correct on all three pages and after new arrivals", () => {
  const input = state(Array.from({ length: 45 }, (_, index) => entry(`r${index}`, 1, index + 1)));
  const a = selectMemberCreditPassbook(input, member);
  const b = selectMemberCreditPassbook(input, member, 0, a.nextCursor!);
  const c = selectMemberCreditPassbook(input, member, 0, b.nextCursor!);
  assert.deepEqual([a.entries.length, b.entries.length, c.entries.length], [20, 20, 5]);
  assert.deepEqual([...a.entries, ...b.entries, ...c.entries].map((row) => row.balanceAfter), Array.from({ length: 45 }, (_, index) => 45 - index));
  assert.equal(new Set([...a.entries, ...b.entries, ...c.entries].map((row) => row.date)).size, 45);
  assert.deepEqual(selectMemberCreditPassbook(input, member), a);
  input.creditEntries.new = entry("new", 10, 46);
  assert.deepEqual(selectMemberCreditPassbook(input, member, 0, a.nextCursor!), b);
});
check("same-timestamp pages follow append order and keep balances stable after another append", () => {
  const input = state(Array.from({ length: 45 }, (_, index) => entry(`same_${45 - index}`, 1, 1)));
  const a = selectMemberCreditPassbook(input, member);
  const b = selectMemberCreditPassbook(input, member, 0, a.nextCursor!);
  const c = selectMemberCreditPassbook(input, member, 0, b.nextCursor!);
  assert.deepEqual([...a.entries, ...b.entries, ...c.entries].map((row) => row.balanceAfter), Array.from({ length: 45 }, (_, index) => 45 - index));
  input.creditEntries.latest = entry("same_latest", 10, 1);
  assert.deepEqual(selectMemberCreditPassbook(input, member, 0, a.nextCursor!), b);
});
check("SSR labels every reward row with date description signed delta and named/unit balance", () => {
  const page = selectMemberCreditPassbook(rewards, member);
  // eslint-disable-next-line react/no-children-prop -- typed SSR fixture.
  const html = renderToStaticMarkup(createElement(Provider, { initialOverrides: { "member.dashboard.label.622f3c5acb": "枚", "credit.passbook.balance": "當時餘額 {amount}" }, children: createElement(Ledger, { initialPage: page }) }));
  assert.equal((html.match(/<time /g) ?? []).length, 3);
  for (const text of ["+120 枚", "+15 枚", "+5 枚", "當時餘額 140 枚", "當時餘額 20 枚", "當時餘額 5 枚"]) assert.ok(html.includes(text), text);
  assert.ok(!html.includes("餘額待確認") && !html.includes("部分早期"));
});
const fixtureBefore = JSON.stringify(rewards);
selectMemberCreditPassbook(rewards, member);
check("projection never writes snapshots or mutates canonical fixture", () => assert.equal(JSON.stringify(rewards), fixtureBefore));

const root = await mkdtemp(path.join(os.tmpdir(), "kd-running-balance-"));
process.env.KD_DATA_DIR = root;
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.AUTH_SESSION_SECRET = randomBytes(48).toString("hex");
process.env.MEMBER_IDENTITY_SECRET = randomBytes(48).toString("hex");
globalThis.fetch = async () => { throw new Error("Network forbidden in isolated fixture"); };
try {
  const commerce = await import("../lib/membershipCommerce");
  const identity = await import("../lib/memberIdentity");
  const liveMember = await identity.ensureLegacyCanonicalMember({ memberId: "running_live", identities: [{ provider: "email", subject: "running@example.test" }] });
  await commerce.issueCredit({ memberId: liveMember.memberId, sourceType: "member_reward", sourceReference: "running:reward1", amount: 100,
    idempotencyKey: "running-reward-1", now: new Date(date(1)) });
  const held = await commerce.reserveCredit({ memberId: liveMember.memberId, orderId: "running-fixture-order", requestedAmount: 40,
    merchandiseSubtotal: 1000, shipping: 0, idempotencyKey: "running-reserve", now: new Date(date(2)) });
  assert.equal(held.amount, 40);
  await commerce.issueCredit({ memberId: liveMember.memberId, sourceType: "referral", sourceReference: "running:reward2", amount: 15,
    idempotencyKey: "running-reward-2", now: new Date(date(3)) });
  let canonical = await commerce.readMembershipCommerceState();
  check("real canonical reserve plus new reward displays 75, not page-local 115", () => {
    assert.deepEqual(selectMemberCreditPassbook(canonical, liveMember.memberId).entries.map((row) => row.balanceAfter), [75, 100]);
  });
  await commerce.settleCreditReservation({ reservationId: held.reservationId, action: "release", reason: "isolated fixture", idempotencyKey: "running-release", now: new Date(date(4)) });
  await commerce.issueCredit({ memberId: liveMember.memberId, sourceType: "promotion", sourceReference: "retail_promotion_reward:running3", amount: 5,
    idempotencyKey: "running-reward-3", now: new Date(date(5)) });
  canonical = await commerce.readMembershipCommerceState();
  check("real canonical release then retail reward yields 120 while older after-balances remain", () => {
    assert.deepEqual(selectMemberCreditPassbook(canonical, liveMember.memberId).entries.map((row) => row.balanceAfter), [120, 75, 100]);
  });
  const file = path.join(root, "membership-commerce", "commerce-state.json");
  const bytes = await readFile(file, "utf8");
  selectMemberCreditPassbook(canonical, liveMember.memberId);
  const afterBytes = await readFile(file, "utf8");
  check("real stored canonical ledger remains byte-for-byte unchanged by display", () => {
    assert.equal(afterBytes, bytes);
    assert.equal(JSON.stringify(canonical), JSON.stringify(JSON.parse(bytes)));
  });
  console.log(`PASS ${checks} running-balance checks; isolated canonical operations only`);
} finally {
  assert.ok(root.startsWith(path.join(os.tmpdir(), "kd-running-balance-")));
  await rm(root, { recursive: true, force: true });
}
