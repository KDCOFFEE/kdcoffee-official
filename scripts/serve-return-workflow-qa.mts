// Isolated local Owner visual-QA server. Never points at repository runtime storage.
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { registerEmailMember, createSessionToken, MEMBER_SESSION_COOKIE } from "../lib/memberAuth";
import { createAdminSessionValue, adminCookieName } from "../lib/adminAuth";
import { readMembershipCommerceState, recordValidConsumptionFromCompletedOrder } from "../lib/membershipCommerce";
import { prepareOrderCompletionWrite, type OrderCompletionSnapshot } from "../lib/orderCompletion";
import { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules } from "../lib/membershipBusinessRules";
import { memberReturnAction, adminReturnAction } from "../lib/returnWorkflow";

const qaRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6f1e-visual-"));
process.env.KD_DATA_DIR = qaRoot;
process.env.AUTH_SESSION_SECRET = randomBytes(40).toString("hex");
process.env.ADMIN_SESSION_SECRET = randomBytes(40).toString("hex");
process.env.MEMBER_IDENTITY_SECRET = randomBytes(40).toString("hex");
process.env.ADMIN_PASSWORD = "Return-QA-Owner-2026";
process.env.RETURN_REQUEST_LINE_NOTIFICATION_ENABLED = "false";
process.env.NEXT_TELEMETRY_DISABLED = "1";
const now = new Date(), original = new Date(now.getTime() - 2 * 86400000).toISOString(), completed = new Date(now.getTime() - 3600000).toISOString();
const rulesPath = path.join(qaRoot, "membership-commerce", "business-rules.json");
const rules = structuredClone(DEFAULT_MEMBERSHIP_RULES); rules.money.roundingMode = "round-half-up";
rules.referral.referralRewardCalculationMode = "pv";
rules.referral.selfPurchaseRewardRate = 5;
rules.referral.pvRewardMoneyValue = 2.5;
await saveMembershipBusinessRules({ expectedRevision: 0, rules, now: new Date(now.getTime() - 3 * 86400000) }, rulesPath);
const email = "return-qa@example.test", password = "Return-QA-Member-2026";
const member = await registerEmailMember(email, password); if (!member) throw new Error("Cannot create isolated QA member");
const ordersDir = path.join(qaRoot, "orders"); await fs.mkdir(ordersDir, { recursive: true });
const statePath = path.join(qaRoot, "membership-commerce", "commerce-state.json");
const state = await readMembershipCommerceState(statePath);
for (const sequence of [1, 2, 3]) {
  const orderNumber = `KD20261029-900${sequence}`, reservationId = `qa-reservation-${sequence}`;
  const base = { orderNumber, createdAt: original, status: "ready_for_pickup", orderMode: "studio_pickup", member: { memberId: member.id }, customer: { name: "退貨流程 QA 會員" },
    items: [{ slug: "qa-original-coffee", optionId: "half-pound", name: "原訂單咖啡（QA）", optionLabel: "半磅", quantity: 20, unitPrice: 10, lineTotal: 200, basePV: 10, effectivePV: 10 }], subtotal: 200, shipping: 0, totalBeforeCredit: 200, total: 100,
    credit: { appliedAmount: 100, reservationId, rulesVersion: 2 }, paymentDetails: { method: "cash_on_delivery", status: "paid" } };
  const saved = await prepareOrderCompletionWrite(base, { ...base, status: "completed", fulfillmentEvents: [{ eventId: `qa-completion-${sequence}`, state: "completed", occurredAt: completed }] });
  await fs.writeFile(path.join(ordersDir, orderNumber + ".json"), JSON.stringify(saved));
  for (const [suffix, expiresAt] of [["A", new Date(now.getTime() - 86400000).toISOString()], ["B", new Date(now.getTime() + 30 * 86400000).toISOString()]]) {
    const creditEntryId = `qa-${sequence}-${suffix}`;
    state.creditEntries[creditEntryId] = { creditEntryId, memberId: member.id, sourceType: "manual", sourceReference: `qa:${creditEntryId}`, amount: 50, remainingAmount: 0, issuedAt: original, expiresAt, status: "consumed", createdAt: original, metadata: {} };
  }
  state.creditReservations[reservationId] = { reservationId, memberId: member.id, orderId: orderNumber, requestedAmount: 100, amount: 100, allocations: [{ creditEntryId: `qa-${sequence}-A`, amount: 50 }, { creditEntryId: `qa-${sequence}-B`, amount: 50 }], status: "consumed", createdAt: original, updatedAt: original };
  state.referralRewards[`qa-reward-${sequence}`] = { rewardId: `qa-reward-${sequence}`, sourceOrderNumber: orderNumber, sourceMemberId: member.id, beneficiaryMemberId: member.id,
    rewardType: "self_purchase", referralLevel: 0, qualificationAuthority: "self_purchase_direct", qualificationStatus: "qualified", ancestrySnapshot: [],
    calculationMode: "pv", paidAmountBasis: 100, basePV: 200, effectivePV: 200, discountRatio: 1, rewardRate: 5, rewardPV: 10, pvRewardMoneyValue: rules.referral.pvRewardMoneyValue, calculatedCreditAmount: 25, projectedCreditAmount: 25, ruleVersion: 2,
    monthlyCapAmountSnapshot: 0, baseWaitingDaysSnapshot: 0, returnProtectionDaysSnapshot: 7, totalWaitingDaysSnapshot: 7, reversalPolicySnapshot: "cancel-pending-and-reverse-released",
    successfulPickupBusinessDate: completed.slice(0, 10), releaseEligibleBusinessDate: "2099-01-01", createdAt: completed, eligibleAt: completed, scheduledReleaseAt: "2099-01-01T00:00:00+08:00", releasedAt: null,
    sourceOrderFinalState: "completed", status: "scheduled", rewardCreditEntryId: null, reversalCreditEntryId: null, idempotencyKey: `qa-reward-${sequence}` };
}
await fs.writeFile(statePath, JSON.stringify(state));
for (const sequence of [1, 2, 3]) await recordValidConsumptionFromCompletedOrder({ memberId: member.id, orderId: `KD20261029-900${sequence}`,
  idempotencyKey: `qa-consumption-${sequence}`, now: new Date(completed) });
for (const sequence of [2, 3]) {
  const orderNumber = `KD20261029-900${sequence}`;
  const saved = JSON.parse(await fs.readFile(path.join(ordersDir, orderNumber + ".json"), "utf8"));
  const completion = saved.completion as OrderCompletionSnapshot; if (completion.returnLines?.status !== "resolved") throw new Error("Missing QA evidence");
  const values = { lines: [{ returnLineRef: completion.returnLines.lines[0].returnLineRef, quantity: 12 }], reason: "QA：商品不符需求", conditionAcknowledgement: { itemsComplete: true, unopenedUnusedWhereApplicable: true }, quantityAcknowledged: true };
  const preview = await memberReturnAction(orderNumber, member.id, { ...values, action: "preview" });
  const photo = sequence === 2 ? await sharp({ create: { width: 640, height: 480, channels: 3, background: "#c7b299" } }).png().toBuffer() : null;
  const created = await memberReturnAction(orderNumber, member.id, { ...values, action: "create", confirmationToken: preview.confirmationToken, finalConfirmation: true, idempotencyKey: `qa-return-${sequence}` },
    photo ? { photos: [new File([new Uint8Array(photo)], "QA-return-photo.png", { type: "image/png" })] } : {});
  if (sequence === 2) await adminReturnAction(orderNumber, "owner", { action: "lock", returnRequestId: created.returnRequestId, reason: "QA：正在確認商品狀況", idempotencyKey: "qa-processing" });
  if (sequence === 3) await adminReturnAction(orderNumber, "owner", { action: "approve", returnRequestId: created.returnRequestId, reason: "QA：核准部分退貨", idempotencyKey: "qa-approved" });
}
const port = Number(process.env.RETURN_QA_PORT || 3161), url = `http://localhost:${port}`;
await fs.mkdir("qa-output", { recursive: true });
await fs.writeFile("qa-output/j6f1e-visual-session.json", JSON.stringify({ qaRoot, url, email, password, adminPassword: process.env.ADMIN_PASSWORD,
  memberCookie: `${MEMBER_SESSION_COOKIE}=${createSessionToken(member.id)}`, adminCookie: `${adminCookieName}=${createAdminSessionValue({ adminId: "owner", role: "owner" })}` }));
console.log(`Isolated Owner visual QA: ${url}\nMember: ${email} / ${password}\nAdmin: ${process.env.ADMIN_PASSWORD}\nStorage: ${qaRoot}`);
console.log("Order 9001: no request. Quantity 6 gives normal dialog; quantity 12 gives expired-credit warning. Order 9002: processing/HOLD with a synthetic QA photo. Order 9003: self-purchase points 10 -> 4 (credit equivalent 25 -> 10 using original setting 2.5).");
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], { env: process.env, stdio: "inherit", windowsHide: true });
server.on("exit", code => { process.exitCode = code ?? 0; });
