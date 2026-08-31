import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { readOrder, updateStoredOrderSafely } from "./adminOrders";
import { getDateOnlyInTimeZone } from "./checkoutRules";
import { readFulfillmentStore, fulfillmentRecordForOrder, FulfillmentError } from "./fulfillment";
import { withFileLock } from "./jsonFileStore";
import { getActiveMembershipRules } from "./membershipBusinessRules";
import { resolvePickupDateAvailability } from "./membershipPolicies";
import { getFulfillmentStateFile } from "./storagePaths";

export type OwnerOrderExceptionInput = { orderId: string; action: "change-date" | "change-store"; expectedFulfillmentRevision: number; idempotencyKey: string; reason: string; date?: string; store?: { id: string; name: string; address: string }; now?: Date };

const SAFE_STATES = new Set(["order_created", "preparing"]);

export async function applyOwnerOrderException(input: OwnerOrderExceptionInput) {
  const fulfillmentFile = getFulfillmentStateFile();
  await fs.mkdir(path.dirname(fulfillmentFile), { recursive: true });
  return withFileLock(fulfillmentFile, () => applyOwnerOrderExceptionLocked(input), { timeoutMs: 15_000 });
}

async function applyOwnerOrderExceptionLocked(input: OwnerOrderExceptionInput) {
  if (!input.idempotencyKey.trim() || !input.reason.trim()) throw new FulfillmentError("請填寫調整原因");
  const order = await readOrder(input.orderId);
  if (!order) throw new FulfillmentError("找不到訂單", 404);
  const record = fulfillmentRecordForOrder(await readFulfillmentStore(), order);
  if (record.revision !== input.expectedFulfillmentRevision) throw new FulfillmentError("訂單履約狀態已更新，請重新整理後再試", 409);
  if (!SAFE_STATES.has(record.currentState)) throw new FulfillmentError("訂單已進入不可逆物流階段，不能再調整", 409);
  const version = await getActiveMembershipRules(input.now);
  if (input.action === "change-date" && !version.rules.ownerExceptions.canUnlockDate) throw new FulfillmentError("目前未開放 Owner 調整日期", 403);
  if (input.action === "change-store" && !version.rules.ownerExceptions.canUnlockStore) throw new FulfillmentError("目前未開放 Owner 調整門市", 403);
  if (input.action === "change-date") {
    if (!input.date) throw new FulfillmentError("請選擇新日期");
    const customRoast = Array.isArray(order.items) && order.items.some((item: Record<string, unknown>) => item.customRoast === true);
    const availability = resolvePickupDateAvailability({ requestedDate: input.date, today: getDateOnlyInTimeZone(input.now ?? new Date()), customRoast, rules: version.rules });
    if (!availability.allowed) throw new FulfillmentError(availability.reason === "blocked-date" ? "這一天暫停自取" : `最早可選 ${availability.earliestDate}`);
  }
  if (input.action === "change-store") {
    const store = input.store;
    if (order.orderMode !== "711_cod" || !store || !/^[0-9A-Za-z]{4,10}$/.test(store.id) || !store.name.trim()) throw new FulfillmentError("請填寫正確的 7-ELEVEN 門市資料");
  }
  const timestamp = (input.now ?? new Date()).toISOString();
  return updateStoredOrderSafely(input.orderId, (latest) => {
    const audits = Array.isArray(latest.ownerExceptionAudit) ? latest.ownerExceptionAudit : [];
    const replay = audits.find((item: Record<string, unknown>) => item.idempotencyKey === input.idempotencyKey);
    if (replay) return latest;
    const before = input.action === "change-date" ? String(latest.studioPickup?.preferredDate || latest.ownerExpectedDate || "") : { id: String(latest.store?.id || ""), name: String(latest.store?.name || ""), address: String(latest.store?.address || "") };
    const after = input.action === "change-date" ? input.date! : input.store!;
    return {
      ...latest,
      ...(input.action === "change-date" ? (latest.orderMode === "studio_pickup" ? { studioPickup: { ...latest.studioPickup, preferredDate: input.date } } : { ownerExpectedDate: input.date }) : { store: input.store }),
      updatedAt: timestamp,
      ownerExceptionAudit: [...audits, { auditId: `override_${randomUUID()}`, idempotencyKey: input.idempotencyKey, action: input.action, before, after, at: timestamp, actor: "後台管理員", reason: input.reason.trim().slice(0, 200), fulfillmentRevision: record.revision }],
      memberCenterNotifications: [...(Array.isArray(latest.memberCenterNotifications) ? latest.memberCenterNotifications : []), { id: `notice_${input.idempotencyKey}`, type: "owner-order-exception", createdAt: timestamp, read: false, text: input.action === "change-date" ? `訂單日期已調整為 ${input.date}` : `7-ELEVEN 取貨門市已調整為 ${input.store!.name}` }],
    };
  });
}
