import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { WebsiteData } from "../data/websiteData";
import { withFileLock } from "./jsonFileStore";
import { getDateOnlyInTimeZone } from "./checkoutRules";
import { runInventoryOrderTransaction } from "./orderInventoryTransaction";
import type { RequestedItem } from "./orderPricing";
import { createOrderFromCycle, enqueueScheduledMembershipNotifications, lockSubscriptionCycle, readMembershipCommerceState, registerReferralQualificationOrder, type SubscriptionCycle } from "./membershipCommerce";
import { readMember } from "./memberAuth";
import { getOrdersDir, getWebsiteDataFile } from "./storagePaths";
import { subscriptionDedicatedRoastOperationalSummary, subscriptionItemsToRequestedItems, subscriptionOrderDisplayItems } from "./subscriptionSkuModel";

export type SubscriptionSchedulerSummary = { processed: number; created: number; skipped: number; failed: number; notificationsQueued: number; items: Array<{ cycleId: string; result: "created" | "skipped" | "failed"; orderNumber?: string; message: string }> };

function deterministicOrderNumber(cycle: SubscriptionCycle) {
  const digits = Number.parseInt(createHash("sha256").update(cycle.cycleId).digest("hex").slice(0, 10), 16) % 1_000_000;
  return `KD${cycle.orderCreationDate.replaceAll("-", "")}-${String(digits).padStart(6, "0")}`;
}

function schedulerOrder(cycle: SubscriptionCycle, subscription: Awaited<ReturnType<typeof readMembershipCommerceState>>["subscriptions"][string], member: Awaited<ReturnType<typeof readMember>>, now: Date, website: WebsiteData) {
  if (!cycle.itemsSnapshot || !cycle.pricingSnapshot || !cycle.shippingSnapshot || !cycle.rulesSnapshot) throw new Error("本期尚未完成商務快照");
  const lockedDelivery = cycle.shippingSnapshot;
  const method = lockedDelivery.method;
  if (method === "711_cod" && !lockedDelivery.storeSelection?.storeId) throw new Error("尚未設定 7-ELEVEN 取貨門市");
  if (method === "home_delivery" && (!lockedDelivery.deliveryAddress || !["atm_transfer", "cash_on_delivery"].includes(lockedDelivery.paymentMethod || ""))) throw new Error("宅配快照資料不完整");
  if (!["711_cod", "studio_pickup", "home_delivery"].includes(method)) throw new Error("不支援的配送方式");
  const homePayment = method === "home_delivery" ? lockedDelivery.paymentMethod : null;
  const codServiceFee = method === "home_delivery" ? lockedDelivery.codServiceFee ?? cycle.pricingSnapshot.codServiceFee ?? 0 : 0;
  const orderNumber = deterministicOrderNumber(cycle);

  const merchandiseAmount =
    cycle.pricingSnapshot.selectedPriceSource === "campaign"
      ? cycle.pricingSnapshot.campaignPrice ?? cycle.pricingSnapshot.subscriptionPrice
      : cycle.pricingSnapshot.subscriptionPrice;

  const discountRatio =
    cycle.pricingSnapshot.merchandiseOriginal > 0
      ? Math.max(
          0,
          Math.min(
            1,
            merchandiseAmount /
              cycle.pricingSnapshot.merchandiseOriginal,
          ),
        )
      : 1;

  const items = subscriptionOrderDisplayItems(
    cycle.itemsSnapshot,
    website,
    { discountRatio },
  );

  return {
    orderNumber,
    createdAt: now.toISOString(),
    status: method === "711_cod" ? "waiting_merchant_create_cod_shipment" : method === "home_delivery" ? "new_order" : "waiting_studio_pickup_confirmation",
    orderMode: method,
    customer: { name: member?.pickupName || member?.displayName || "KD Coffee 會員", phone: member?.phone || "", email: member?.email || "", note: "定期購系統自動建立" },
    member: { memberId: subscription.memberId, lineUserId: member?.lineUserId, lineDisplayName: member?.displayName },
    store: method === "711_cod" ? { id: lockedDelivery.storeSelection!.storeId, name: lockedDelivery.storeSelection!.storeName, address: "" } : undefined,
    studioPickup: method === "studio_pickup" ? { preferredDate: cycle.plannedDate } : undefined,
    deliveryAddress: method === "home_delivery" ? structuredClone(lockedDelivery.deliveryAddress) : undefined,
    payment: method === "home_delivery" ? homePayment : method === "711_cod" ? "cash_on_delivery" : "pickup_confirmation",
    paymentDetails: method === "home_delivery" ? { method: homePayment, status: "pending", paidAt: null } : undefined,
    codServiceFee: method === "home_delivery" ? codServiceFee : undefined,
    delivery: method === "home_delivery" ? "宅配" : method === "711_cod" ? "7-ELEVEN 門市取貨付款" : "KD Coffee 工作室自取",
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
    dedicatedRoast: subscriptionDedicatedRoastOperationalSummary(cycle.itemsSnapshot, website, cycle.dedicatedRoastRush),
    lineNotification: { sent: false, status: "pending" },
    idempotencyKey: `subscription-cycle:${cycle.cycleId}`,
  };
}

export function subscriptionInventoryItems(
  cycle: SubscriptionCycle,
  website: WebsiteData,
): RequestedItem[] {
  if (!cycle.itemsSnapshot?.length) {
    throw new Error("本期尚未完成商品快照");
  }

  return subscriptionItemsToRequestedItems(cycle.itemsSnapshot, website);
}
export async function runSubscriptionOrderScheduler(options: { today?: string; now?: Date; stateFilePath?: string; rulesFilePath?: string; orderDir?: string; websiteFilePath?: string } = {}) {
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
        if (
          !subscription ||
          !["scheduled", "modifiable", "locked"].includes(cycle.status) ||
          (
            subscription.status !== "active" &&
            cycle.status !== "locked" &&
            cycle.kind !== "manual_replenishment"
          )
        ) {
          summary.skipped += 1; summary.items.push({ cycleId: candidate.cycleId, result: "skipped", message: "定期購目前不符合自動建單條件" }); continue;
        }
        if (cycle.status !== "locked") {
          cycle = await lockSubscriptionCycle({ cycleId: cycle.cycleId, idempotencyKey: `scheduler-lock:${cycle.cycleId}`, now: options.now, stateFilePath: options.stateFilePath, rulesFilePath: options.rulesFilePath });
        }
        state = await readMembershipCommerceState(options.stateFilePath);
        const latestSubscription = state.subscriptions[cycle.subscriptionId];
        const websiteFile = options.websiteFilePath ?? getWebsiteDataFile();
        const website = JSON.parse(
          await fs.readFile(websiteFile, "utf8"),
        ) as WebsiteData;
        const order = schedulerOrder(state.cycles[cycle.cycleId], latestSubscription, await readMember(latestSubscription.memberId), options.now ?? new Date(), website);
        const existing = await fs.readFile(path.join(orderDir, `${order.orderNumber}.json`), "utf8").then((content) => JSON.parse(content)).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error));
        if (existing && existing.subscriptionCycleId !== cycle.cycleId) throw new Error("自動訂單編號與其他訂單衝突");

        if (existing) {
          const inventoryTransaction =
            existing.inventoryTransaction &&
            typeof existing.inventoryTransaction === "object"
              ? existing.inventoryTransaction as Record<string, unknown>
              : null;

          if (inventoryTransaction?.state !== "inventory_committed") {
            throw new Error("既有定期購訂單的庫存交易尚未完成，請先人工確認");
          }
        } else {
          const transaction = await runInventoryOrderTransaction({
            websiteFile,
            orderDir,
            items: subscriptionInventoryItems(
              state.cycles[cycle.cycleId],
              website,
            ),
            initialOrderNumber: order.orderNumber,
            generateOrderNumber: () => order.orderNumber,
            buildOrder: (candidateOrderNumber) => ({
              order: {
                ...order,
                orderNumber: candidateOrderNumber,
              },
              lineText: "",
            }),
          });

          if (!transaction.finalized) {
            throw new Error(
              "定期購庫存已扣除，但訂單狀態尚未完成，請先人工確認",
            );
          }
        }

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
