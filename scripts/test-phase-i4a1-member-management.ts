import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = await mkdtemp(path.join(os.tmpdir(), "kd-phase-i4a1-"));
process.env.KD_DATA_DIR = root;
process.env.AUTH_SESSION_SECRET = "phase-i4a1-test-secret-longer-than-thirty-two-characters";

const identity = await import("../lib/memberIdentity");
const rulesModule = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");
const management = await import("../lib/adminMemberManagement");

let checks = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  checks += 1;
  console.log(`PASS ${String(checks).padStart(2, "0")} ${name}`);
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

try {
  const emailCanonical = await identity.ensureLegacyCanonicalMember({ memberId: "member_email_owner_test", identities: [{ provider: "email", subject: "owner-test@example.test" }] });
  const lineCanonical = await identity.ensureLegacyCanonicalMember({ memberId: "member_line_owner_test", identities: [{ provider: "line", subject: "line-secret-subject" }] });
  const joined = "2026-08-01T01:00:00.000Z";
  await writeJson(path.join(root, "members", `${emailCanonical.memberId}.json`), {
    id: emailCanonical.memberId, memberNumber: emailCanonical.memberNumber, displayName: "Email 測試會員", pickupName: "王測試", email: "owner-test@example.test", loginEmail: "owner-test@example.test", phone: "0912345678", authProvider: "email", passwordHash: "NEVER_EXPOSE_HASH", passwordSalt: "NEVER_EXPOSE_SALT", passwordResetTokenHash: "NEVER_EXPOSE_RESET", createdAt: joined, lastLoginAt: joined,
  });
  await writeJson(path.join(root, "members", `${lineCanonical.memberId}.json`), {
    id: lineCanonical.memberId, memberNumber: lineCanonical.memberNumber, displayName: "LINE 測試會員", lineUserId: "NEVER_EXPOSE_LINE_SUBJECT", authProvider: "line", createdAt: "2026-08-02T01:00:00.000Z", lastLoginAt: joined,
  });
  await writeJson(path.join(root, "orders", "KD-TEST-OWNER.json"), {
    orderNumber: "KD-TEST-OWNER", createdAt: "2026-08-10T01:00:00.000Z", status: "completed", orderMode: "711_cod", total: 650, payment: "cash_on_delivery", customer: { name: "王測試", email: "owner-test@example.test", phone: "0912345678" }, member: { memberId: emailCanonical.memberId },
  });
  await rulesModule.saveMembershipBusinessRules({ expectedRevision: 0, rules: structuredClone(rulesModule.DEFAULT_MEMBERSHIP_RULES), now: new Date("2026-08-01T00:00:00.000Z") });

  const list = await management.getAdminMemberList();
  check("B member list projection uses canonical members", list.total === 2 && list.rows.length === 2);
  const emailRow = list.rows.find((row) => row.memberId === emailCanonical.memberId)!;
  check("C member search finds name email phone and member number", (await management.getAdminMemberList({ query: "王測試" })).rows.length === 1 && (await management.getAdminMemberList({ query: "owner-test@" })).rows.length === 1 && (await management.getAdminMemberList({ query: "091234" })).rows.length === 1 && (await management.getAdminMemberList({ query: emailCanonical.memberNumber })).rows.length === 1);
  check("B list computes order count and lifetime spend", emailRow.orderCount === 1 && emailRow.lifetimeSpend === 650);
  check("E zero-credit member projects zero", emailRow.availableCredit === 0);
  check("O Email-only identity is safe", emailRow.loginMethods.length === 1 && emailRow.loginMethods[0] === "email");
  check("P LINE-only identity is safe", list.rows.find((row) => row.memberId === lineCanonical.memberId)?.loginMethods.join() === "line");

  const emptyDetail = await management.getAdminMemberDetail(emailCanonical.memberId);
  check("D member detail projects canonical order", emptyDetail?.orders[0]?.orderNumber === "KD-TEST-OWNER");
  check("M member without subscription renders safely", emptyDetail?.subscriptions.length === 0);
  check("N member without referral renders safely", emptyDetail?.referral.directReferrals.length === 0 && emptyDetail.referral.referrerMemberNumber === null);
  const serializedProjection = JSON.stringify({ list, emptyDetail });
  check("Q Admin projection excludes authentication secrets", !["NEVER_EXPOSE_HASH", "NEVER_EXPOSE_SALT", "NEVER_EXPOSE_RESET", "NEVER_EXPOSE_LINE_SUBJECT"].some((secret) => serializedProjection.includes(secret)));

  const grant = await commerce.adjustMemberCreditByAdmin({ memberId: emailCanonical.memberId, direction: "grant", amount: 100, reason: "隔離測試新增", note: "fixture only", idempotencyKey: "admin-grant-owner-test", now: new Date("2026-08-20T01:00:00.000Z") });
  check("F grant appends canonical positive credit", grant.entry.amount === 100 && grant.balanceBefore === 0 && grant.balanceAfter === 100);
  const grantReplay = await commerce.adjustMemberCreditByAdmin({ memberId: emailCanonical.memberId, direction: "grant", amount: 999, reason: "重送不得改值", idempotencyKey: "admin-grant-owner-test", now: new Date("2026-08-20T01:00:01.000Z") });
  let state = await commerce.readMembershipCommerceState();
  check("J duplicate submission is idempotent", grantReplay.entry.creditEntryId === grant.entry.creditEntryId && Object.values(state.creditEntries).filter((entry) => entry.sourceReference.includes("admin-grant-owner-test")).length === 1);
  check("K grant creates Admin audit event", state.audit.some((item) => item.entityId === grant.entry.creditEntryId && item.actor === "admin" && item.action === "credit-adjustment-granted"));

  const deduct = await commerce.adjustMemberCreditByAdmin({ memberId: emailCanonical.memberId, direction: "deduct", amount: 40, reason: "隔離測試扣除", idempotencyKey: "admin-deduct-owner-test", now: new Date("2026-08-21T01:00:00.000Z") });
  state = await commerce.readMembershipCommerceState();
  check("G deduction appends canonical negative credit", deduct.entry.amount === -40 && deduct.entry.adjustmentAllocations?.[0]?.creditEntryId === grant.entry.creditEntryId);
  check("G deduction does not rewrite old ledger row", state.creditEntries[grant.entry.creditEntryId].amount === 100 && state.creditEntries[grant.entry.creditEntryId].remainingAmount === 100);
  check("L credit balance recomputes from ledger allocations", await commerce.getAvailableCredit(emailCanonical.memberId, new Date("2026-08-21T01:00:01.000Z")) === 60);
  check("K deduction creates Admin audit event", state.audit.some((item) => item.entityId === deduct.entry.creditEntryId && item.actor === "admin" && item.action === "credit-adjustment-deducted"));

  await assert.rejects(commerce.adjustMemberCreditByAdmin({ memberId: emailCanonical.memberId, direction: "grant", amount: 0, reason: "不合法", idempotencyKey: "invalid-zero-test" }), commerce.MembershipCommerceError);
  await assert.rejects(commerce.adjustMemberCreditByAdmin({ memberId: emailCanonical.memberId, direction: "grant", amount: Number.NaN, reason: "不合法", idempotencyKey: "invalid-nan-test" }), commerce.MembershipCommerceError);
  check("H invalid amount is rejected server-side", true);
  await assert.rejects(commerce.adjustMemberCreditByAdmin({ memberId: emailCanonical.memberId, direction: "deduct", amount: 61, reason: "不可透支", idempotencyKey: "excessive-deduct-test" }), commerce.MembershipCommerceError);
  check("I excessive deduction is rejected", await commerce.getAvailableCredit(emailCanonical.memberId, new Date("2026-08-21T01:00:01.000Z")) === 60);

  const reservation = await commerce.reserveCredit({ memberId: emailCanonical.memberId, orderId: "KD-CREDIT-CHECKOUT", requestedAmount: 60, merchandiseSubtotal: 500, shipping: 0, idempotencyKey: "owner-checkout-reserve", now: new Date("2026-08-22T01:00:00.000Z") });
  check("R checkout reserves only effective post-deduction balance", reservation.amount === 60 && await commerce.getAvailableCredit(emailCanonical.memberId, new Date("2026-08-22T01:00:01.000Z")) === 0);
  await commerce.settleCreditReservation({ reservationId: reservation.reservationId, action: "release", reason: "隔離測試取消", idempotencyKey: "owner-checkout-release", now: new Date("2026-08-22T02:00:00.000Z") });
  check("R checkout release restores effective balance once", await commerce.getAvailableCredit(emailCanonical.memberId, new Date("2026-08-22T02:00:01.000Z")) === 60);

  const concurrent = await Promise.all([1, 2, 3].map(() => commerce.adjustMemberCreditByAdmin({ memberId: lineCanonical.memberId, direction: "grant", amount: 25, reason: "併發測試", idempotencyKey: "concurrent-grant-test", now: new Date("2026-08-23T01:00:00.000Z") })));
  state = await commerce.readMembershipCommerceState();
  check("J concurrent duplicate grant creates exactly one entry", new Set(concurrent.map((item) => item.entry.creditEntryId)).size === 1 && Object.values(state.creditEntries).filter((entry) => entry.memberId === lineCanonical.memberId).length === 1);

  const updatedDetail = await management.getAdminMemberDetail(emailCanonical.memberId);
  check("D detail shows credit and audit projections", updatedDetail?.credits.length === 2 && updatedDetail.audit.some((item) => item.action === "credit-adjustment-deducted"));
  const routeSource = await readFile(path.join(process.cwd(), "app", "api", "admin", "members", "[memberId]", "credit", "route.ts"), "utf8");
  check("A Admin authorization and explicit confirmation guard the mutation route", routeSource.includes("isAdminAuthenticated") && routeSource.includes("CONFIRM_CREDIT_ADJUSTMENT") && routeSource.includes("isSameOrigin"));

  console.log(`\nPhase I.4A.1 Member Management: ${checks} checks PASS`);
} finally {
  await rm(root, { recursive: true, force: true });
}
