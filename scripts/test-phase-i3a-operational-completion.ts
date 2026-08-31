import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "kd-phase-i3a-"));
process.env.KD_DATA_DIR = testRoot;
process.env.AUTH_SESSION_SECRET = "phase-i3a-isolated-test-secret";
delete process.env.GMAIL_CLIENT_ID;
delete process.env.GMAIL_CLIENT_SECRET;
delete process.env.GMAIL_REFRESH_TOKEN;

const rulesModule = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");
const identity = await import("../lib/memberIdentity");
const scheduler = await import("../lib/subscriptionOrderScheduler");
const storage = await import("../lib/storagePaths");
const fulfillment = await import("../lib/fulfillment");
const gmail = await import("../lib/gmailFulfillmentAutomation");
const owner = await import("../lib/ownerOrderExceptions");

let count = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  count += 1;
  console.log(`PASS ${String(count).padStart(2, "0")} ${name}`);
}

const now = new Date("2026-08-28T02:00:00.000Z");
const stateFilePath = path.join(testRoot, "membership-commerce", "commerce-state.json");
const rulesFilePath = path.join(testRoot, "membership-commerce", "business-rules.json");
const orderDir = storage.getOrdersDir();
const item = { itemId: "coffee-half", packageWeight: "half-pound" as const, quantity: 1, roast: "淺中焙", unitPrice: 1000, components: [{ productId: "coffee", weightHalfPounds: 1 as const }] };

async function member(subject: string) {
  return (await identity.provisionCanonicalMember({ provider: "email", subject, persistMember: async () => undefined })).member.memberId;
}

async function saveRules(mutator: (rules: typeof rulesModule.DEFAULT_MEMBERSHIP_RULES) => void) {
  const store = await rulesModule.readMembershipRulesStore(rulesFilePath);
  const next = structuredClone(store.versions.at(-1)!.rules);
  mutator(next);
  return rulesModule.saveMembershipBusinessRules({ expectedRevision: store.revision, rules: next, now }, rulesFilePath);
}

async function subscriptionFor(memberId: string, key: string, status: "active" | "paused" | "terminated" = "active") {
  const subscription = await commerce.createSubscription({ memberId, startedFromOrderId: `first-${key}`, anchorDate: "2026-09-01", intervalDays: 30, shippingMethod: "studio_pickup", defaultItems: [item], idempotencyKey: `sub-${key}`, now, stateFilePath, rulesFilePath });
  let active = await commerce.activateSubscriptionFromPickup({ subscriptionId: subscription.subscriptionId, orderId: `first-${key}`, idempotencyKey: `activate-${key}`, now, stateFilePath, rulesFilePath });
  if (status !== "active") active = await commerce.setSubscriptionStatus({ subscriptionId: active.subscriptionId, status, reason: "isolated test", idempotencyKey: `status-${key}`, now, stateFilePath, rulesFilePath });
  return active;
}

async function createOrder(orderNumber: string, mode: "studio_pickup" | "711_cod", status = "waiting_studio_pickup_confirmation") {
  await mkdir(orderDir, { recursive: true });
  const order = { orderNumber, createdAt: now.toISOString(), status, orderMode: mode, customer: { name: "隔離測試" }, store: mode === "711_cod" ? { id: "123456", name: "測試門市", address: "測試地址" } : undefined, studioPickup: mode === "studio_pickup" ? { preferredDate: "2026-09-03" } : undefined, items: [{ name: "測試咖啡", quantity: 1 }], subtotal: 1000, shipping: 0, total: 1000, pricingSnapshot: { finalAmount: 1000, rulesVersion: 1 } };
  await writeFile(path.join(orderDir, `${orderNumber}.json`), JSON.stringify(order, null, 2), "utf8");
  return order;
}

function mail(cm: string, messageId: string, from = "7-ELEVEN 賣貨便 <no-reply@sp88.com>") {
  return { from, subject: "賣貨便：買家完成取貨訂單通知", text: `買家已完成取貨，賣貨便訂單編號 ${cm}`, messageId, receivedAt: now.toISOString() };
}

try {
  await saveRules((rules) => { rules.money.roundingMode = "round-half-up"; rules.subscription.pauseResumeAnchorPolicy = "keep-original"; });
  const memberA = await member("phase-i3a-a@example.test");
  const memberB = await member("phase-i3a-b@example.test");

  const oldCredit = await commerce.issueCredit({ memberId: memberA, sourceType: "manual", sourceReference: "old", amount: 70, idempotencyKey: "credit-old", now: new Date("2026-06-01T00:00:00Z"), stateFilePath, rulesFilePath });
  const newCredit = await commerce.issueCredit({ memberId: memberA, sourceType: "manual", sourceReference: "new", amount: 80, idempotencyKey: "credit-new", now: new Date("2026-07-01T00:00:00Z"), stateFilePath, rulesFilePath });
  const fefo = await commerce.reserveCredit({ memberId: memberA, orderId: "credit-fefo", requestedAmount: 100, merchandiseSubtotal: 200, shipping: 0, idempotencyKey: "reserve-fefo", now, stateFilePath, rulesFilePath });
  check("FEFO 優先使用較早到期抵用金", fefo.allocations[0].creditEntryId === oldCredit.creditEntryId && fefo.allocations[1].creditEntryId === newCredit.creditEntryId);

  await saveRules((rules) => { rules.credit.redemption = { mode: "maximum-fixed", amount: 40 }; });
  check("每筆最高抵用金額由 server 限制", (await commerce.getCheckoutCreditQuote({ memberId: memberA, merchandiseSubtotal: 200, shipping: 0, now, stateFilePath, rulesFilePath })).maximumUsable === 40);
  await saveRules((rules) => { rules.credit.redemption = { mode: "maximum-percentage", percent: 25 }; });
  check("最高折抵比例由 server 計算", (await commerce.getCheckoutCreditQuote({ memberId: memberA, merchandiseSubtotal: 200, shipping: 0, now, stateFilePath, rulesFilePath })).maximumUsable === 50);
  await saveRules((rules) => { rules.credit.redemption = { mode: "unlimited" }; rules.credit.appliesToShipping = "no"; });
  check("不可折運費時最高額只包含商品", (await commerce.getCheckoutCreditQuote({ memberId: memberA, merchandiseSubtotal: 20, shipping: 60, now, stateFilePath, rulesFilePath })).maximumUsable === 20);
  await saveRules((rules) => { rules.credit.appliesToShipping = "yes"; rules.credit.allowZeroTotal = true; });
  check("允許零元時可折抵全部應付額", (await commerce.getCheckoutCreditQuote({ memberId: memberA, merchandiseSubtotal: 20, shipping: 10, now, stateFilePath, rulesFilePath })).maximumUsable === 30);
  await saveRules((rules) => { rules.credit.allowZeroTotal = false; });
  check("禁止零元時保留一元應付", (await commerce.getCheckoutCreditQuote({ memberId: memberA, merchandiseSubtotal: 20, shipping: 10, now, stateFilePath, rulesFilePath })).maximumUsable === 29);
  const insufficient = await Promise.allSettled([commerce.reserveCredit({ memberId: memberA, orderId: "credit-insufficient", requestedAmount: 9999, merchandiseSubtotal: 10000, shipping: 0, idempotencyKey: "reserve-insufficient", now, stateFilePath, rulesFilePath })]);
  check("餘額不足時拒絕超額保留", insufficient[0].status === "rejected");
  const memberBReservation = await Promise.allSettled([commerce.reserveCredit({ memberId: memberB, orderId: "credit-other-member", requestedAmount: 50, merchandiseSubtotal: 100, shipping: 0, idempotencyKey: "reserve-other", now, stateFilePath, rulesFilePath })]);
  check("另一位會員不能使用他人抵用金", memberBReservation[0].status === "rejected");
  const duplicateReserve = await commerce.reserveCredit({ memberId: memberA, orderId: "credit-fefo", requestedAmount: 100, merchandiseSubtotal: 200, shipping: 0, idempotencyKey: "reserve-fefo", now, stateFilePath, rulesFilePath });
  check("重複 reserve 不會建立第二筆保留", duplicateReserve.reservationId === fefo.reservationId);
  const consumed = await commerce.settleCreditReservation({ reservationId: fefo.reservationId, action: "consume", idempotencyKey: "consume-fefo", reason: "test", now, stateFilePath });
  const consumedAgain = await commerce.settleCreditReservation({ reservationId: fefo.reservationId, action: "consume", idempotencyKey: "consume-fefo", reason: "test", now, stateFilePath });
  check("重複 consume 只結算一次", consumed.status === "consumed" && consumedAgain.reservationId === consumed.reservationId);
  const releaseReservation = await commerce.reserveCredit({ memberId: memberA, orderId: "credit-release", requestedAmount: 10, merchandiseSubtotal: 100, shipping: 0, idempotencyKey: "reserve-release", now, stateFilePath, rulesFilePath });
  await commerce.settleCreditReservation({ reservationId: releaseReservation.reservationId, action: "release", idempotencyKey: "release-flow", reason: "failed flow", now, stateFilePath });
  check("失敗流程可釋放保留抵用金", (await commerce.readMembershipCommerceState(stateFilePath)).creditReservations[releaseReservation.reservationId].status === "released");

  const schedulerMember = await member("scheduler@example.test");
  const eligibleSub = await subscriptionFor(schedulerMember, "eligible");
  const eligibleCycle = await commerce.generateSubscriptionCycle({ subscriptionId: eligibleSub.subscriptionId, sequence: 1, plannedDate: "2026-08-31", idempotencyKey: "cycle-eligible", now, stateFilePath, rulesFilePath });
  const futureCycle = await commerce.generateSubscriptionCycle({ subscriptionId: eligibleSub.subscriptionId, sequence: 2, plannedDate: "2026-10-01", idempotencyKey: "cycle-future", now, stateFilePath, rulesFilePath });
  const pausedSub = await subscriptionFor(schedulerMember, "paused-seed");
  const pausedSetup = await commerce.generateSubscriptionCycle({ subscriptionId: pausedSub.subscriptionId, sequence: 1, plannedDate: "2026-08-31", idempotencyKey: "cycle-paused", now, stateFilePath, rulesFilePath });
  await commerce.setSubscriptionStatus({ subscriptionId: pausedSub.subscriptionId, status: "paused", reason: "test", idempotencyKey: "pause-after-cycle", now, stateFilePath, rulesFilePath });
  const terminatedActive = await subscriptionFor(schedulerMember, "terminated-seed");
  const terminatedCycle = await commerce.generateSubscriptionCycle({ subscriptionId: terminatedActive.subscriptionId, sequence: 1, plannedDate: "2026-08-31", idempotencyKey: "cycle-terminated", now, stateFilePath, rulesFilePath });
  await commerce.setSubscriptionStatus({ subscriptionId: terminatedActive.subscriptionId, status: "terminated", reason: "test", idempotencyKey: "terminate-after-cycle", now, stateFilePath, rulesFilePath });
  const skippedSub = await subscriptionFor(schedulerMember, "skipped");
  const skippedCycle = await commerce.generateSubscriptionCycle({ subscriptionId: skippedSub.subscriptionId, sequence: 1, plannedDate: "2026-08-31", idempotencyKey: "cycle-skipped", now, stateFilePath, rulesFilePath });
  await commerce.skipCycle({ cycleId: skippedCycle.cycleId, idempotencyKey: "skip-before-run", now, stateFilePath, rulesFilePath });
  const badSub = await commerce.createSubscription({ memberId: schedulerMember, startedFromOrderId: "first-bad", anchorDate: "2026-08-31", intervalDays: 30, shippingMethod: "711_cod", defaultItems: [item], idempotencyKey: "sub-bad", now, stateFilePath, rulesFilePath });
  await commerce.activateSubscriptionFromPickup({ subscriptionId: badSub.subscriptionId, orderId: "first-bad", idempotencyKey: "activate-bad", now, stateFilePath, rulesFilePath });
  await commerce.generateSubscriptionCycle({ subscriptionId: badSub.subscriptionId, sequence: 1, plannedDate: "2026-08-31", idempotencyKey: "cycle-bad", now, stateFilePath, rulesFilePath });
  const firstRun = await scheduler.runSubscriptionOrderScheduler({ today: "2026-08-28", now, stateFilePath, rulesFilePath, orderDir });
  const firstFiles = (await readdir(orderDir)).filter((file) => file.endsWith(".json"));
  check("符合條件期次建立正式訂單檔", firstRun.created === 1 && firstFiles.length === 1);
  check("未來期次不會提早建單", (await commerce.readMembershipCommerceState(stateFilePath)).cycles[futureCycle.cycleId].createdOrderId === null);
  check("暫停定期購不會建單", !firstRun.items.some((row) => row.cycleId === pausedSetup.cycleId && row.result === "created"));
  check("已終止定期購不會建單", !firstRun.items.some((row) => row.cycleId === terminatedCycle.cycleId && row.result === "created"));
  check("已跳過期次不會建單", !firstRun.items.some((row) => row.cycleId === skippedCycle.cycleId && row.result === "created"));
  await scheduler.runSubscriptionOrderScheduler({ today: "2026-08-28", now, stateFilePath, rulesFilePath, orderDir });
  check("排程重跑仍只有一張訂單", (await readdir(orderDir)).filter((file) => file.endsWith(".json")).length === 1);
  await Promise.all([scheduler.runSubscriptionOrderScheduler({ today: "2026-08-28", now, stateFilePath, rulesFilePath, orderDir }), scheduler.runSubscriptionOrderScheduler({ today: "2026-08-28", now, stateFilePath, rulesFilePath, orderDir })]);
  check("並行排程以鎖與 deterministic key 保持冪等", (await readdir(orderDir)).filter((file) => file.endsWith(".json")).length === 1);
  const lockedSnapshot = JSON.stringify((await commerce.readMembershipCommerceState(stateFilePath)).cycles[eligibleCycle.cycleId].pricingSnapshot);
  await saveRules((rules) => { rules.subscription.discountPercent = 80; });
  check("已鎖定價格快照不受後續規則變更影響", JSON.stringify((await commerce.readMembershipCommerceState(stateFilePath)).cycles[eligibleCycle.cycleId].pricingSnapshot) === lockedSnapshot);
  check("單筆錯誤不會阻止同批其他訂單", firstRun.failed === 1 && firstRun.created === 1);

  const ownerOrder = "KD20260828-900001";
  await createOrder(ownerOrder, "studio_pickup");
  await saveRules((rules) => { rules.ownerExceptions.canUnlockDate = false; });
  const denied = await Promise.allSettled([owner.applyOwnerOrderException({ orderId: ownerOrder, action: "change-date", date: "2026-09-10", expectedFulfillmentRevision: 0, idempotencyKey: "owner-denied", reason: "test", now })]);
  check("Owner 例外操作受設定權限限制", denied[0].status === "rejected");
  await saveRules((rules) => { rules.ownerExceptions.canUnlockDate = true; rules.ownerExceptions.canUnlockStore = true; });
  const dateChanged = await owner.applyOwnerOrderException({ orderId: ownerOrder, action: "change-date", date: "2026-09-10", expectedFulfillmentRevision: 0, idempotencyKey: "owner-date", reason: "會員要求", now });
  check("日期調整保留前後值、操作者與原因", dateChanged.ownerExceptionAudit.at(-1).before === "2026-09-03" && dateChanged.ownerExceptionAudit.at(-1).reason === "會員要求");
  const storeOrder = "KD20260828-900002";
  await createOrder(storeOrder, "711_cod", "waiting_merchant_create_cod_shipment");
  const storeChanged = await owner.applyOwnerOrderException({ orderId: storeOrder, action: "change-store", store: { id: "654321", name: "新門市", address: "新地址" }, expectedFulfillmentRevision: 0, idempotencyKey: "owner-store", reason: "會員要求", now });
  check("門市調整保留稽核軌跡", storeChanged.store.id === "654321" && storeChanged.ownerExceptionAudit.length === 1);
  check("安全例外不重算價格快照", JSON.stringify(storeChanged.pricingSnapshot) === JSON.stringify({ finalAmount: 1000, rulesVersion: 1 }));
  const lockedOrder = "KD20260828-900003";
  await createOrder(lockedOrder, "711_cod", "shipped");
  const boundary = await Promise.allSettled([owner.applyOwnerOrderException({ orderId: lockedOrder, action: "change-store", store: { id: "654321", name: "新門市", address: "新地址" }, expectedFulfillmentRevision: 0, idempotencyKey: "owner-boundary", reason: "test", now })]);
  check("不可逆物流階段阻擋 Owner 變更", boundary[0].status === "rejected");

  check("Gmail 缺少憑證時安全顯示未連線", !gmail.gmailFulfillmentConnectionReadiness().ready);
  const logistics = await fulfillment.readLogisticsSettings();
  await fulfillment.saveLogisticsSettings({ expectedRevision: logistics.revision, notificationEmail: "qa@example.test", automaticTrackingEnabled: true, pickupDeadlineDays: 7, expiryPolicy: "manual_review", trackedEvents: { orderCreated: true, shipped: true, arrived: true, completed: true }, now });
  const gmailOrder = "KD20260828-900004", cm = "CMTEST000009";
  await createOrder(gmailOrder, "711_cod", "waiting_merchant_create_cod_shipment");
  await fulfillment.associateExternalFulfillment({ orderId: gmailOrder, externalOrderId: cm, now });
  await fulfillment.processSevenElevenEmail(mail(cm, "duplicate-mail"));
  await fulfillment.processSevenElevenEmail(mail(cm, "duplicate-mail"));
  check("同一封 Email 不重複建立履約事件", (await fulfillment.readFulfillmentStore()).records[gmailOrder].events.filter((event) => event.state === "completed").length === 1);
  const unknown = await fulfillment.processSevenElevenEmail({ from: "7-ELEVEN 賣貨便 <no-reply@sp88.com>", subject: "賣貨便未知格式", text: "未知內容 CMI3AUNKNOWN", messageId: "unknown-trusted" });
  check("可信寄件者未知格式只進人工確認", unknown.review && !unknown.mutated);
  const beforeUntrusted = JSON.stringify(await fulfillment.readFulfillmentStore());
  const untrusted = await fulfillment.processSevenElevenEmail(mail(cm, "untrusted", "attacker@example.test"));
  check("不可信寄件者不能變更履約", !untrusted.mutated && JSON.stringify(await fulfillment.readFulfillmentStore()) === beforeUntrusted);

  await saveRules((rules) => { rules.notification.events.next_cycle_upcoming.enabled = false; rules.notification.nextCycleReminderDays = 4; });
  const noticeSub = await subscriptionFor(schedulerMember, "notice-disabled");
  await commerce.generateSubscriptionCycle({ subscriptionId: noticeSub.subscriptionId, sequence: 1, plannedDate: "2026-09-01", idempotencyKey: "notice-disabled-cycle", now, stateFilePath, rulesFilePath });
  const beforeDisabled = (await commerce.readMembershipCommerceState(stateFilePath)).notifications.length;
  await commerce.enqueueScheduledMembershipNotifications({ today: "2026-08-28", now, stateFilePath, rulesFilePath });
  check("關閉的 LINE 營運事件不建立工作項", (await commerce.readMembershipCommerceState(stateFilePath)).notifications.length === beforeDisabled);
  await saveRules((rules) => { rules.notification.events.next_cycle_upcoming.enabled = true; rules.notification.events.next_cycle_upcoming.channels = ["member_center", "line"]; rules.notification.retryCount = 0; rules.notification.emailFallback = true; });
  const noticeSub2 = await subscriptionFor(schedulerMember, "notice-enabled");
  const noticeCycle2 = await commerce.generateSubscriptionCycle({ subscriptionId: noticeSub2.subscriptionId, sequence: 1, plannedDate: "2026-09-01", idempotencyKey: "notice-enabled-cycle", now, stateFilePath, rulesFilePath });
  const queued = await commerce.enqueueScheduledMembershipNotifications({ today: "2026-08-28", now, stateFilePath, rulesFilePath });
  const enabledState = await commerce.readMembershipCommerceState(stateFilePath);
  check("啟用的事件建立一筆 LINE 工作項", queued.queued >= 1 && enabledState.notifications.filter((notice) => notice.sourceEvent.includes(noticeCycle2.cycleId)).length === 1);
  await commerce.enqueueScheduledMembershipNotifications({ today: "2026-08-28", now, stateFilePath, rulesFilePath });
  const noticeState = await commerce.readMembershipCommerceState(stateFilePath);
  check("相同來源事件不重複通知", noticeState.notifications.filter((notice) => notice.sourceEvent.includes(noticeCycle2.cycleId)).length === 1);
  let claimed = await commerce.claimNextMembershipNotification({ now, stateFilePath });
  while (claimed && !claimed.sourceEvent.includes(noticeCycle2.cycleId)) {
    await commerce.completeMembershipNotificationDelivery({ notificationId: claimed.notificationId, deliveredChannels: claimed.channels, now, stateFilePath });
    claimed = await commerce.claimNextMembershipNotification({ now, stateFilePath });
  }
  assert.ok(claimed);
  const failed = await commerce.completeMembershipNotificationDelivery({ notificationId: claimed.notificationId, deliveredChannels: ["member_center"], error: "LINE failed", now, stateFilePath });
  check("通知重試次數有限", failed.status === "failed" && failed.attempts === 1);
  const fallbackNotice = structuredClone(claimed);
  fallbackNotice.notificationId = "notice_fallback_test";
  fallbackNotice.status = "processing";
  fallbackNotice.attempts = 1;
  const rawState = await commerce.readMembershipCommerceState(stateFilePath);
  rawState.notifications.push(fallbackNotice);
  await (await import("../lib/jsonFileStore")).atomicWriteJson(stateFilePath, rawState);
  const fallback = await commerce.completeMembershipNotificationDelivery({ notificationId: fallbackNotice.notificationId, deliveredChannels: ["member_center", "email"], now, stateFilePath });
  check("Email fallback 僅依啟用設定完成工作", fallback.status === "delivered" && fallback.deliveryPolicy?.emailFallback === true);

  console.log(`\nPhase I.3A operational completion: ${count} focused scenarios PASS`);
} finally {
  await rm(testRoot, { recursive: true, force: true });
}
