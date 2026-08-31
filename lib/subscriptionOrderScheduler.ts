import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { createOrderFile } from "./orderFiles";
import { withFileLock } from "./jsonFileStore";
import { getDateOnlyInTimeZone } from "./checkoutRules";
import { getActiveMembershipRules } from "./membershipBusinessRules";
import { createOrderFromCycle, enqueueScheduledMembershipNotifications, lockSubscriptionCycle, readMembershipCommerceState, registerReferralQualificationOrder, type SubscriptionCycle } from "./membershipCommerce";
import { readMember } from "./memberAuth";
import { getOrdersDir } from "./storagePaths";

export type SubscriptionSchedulerSummary = { processed: number; created: number; skipped: number; failed: number; notificationsQueued: number; items: Array<{ cycleId: string; result: "created" | "skipped" | "failed"; orderNumber?: string; message: string }> };

function deterministicOrderNumber(cycle: SubscriptionCycle) {
  const digits = Number.parseInt(createHash("sha256").update(cycle.cycleId).digest("hex").slice(0, 10), 16) % 1_000_000;
  return `KD${cycle.orderCreationDate.replaceAll("-", "")}-${String(digits).padStart(6, "0")}`;
}

function schedulerOrder(cycle: SubscriptionCycle, subscription: Awaited<ReturnType<typeof readMembershipCommerceState>>["subscriptions"][string], member: Awaited<ReturnType<typeof readMember>>, now: Date) {
  if (!cycle.itemsSnapshot || !cycle.pricingSnapshot || !cycle.shippingSnapshot || !cycle.rulesSnapshot) throw new Error("本期尚未完成商務快照");
  if (subscription.shippingMethod === "711_cod" && !subscription.storeSelection?.storeId) throw new Error("尚未設定 7-ELEVEN 取貨門市");
  const orderNumber = deterministicOrderNumber(cycle);
  const items = cycle.itemsSnapshot.map((item) => ({ ...item, name: item.components.map((component) => component.productId).join(" + "), lineTotal: item.unitPrice * item.quantity }));
  return {
    orderNumber,
    createdAt: now.toISOString(),
    status: subscription.shippingMethod === "711_cod" ? "waiting_merchant_create_cod_shipment" : "waiting_studio_pickup_confirmation",
    orderMode: subscription.shippingMethod,
    customer: { name: member?.pickupName || member?.displayName || "KD Coffee 會員", phone: member?.phone || "", email: member?.email || "", note: "定期購系統自動建立" },
    member: { memberId: subscription.memberId, lineUserId: member?.lineUserId, lineDisplayName: member?.displayName },
    store: subscription.shippingMethod === "711_cod" ? { id: subscription.storeSelection!.storeId, name: subscription.storeSelection!.storeName, address: "" } : undefined,
    studioPickup: subscription.shippingMethod === "studio_pickup" ? { preferredDate: cycle.plannedDate } : undefined,
    payment: subscription.shippingMethod === "711_cod" ? "cash_on_delivery" : "pickup_confirmation",
    delivery: subscription.shippingMethod === "711_cod" ? "7-ELEVEN 門市取貨付款" : "KD Coffee 工作室自取",
    items,
    subtotal: cycle.pricingSnapshot.selectedPriceSource === "campaign" ? cycle.pricingSnapshot.campaignPrice : cycle.pricingSnapshot.subscriptionPrice,
    shipping: cycle.pricingSnapshot.shipping,
    total: cycle.pricingSnapshot.finalAmount,
    credit: { appliedAmount: cycle.pricingSnapshot.creditReserved, status: cycle.pricingSnapshot.creditReserved ? "reserved" : "not_used" },
    subscriptionId: subscription.subscriptionId,
    subscriptionCycleId: cycle.cycleId,
    subscriptionSequence: cycle.sequence,
    pricingSnapshot: cycle.pricingSnapshot,
    giftSnapshot: cycle.giftSnapshot,
    shippingSnapshot: cycle.shippingSnapshot,
    rulesSnapshot: cycle.rulesSnapshot,
    lineNotification: { sent: false, status: "pending" },
    idempotencyKey: `subscription-cycle:${cycle.cycleId}`,
  };
}

export async function runSubscriptionOrderScheduler(options: { today?: string; now?: Date; stateFilePath?: string; rulesFilePath?: string; orderDir?: string } = {}) {
  const today = options.today ?? getDateOnlyInTimeZone(options.now ?? new Date());
  const orderDir = options.orderDir ?? getOrdersDir();
  await fs.mkdir(orderDir, { recursive: true });
  const lockTarget = path.join(orderDir, ".subscription-order-scheduler");
  return withFileLock(lockTarget, async () => {
    const reminderResult = await enqueueScheduledMembershipNotifications({ today, now: options.now, stateFilePath: options.stateFilePath, rulesFilePath: options.rulesFilePath });
    const summary: SubscriptionSchedulerSummary = { processed: 0, created: 0, skipped: 0, failed: 0, notificationsQueued: reminderResult.queued, items: [] };
    const initial = await readMembershipCommerceState(options.stateFilePath);
    const due = Object.values(initial.cycles).filter((cycle) => cycle.orderCreationDate <= today && ["scheduled", "modifiable", "locked"].includes(cycle.status));
    for (const candidate of due) {
      summary.processed += 1;
      try {
        let state = await readMembershipCommerceState(options.stateFilePath);
        let cycle = state.cycles[candidate.cycleId];
        const subscription = state.subscriptions[cycle.subscriptionId];
        if (!subscription || subscription.status !== "active" || !["scheduled", "modifiable", "locked"].includes(cycle.status)) {
          summary.skipped += 1; summary.items.push({ cycleId: candidate.cycleId, result: "skipped", message: "定期購目前不符合自動建單條件" }); continue;
        }
        if (cycle.status !== "locked") {
          const activeRules = await getActiveMembershipRules(options.now, options.rulesFilePath);
          const shipping = activeRules.rules.shipping.subscriptionFreeShipping ? 0 : activeRules.rules.shipping.subscriptionShippingFee;
          cycle = await lockSubscriptionCycle({ cycleId: cycle.cycleId, idempotencyKey: `scheduler-lock:${cycle.cycleId}`, shipping, now: options.now, stateFilePath: options.stateFilePath, rulesFilePath: options.rulesFilePath });
        }
        state = await readMembershipCommerceState(options.stateFilePath);
        const latestSubscription = state.subscriptions[cycle.subscriptionId];
        const order = schedulerOrder(state.cycles[cycle.cycleId], latestSubscription, await readMember(latestSubscription.memberId), options.now ?? new Date());
        const existing = await fs.readFile(path.join(orderDir, `${order.orderNumber}.json`), "utf8").then((content) => JSON.parse(content)).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error));
        if (existing && existing.subscriptionCycleId !== cycle.cycleId) throw new Error("自動訂單編號與其他訂單衝突");
        if (!existing) await createOrderFile(orderDir, order.orderNumber, order, () => order.orderNumber);
        await createOrderFromCycle({ cycleId: cycle.cycleId, orderId: order.orderNumber, idempotencyKey: `scheduler-order:${cycle.cycleId}`, now: options.now, stateFilePath: options.stateFilePath, rulesFilePath: options.rulesFilePath });
        await registerReferralQualificationOrder({ memberId: latestSubscription.memberId, orderId: order.orderNumber, orderCreatedAt: order.createdAt, orderType: "subscription", idempotencyKey: `subscription-cycle:${cycle.cycleId}`, now: options.now, stateFilePath: options.stateFilePath, rulesFilePath: options.rulesFilePath });
        summary.created += existing ? 0 : 1;
        summary.skipped += existing ? 1 : 0;
        summary.items.push({ cycleId: cycle.cycleId, result: existing ? "skipped" : "created", orderNumber: order.orderNumber, message: existing ? "訂單已存在，未重複建立" : "已建立定期購訂單" });
      } catch (error) {
        summary.failed += 1;
        summary.items.push({ cycleId: candidate.cycleId, result: "failed", message: error instanceof Error ? error.message : "自動建單失敗" });
      }
    }
    return summary;
  }, { timeoutMs: 30_000 });
}
