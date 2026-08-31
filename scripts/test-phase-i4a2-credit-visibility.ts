import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = await mkdtemp(path.join(os.tmpdir(), "kd-phase-i4a2-"));
process.env.KD_DATA_DIR = root;
process.env.AUTH_SESSION_SECRET = "phase-i4a2-test-secret-longer-than-thirty-two-characters";

const identity = await import("../lib/memberIdentity");
const rulesModule = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");
const { projectOrderFinancialBreakdown } = await import("../lib/orderFinancialProjection");

let checks = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  checks += 1;
  console.log(`PASS ${String(checks).padStart(2, "0")} ${name}`);
}

try {
  const creditedOrder = { subtotal: 500, shipping: 60, totalBeforeCredit: 560, total: 460, credit: { reservationId: "reserve-proof", appliedAmount: 100 } };
  const credited = projectOrderFinancialBreakdown(creditedOrder);
  check("order with credit projects 500 + 60 - 100 = 460 from snapshot", credited.subtotal === 500 && credited.shipping === 60 && credited.creditApplied === 100 && credited.total === 460 && credited.creditEvidence === "order-snapshot");

  const withoutCredit = projectOrderFinancialBreakdown({ subtotal: 500, shipping: 60, total: 560 });
  check("order without credit does not show a fake zero deduction", withoutCredit.creditApplied === null && withoutCredit.total === 560);

  const inferredOnly = projectOrderFinancialBreakdown({ subtotal: 500, shipping: 60, total: 460 });
  check("credit is never inferred from subtotal plus shipping minus total", inferredOnly.creditApplied === null);

  const memberRouteSource = await readFile(path.join(process.cwd(), "app", "api", "orders", "[orderNumber]", "messages", "route.ts"), "utf8");
  const memberViewSource = await readFile(path.join(process.cwd(), "components", "orders", "OrderConversation.tsx"), "utf8");
  check("Member order projection exposes canonical credit deduction", memberRouteSource.includes("projectOrderFinancialBreakdown") && memberViewSource.includes("會員抵用金") && memberViewSource.includes("financialBreakdown.creditApplied"));

  const adminViewSource = await readFile(path.join(process.cwd(), "app", "admin", "orders", "[orderNumber]", "page.tsx"), "utf8");
  check("Admin order projection exposes canonical credit deduction", adminViewSource.includes("projectOrderFinancialBreakdown") && adminViewSource.includes("會員抵用金折抵"));

  const legacy = projectOrderFinancialBreakdown({ subtotal: 320, shipping: 0, total: 320, credit: { appliedAmount: 80 } });
  check("legacy order without durable reservation proof remains compatible", legacy.total === 320 && legacy.creditApplied === null);

  const acceptanceOrder = JSON.parse(await readFile(path.join(process.cwd(), "data", "orders", "KD20260831-9263.json"), "utf8"));
  const acceptance = projectOrderFinancialBreakdown(acceptanceOrder);
  check("existing acceptance order contains durable canonical proof", acceptance.subtotal === 500 && acceptance.shipping === 60 && acceptance.creditApplied === 100 && acceptance.total === 460);

  const canonical = await identity.ensureLegacyCanonicalMember({ memberId: "member_phase_i4a2", identities: [{ provider: "email", subject: "phase-i4a2@example.test" }] });
  await rulesModule.saveMembershipBusinessRules({ expectedRevision: 0, rules: structuredClone(rulesModule.DEFAULT_MEMBERSHIP_RULES), now: new Date("2026-08-01T00:00:00.000Z") });
  const grant = await commerce.adjustMemberCreditByAdmin({ memberId: canonical.memberId, direction: "grant", amount: 100, reason: "INTERNAL_OWNER_REASON_MUST_NOT_LEAK", note: "RAW_PRIVATE_NOTE_MUST_NOT_LEAK", idempotencyKey: "SECURITY_IDEMPOTENCY_KEY_MUST_NOT_LEAK", now: new Date("2026-08-20T01:00:00.000Z") });
  const reservation = await commerce.reserveCredit({ memberId: canonical.memberId, orderId: "KD20260831-9263", requestedAmount: 100, merchandiseSubtotal: 500, shipping: 60, idempotencyKey: "checkout-secret-key", now: new Date("2026-08-31T01:00:00.000Z") });
  const dashboard = await commerce.getMemberCommerceDashboard(canonical.memberId, new Date("2026-08-31T01:01:00.000Z"));
  const history = dashboard.credits.find((entry) => entry.creditEntryId === grant.entry.creditEntryId);
  check("Member credit history explains canonical reservation allocation", history?.sourceLabel === "KD Coffee 贈送" && history.remainingAmount === 0 && history.orderRedemptions.length === 1 && history.orderRedemptions[0].orderNumber === "KD20260831-9263" && history.orderRedemptions[0].amount === 100 && history.orderRedemptions[0].status === "reserved");

  const serialized = JSON.stringify(dashboard);
  check("Member projection excludes internal Admin reason", !serialized.includes("INTERNAL_OWNER_REASON_MUST_NOT_LEAK") && !serialized.includes("RAW_PRIVATE_NOTE_MUST_NOT_LEAK"));
  check("Member projection excludes idempotency and raw security metadata", !serialized.includes("SECURITY_IDEMPOTENCY_KEY_MUST_NOT_LEAK") && !serialized.includes("checkout-secret-key") && !serialized.includes("metadata") && !serialized.includes("sourceReference"));

  await commerce.settleCreditReservation({ reservationId: reservation.reservationId, action: "consume", idempotencyKey: "consume-once", reason: "completed", now: new Date("2026-09-01T01:00:00.000Z") });
  const firstState = await commerce.readMembershipCommerceState();
  await commerce.settleCreditReservation({ reservationId: reservation.reservationId, action: "consume", idempotencyKey: "consume-once", reason: "completed", now: new Date("2026-09-01T01:01:00.000Z") });
  const secondState = await commerce.readMembershipCommerceState();
  check("retry does not double-consume credit", firstState.creditEntries[grant.entry.creditEntryId].remainingAmount === 0 && secondState.creditEntries[grant.entry.creditEntryId].remainingAmount === 0 && secondState.creditReservations[reservation.reservationId].status === "consumed");

  console.log(`\nPhase I.4A Round 2 credit visibility: ${checks} checks passed.`);
} finally {
  await rm(root, { recursive: true, force: true });
}
