import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "kd-phase-i3-"));
process.env.KD_DATA_DIR = testRoot;
process.env.AUTH_SESSION_SECRET = "phase-i3-isolated-test-secret";

const rulesModule = await import("../lib/membershipBusinessRules");
const policy = await import("../lib/membershipPolicies");
const commerce = await import("../lib/membershipCommerce");
const identity = await import("../lib/memberIdentity");
const fulfillment = await import("../lib/fulfillment");
const gmail = await import("../lib/gmailFulfillmentAutomation");

let count = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  count += 1;
  console.log(`PASS ${String(count).padStart(2, "0")} ${name}`);
}

try {
  const legacy = structuredClone(rulesModule.DEFAULT_MEMBERSHIP_RULES) as unknown as Record<string, unknown>;
  delete legacy.pickup;
  delete legacy.fulfillment;
  delete legacy.ownerExceptions;
  const legacySubscription = legacy.subscription as Record<string, unknown>;
  delete legacySubscription.maxModificationsPerCycle;
  delete legacySubscription.datePickerMode;
  const normalized = rulesModule.validateMembershipBusinessRules(legacy);
  check("舊規則缺少 Phase I.3 欄位時使用安全預設", normalized.pickup.blockedDates.length === 0 && normalized.fulfillment.unknownEmailRequiresReview === true);

  const configured = structuredClone(normalized);
  configured.subscription.maxModificationsPerCycle = 2;
  configured.pickup.preparationLeadDays = 2;
  configured.pickup.customRoastPreparationLeadDays = 5;
  configured.pickup.blockedDates = ["2026-09-10"];
  configured.credit.allowZeroTotal = false;
  configured.credit.uiMode = "use-or-not";
  configured.notification.events.gift_milestone.enabled = false;
  configured.gift.startsAtFulfillment = 1;
  await rulesModule.saveMembershipBusinessRules({ expectedRevision: 0, rules: configured, now: new Date("2026-08-28T00:00:00Z") });

  check("一般自取最少備貨天數由規則解析", policy.resolvePickupDateAvailability({ requestedDate: "2026-08-30", today: "2026-08-28", customRoast: false, rules: configured }).allowed);
  check("不可自取日期由 server resolver 阻擋", policy.resolvePickupDateAvailability({ requestedDate: "2026-09-10", today: "2026-08-28", customRoast: false, rules: configured }).reason === "blocked-date");
  check("專屬烘焙使用較長備貨時間", policy.resolvePickupDateAvailability({ requestedDate: "2026-09-01", today: "2026-08-28", customRoast: true, rules: configured }).reason === "before-lead-time");
  check("禁止零元訂單時至少保留一元", policy.maximumCreditRedemption({ merchandiseSubtotal: 100, shipping: 0, rules: configured }) === 99);
  check("抵用金會員操作模式由規則解析", policy.resolveCreditMemberPolicy(configured).uiMode === "use-or-not" && !policy.resolveCreditMemberPolicy(configured).showAmountInput);

  const memberId = (await identity.provisionCanonicalMember({ provider: "email", subject: "phase-i3@example.test", persistMember: async () => undefined })).member.memberId;
  const item = { itemId: "coffee-half", packageWeight: "half-pound" as const, quantity: 1, roast: "淺中焙", unitPrice: 1000, components: [{ productId: "coffee", weightHalfPounds: 1 as const }] };
  const subscription = await commerce.createSubscription({ memberId, startedFromOrderId: "first-i3", anchorDate: "2026-10-01", intervalDays: 30, shippingMethod: "studio_pickup", defaultItems: [item], idempotencyKey: "create-i3", now: new Date("2026-08-28T00:00:00Z") });
  await commerce.activateSubscriptionFromPickup({ subscriptionId: subscription.subscriptionId, orderId: "first-i3", idempotencyKey: "activate-i3", now: new Date("2026-08-28T01:00:00Z") });
  check("關閉贈品通知事件後不建立外部通知工作", !(await commerce.readMembershipCommerceState()).notifications.some((notice) => notice.eventType === "gift_eligible"));
  let first = await commerce.generateSubscriptionCycle({ subscriptionId: subscription.subscriptionId, sequence: 1, plannedDate: "2026-10-01", idempotencyKey: "cycle-1", now: new Date("2026-08-28T02:00:00Z") });
  await commerce.generateSubscriptionCycle({ subscriptionId: subscription.subscriptionId, sequence: 2, plannedDate: "2026-10-31", idempotencyKey: "cycle-2", now: new Date("2026-08-28T02:00:00Z") });
  first = await commerce.modifyCycleDate({ memberId, cycleId: first.cycleId, expectedRevision: first.revision, plannedDate: "2026-10-05", recalculateAnchor: true, idempotencyKey: "rebase-i3", now: new Date("2026-08-28T03:00:00Z") });
  let state = await commerce.readMembershipCommerceState();
  const future = Object.values(state.cycles).find((cycle) => cycle.sequence === 2)!;
  check("rebase 會同步重算尚未鎖定的未來期次", future.plannedDate === "2026-11-04");
  first = await commerce.modifyCycleDate({ memberId, cycleId: first.cycleId, expectedRevision: first.revision, plannedDate: "2026-10-06", recalculateAnchor: false, idempotencyKey: "second-i3", now: new Date("2026-08-28T04:00:00Z") });
  const limit = await Promise.allSettled([commerce.modifyCycleDate({ memberId, cycleId: first.cycleId, expectedRevision: first.revision, plannedDate: "2026-10-07", recalculateAnchor: false, idempotencyKey: "third-i3", now: new Date("2026-08-28T05:00:00Z") })]);
  check("每期修改次數達上限後由 server 拒絕", limit[0].status === "rejected");

  const impact = await commerce.previewMembershipRulesImpact({ ...configured, subscription: { ...configured.subscription, discountPercent: 90 } });
  check("規則影響預覽只計入尚未鎖定期次", impact.affectedCycles === 2 && impact.lockedCyclesPreserved === 0);
  check("Owner 例外權限與通知 retry 均為 typed config", configured.ownerExceptions.canUnlockDate === true && configured.notification.retryCount === 2);

  const logistics = await fulfillment.readLogisticsSettings();
  await fulfillment.saveLogisticsSettings({ expectedRevision: logistics.revision, notificationEmail: "logistics@example.test", automaticTrackingEnabled: true, pickupDeadlineDays: 7, expiryPolicy: "manual_review", trackedEvents: logistics.trackedEvents });
  const unknownMail = await fulfillment.processSevenElevenEmail({ from: "7-ELEVEN 賣貨便 <no-reply@sp88.com>", subject: "賣貨便：新的未知格式", text: "CMTESTUNKNOWN1 狀態內容尚未定義", messageId: "phase-i3-unknown" });
  check("可信寄件者的未知 Email 格式只進人工確認", unknownMail.review === true && unknownMail.mutated === false);
  const unsafeExpiry = await Promise.allSettled([fulfillment.saveLogisticsSettings({ expectedRevision: (await fulfillment.readLogisticsSettings()).revision, notificationEmail: "logistics@example.test", automaticTrackingEnabled: true, pickupDeadlineDays: 7, expiryPolicy: "confirm_uncollected", trackedEvents: logistics.trackedEvents })]);
  check("不能設定逾期自動判定未取貨", unsafeExpiry[0].status === "rejected");
  check("Gmail 缺少 OAuth 時明確保持未連線", gmail.gmailFulfillmentConnectionReadiness().ready === false && gmail.gmailFulfillmentConnectionReadiness().missing.includes("GMAIL_REFRESH_TOKEN"));

  await commerce.issueCredit({ memberId, sourceType: "manual", sourceReference: "phase-i3-notice", amount: 10, idempotencyKey: "phase-i3-notice" });
  const claimed = await commerce.claimNextMembershipNotification();
  assert.ok(claimed);
  const retryable = await commerce.completeMembershipNotificationDelivery({ notificationId: claimed.notificationId, deliveredChannels: ["member_center"], error: "LINE 暫時失敗" });
  check("LINE 失敗時會員中心紀錄保留且進入有限重試", retryable.status === "pending" && retryable.deliveredChannels?.includes("member_center"));
  const claimedAgain = await commerce.claimNextMembershipNotification();
  assert.ok(claimedAgain);
  const delivered = await commerce.completeMembershipNotificationDelivery({ notificationId: claimedAgain.notificationId, deliveredChannels: ["member_center", "line"] });
  check("通知重試成功後完成且不建立重複通知事件", delivered.status === "delivered" && (await commerce.readMembershipCommerceState()).notifications.filter((notice) => notice.notificationId === delivered.notificationId).length === 1);

  state = await commerce.readMembershipCommerceState();
  check("測試資料全部位於隔離目錄", state.subscriptions[subscription.subscriptionId].memberId === memberId);
  console.log(`\nPhase I.3 operational rules: ${count} scenarios PASS`);
} finally {
  await rm(testRoot, { recursive: true, force: true });
}
