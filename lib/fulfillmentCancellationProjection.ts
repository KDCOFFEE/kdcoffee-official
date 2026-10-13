import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { withStoredOrderUpdateLock, OrderStatusTransitionError } from "./adminOrders";
import { hasOrderCompletion } from "./orderCompletion";
import { atomicWriteJson, withFileLock } from "./jsonFileStore";
import { getFulfillmentStateFile } from "./storagePaths";
import { fulfillmentStateLabels, type FulfillmentStore, type FulfillmentRecord, type FulfillmentEvent } from "./fulfillmentTypes";

/** Operational projection only. No inventory, credit, rewards, subscription or cancellation imports. */
export async function appendFulfillmentCancellationProjection(input: {
  orderNumber: string; filePath?: string; now?: Date;
}) {
  const filePath = input.filePath ?? getFulfillmentStateFile();
  const timestamp = (input.now ?? new Date()).toISOString();
  return withStoredOrderUpdateLock(input.orderNumber, async (order, persistOrder) => {
    if (hasOrderCompletion(order) || order.status !== "cancelled" ||
      order.canonicalCancellation?.state === "pending" ||
      ["return_failed", "return_pending"].includes(order.inventoryReturn?.state)) {
      throw new OrderStatusTransitionError("取消後果尚未完成，不能投影已取消履約");
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    return withFileLock(filePath, async () => {
      let store: FulfillmentStore;
      try {
        const value = JSON.parse(await fs.readFile(filePath, "utf8"));
        if (!value || value.schemaVersion !== 1 || !value.records || Array.isArray(value.records) ||
          !Array.isArray(value.reviews) || !value.processedFingerprints || !value.consequenceStatus) {
          throw new Error("履約資料格式不正確");
        }
        store = value;
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        store = { schemaVersion: 1, revision: 0, records: {}, reviews: [], processedFingerprints: {},
          consequenceStatus: {}, createdAt: timestamp, updatedAt: timestamp };
      }
      const summary = order.fulfillmentSummary;
      const record: FulfillmentRecord = store.records[input.orderNumber] ?? {
        orderId: input.orderNumber, currentState: "cancelled", revision: 0, events: [],
        externalOrderId: summary?.externalOrderId, externalShipmentId: summary?.externalShipmentId,
        pickupDeadline: summary?.pickupDeadline, createdAt: timestamp, updatedAt: timestamp,
      };
      if (record.currentState === "completed") throw new OrderStatusTransitionError("已完成履約不可投影為取消");
      const fingerprint = createHash("sha256").update(`canonical-cancel:${input.orderNumber}`).digest("hex");
      let event = record.events.find(item => item.sourceFingerprint === fingerprint);
      const replayed = Boolean(event);
      if (!event) {
        event = {
          eventId: "ful_cancel_" + fingerprint, orderId: input.orderNumber, state: "cancelled", source: "system",
          sourceFingerprint: fingerprint, sourceReference: `order-cancel:${input.orderNumber}`,
          occurredAt: order.cancelledAt || timestamp, recordedAt: timestamp,
          actor: order.cancelledBy || "canonical cancellation", note: order.cancellationReason,
          externalOrderId: record.externalOrderId, externalShipmentId: record.externalShipmentId,
          revision: record.revision + 1,
        } satisfies FulfillmentEvent;
        record.events.push(event);
        record.revision = event.revision;
        record.currentState = "cancelled";
        record.updatedAt = timestamp;
        store.records[input.orderNumber] = record;
        store.processedFingerprints[fingerprint] = { eventId: event.eventId, orderId: input.orderNumber };
        store.consequenceStatus[event.eventId] = "completed"; // Business effects have already completed in the core.
        store.revision += 1;
        store.updatedAt = timestamp;
        await atomicWriteJson(filePath, store);
      }
      const existing: Array<Record<string, unknown>> = Array.isArray(order.fulfillmentEvents) ? order.fulfillmentEvents : [];
      let projected = order;
      if (order.fulfillmentSummary?.state !== "cancelled" || !existing.some(item => item.eventId === event.eventId)) {
        projected = await persistOrder({
          ...order,
          fulfillmentSummary: { ...summary, state: "cancelled", label: fulfillmentStateLabels.cancelled,
            pickupDeadline: record.pickupDeadline, externalOrderId: record.externalOrderId, externalShipmentId: record.externalShipmentId },
          fulfillmentEvents: existing.some(item => item.eventId === event.eventId) ? existing :
            [...existing, { eventId: event.eventId, state: event.state, source: event.source, occurredAt: event.occurredAt, note: event.note }],
        });
      }
      return { order: projected, event, record, replayed, ignored: false };
    }, { timeoutMs: 20_000 });
  });
}
