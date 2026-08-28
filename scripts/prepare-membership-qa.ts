import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const target = process.env.QA_DATA_DIR;
if (!target || !path.basename(target).startsWith("kd-membership-i2-qa")) throw new Error("QA_DATA_DIR 必須是專用的 kd-membership-i2-qa* 目錄");
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
process.env.KD_DATA_DIR = target;
process.env.AUTH_SESSION_SECRET ||= "phase-i2-qa-secret-long-enough";

const auth = await import("../lib/memberAuth");
const commerce = await import("../lib/membershipCommerce");

const email = "phase-i2-qa@example.test";
const password = "Phase-I2-QA-2026";
const member = await auth.registerEmailMember(email, password);
const referred = await auth.registerEmailMember("phase-i2-referred@example.test", password);
if (!member || !referred) throw new Error("無法建立隔離 QA 會員");
await auth.updateMemberProfile(member.id, { pickupName: "介面測試會員", phone: "0912345678", favoriteStore: { id: "231152", name: "福賜門市", address: "台北市測試路 1 號" } });
const subscription = await commerce.createSubscription({ memberId: member.id, startedFromOrderId: "QA-FIRST-ORDER", anchorDate: "2026-09-30", intervalDays: 30, shippingMethod: "711_cod", storeSelection: { storeId: "231152", storeName: "福賜門市" }, defaultItems: [{ itemId: "qa-coffee-half", packageWeight: "half-pound", quantity: 1, roast: "淺中焙", components: [{ productId: "qa-coffee", weightHalfPounds: 1 }], unitPrice: 1390 }], idempotencyKey: "qa-subscription", now: new Date("2026-08-20T00:00:00Z") });
await commerce.activateSubscriptionFromPickup({ subscriptionId: subscription.subscriptionId, orderId: "QA-FIRST-ORDER", idempotencyKey: "qa-activate", now: new Date("2026-08-21T00:00:00Z") });
await commerce.generateSubscriptionCycle({ subscriptionId: subscription.subscriptionId, sequence: 1, plannedDate: "2026-09-30", idempotencyKey: "qa-cycle", now: new Date("2026-08-22T00:00:00Z") });
await commerce.issueCredit({ memberId: member.id, sourceType: "promotion", sourceReference: "qa-credit", amount: 260, idempotencyKey: "qa-credit", now: new Date("2026-08-23T00:00:00Z") });
await commerce.assignReferralRelationship({ referrerMemberId: member.id, referredMemberId: referred.id, safeDisplayName: "咖啡朋友", idempotencyKey: "qa-referral", now: new Date("2026-08-24T00:00:00Z") });
await commerce.processReferralOrderOutcome({ referredMemberId: referred.id, orderId: "QA-REFERRAL-ORDER", outcome: "completed", orderMerchandiseAmount: 1000, referrerCompletedOrders: 1, idempotencyKey: "qa-referral-outcome", now: new Date("2026-08-25T00:00:00Z") });

console.log(JSON.stringify({ dataDir: target, email, password }));
