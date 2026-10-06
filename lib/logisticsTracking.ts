import { promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { atomicWriteJson, withFileLock } from "./jsonFileStore";
import { sendInternalLineNotification } from "./internalLineNotifications";
import { fulfillmentStateLabels, type FulfillmentStore, type LogisticsSettings, type FulfillmentEmailEventType } from "./fulfillmentTypes";
import type { ParsedFulfillmentEvidence } from "./sevenElevenEmailParser";

const ranks: Record<FulfillmentEmailEventType, number> = { order_created: 0, shipped: 1, arrived_at_pickup_store: 2, completed: 3 };
const keys = { order_created: "orderCreated", shipped: "shipped", arrived_at_pickup_store: "arrived", completed: "completed" } as const;

// Separate from commerce records: external purchases never trigger stock or rewards.
export async function trackLogisticsEmail(parsed: ParsedFulfillmentEvidence, options: {
  filePath: string; settings: LogisticsSettings; now: Date;
  sender?: typeof sendInternalLineNotification;
}) {
  if (!parsed.recognized || !parsed.externalOrderId || !parsed.eventType) return { changed: false };
  const externalOrderId = parsed.externalOrderId;
  const state = parsed.eventType;
  return withFileLock(options.filePath, async () => {
    let store: FulfillmentStore;
    try { store = JSON.parse(await fs.readFile(options.filePath, "utf8")); }
    catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      const at = options.now.toISOString();
      store = { schemaVersion: 1, revision: 0, records: {}, reviews: [], processedFingerprints: {}, consequenceStatus: {}, createdAt: at, updatedAt: at };
    }
    if (store.schemaVersion !== 1 || !store.records || !Array.isArray(store.reviews)) throw new Error("物流追蹤資料無法安全讀取");
    store.logisticsTracking ??= {};
    const existing = store.logisticsTracking[externalOrderId];
    const record = existing ?? { externalOrderId, currentState: state, updatedAt: parsed.eventTimestamp, events: [] };
    store.logisticsTracking[externalOrderId] = record;
    let event = record.events.find((item) => item.state === state);
    if (event && (event.notification.status === "sent" || event.notification.status === "disabled")) return { changed: false };
    const changed = !event && (!existing || ranks[state] > ranks[record.currentState]);
    if (!event && !changed) return { changed: false };
    if (!event) {
      const enabled = (options.settings.internalLineEvents ?? { orderCreated: true, shipped: true, arrived: true, completed: true })[keys[state]];
      event = { state, occurredAt: parsed.eventTimestamp, notification: { status: enabled ? "pending" : "disabled", retryKey: randomUUID() } };
      record.events.push(event);
      record.currentState = state;
      record.updatedAt = parsed.eventTimestamp;
      record.externalShipmentId = parsed.externalShipmentId || record.externalShipmentId;
    }
    // Persist the retry key before sending, so a crash cannot create a new send key.
    const persist = async () => {
      store.revision += 1;
      store.updatedAt = options.now.toISOString();
      await atomicWriteJson(options.filePath, store);
    };
    await persist();
    if (event.notification.status === "pending" || event.notification.status === "failed") {
      const enabled = (options.settings.internalLineEvents ?? { orderCreated: true, shipped: true, arrived: true, completed: true })[keys[state]];
      if (!enabled) { event.notification.status = "disabled"; await persist(); return { changed }; }
      // LINE deduplicates retry keys for 24 hours. Leave older uncertain sends for review.
      const previousAttempt = event.notification.attemptedAt;
      if (previousAttempt && options.now.getTime() - Date.parse(previousAttempt) >= 23 * 60 * 60 * 1000) {
        event.notification.status = "failed";
        event.notification.reason = "重試期限已過，請人工核對內部群組，避免重複通知";
        await persist();
        return { changed };
      }
      const recipientHash = createHash("sha256").update(process.env.LINE_INTERNAL_RECIPIENT_ID?.trim() || process.env.LINE_ORDER_RECIPIENT_ID?.trim() || "").digest("hex");
      if (event.notification.recipientHash && event.notification.recipientHash !== recipientHash) {
        event.notification.status = "failed";
        event.notification.reason = "內部通知群組設定已變更，請人工確認原通知結果";
        await persist();
        return { changed };
      }
      event.notification.recipientHash ??= recipientHash;
      event.notification.text ??= [
        "KD Coffee｜7-ELEVEN 物流通知",
        `狀態：${fulfillmentStateLabels[state]}`,
        `賣貨便訂單：${externalOrderId}`,
        ...(record.externalShipmentId ? [`交貨便單號：${record.externalShipmentId}`] : []),
        `通知時間：${new Date(event.occurredAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`,
      ].join("\n");
      event.notification.attemptedAt ??= options.now.toISOString();
      await persist();
      try {
        const result = await (options.sender ?? sendInternalLineNotification)(event.notification.text, { retryKey: event.notification.retryKey });
        event.notification.status = result.sent ? "sent" : "failed";
        event.notification.reason = result.sent ? undefined : result.reason;
      } catch { event.notification.status = "failed"; event.notification.reason = "內部 LINE 通知失敗，等待下次同步重試"; }
      await persist();
    }
    return { changed };
  }, { timeoutMs: 60_000 });
}
