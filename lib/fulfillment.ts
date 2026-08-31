import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { updateStoredOrderSafely, readOrder, type StoredOrder } from "./adminOrders";
import { atomicWriteJson, withFileLock } from "./jsonFileStore";
import { handleCanonicalOrderOutcome, handleReferralQualificationOrderOutcome } from "./membershipCommerce";
import { getFulfillmentSettingsFile, getFulfillmentStateFile } from "./storagePaths";
import { parseSevenElevenEmail, type FulfillmentEmailEvidence, type ParsedFulfillmentEvidence } from "./sevenElevenEmailParser";
import {
  fulfillmentStateLabels,
  fulfillmentStates,
  type FulfillmentEvent,
  type FulfillmentRecord,
  type FulfillmentSource,
  type FulfillmentState,
  type FulfillmentStore,
  type LogisticsSettings,
} from "./fulfillmentTypes";

export class FulfillmentError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "FulfillmentError";
    this.status = status;
  }
}

const ORDER_REFERENCE = /^CM[A-Z0-9]{8,20}$/;
const SHIPMENT_REFERENCE = /^E[A-Z0-9]{7,20}$/;
const TERMINAL = new Set<FulfillmentState>(["completed", "uncollected", "cancelled"]);
const PROGRESS: Partial<Record<FulfillmentState, number>> = {
  order_created: 0,
  preparing: 1,
  shipped: 2,
  in_transit: 3,
  arrived_at_pickup_store: 4,
  ready_for_store_pickup: 4,
  suspected_uncollected: 5,
  completed: 6,
  uncollected: 6,
  cancelled: 6,
};

function nowIso(now = new Date()) {
  return now.toISOString();
}

function emptyStore(now = new Date()): FulfillmentStore {
  const timestamp = nowIso(now);
  return { schemaVersion: 1, revision: 0, records: {}, reviews: [], processedFingerprints: {}, consequenceStatus: {}, createdAt: timestamp, updatedAt: timestamp };
}

export function defaultLogisticsSettings(now = new Date()): LogisticsSettings {
  return {
    schemaVersion: 1,
    revision: 0,
    notificationEmail: "kdcoffee.tw@gmail.com",
    automaticTrackingEnabled: false,
    pickupDeadlineDays: 7,
    expiryPolicy: "manual_review",
    trackedEvents: { orderCreated: true, shipped: true, arrived: true, completed: true },
    gmailConnection: { status: "not_connected", lastSyncedAt: null, recentProcessedCount: 0, reviewCount: 0 },
    updatedAt: nowIso(now),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateFulfillmentStore(value: unknown): FulfillmentStore {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.records) || !Array.isArray(value.reviews) || !isRecord(value.processedFingerprints) || !isRecord(value.consequenceStatus)) throw new FulfillmentError("履約資料格式不正確", 500);
  return value as FulfillmentStore;
}

export async function readFulfillmentStore(filePath = getFulfillmentStateFile()) {
  try {
    return validateFulfillmentStore(JSON.parse(await fs.readFile(filePath, "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return emptyStore();
    if (error instanceof FulfillmentError) throw error;
    throw new FulfillmentError("履約資料無法安全讀取", 500);
  }
}

export async function readLogisticsSettings(filePath = getFulfillmentSettingsFile()) {
  try {
    const value: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.trackedEvents) || !isRecord(value.gmailConnection)) throw new Error("invalid");
    return value as LogisticsSettings;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return defaultLogisticsSettings();
    throw new FulfillmentError("物流設定無法安全讀取", 500);
  }
}

export async function saveLogisticsSettings(input: { expectedRevision: number; notificationEmail: string; automaticTrackingEnabled: boolean; pickupDeadlineDays: number; expiryPolicy: LogisticsSettings["expiryPolicy"]; trackedEvents: LogisticsSettings["trackedEvents"]; filePath?: string; now?: Date }) {
  const filePath = input.filePath ?? getFulfillmentSettingsFile();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  return withFileLock(filePath, async () => {
    const current = await readLogisticsSettings(filePath);
    if (current.revision !== input.expectedRevision) throw new FulfillmentError("物流設定已由其他視窗更新，請重新整理後再試", 409);
    const email = input.notificationEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new FulfillmentError("請填寫正確的物流通知信箱");
    if (!Number.isInteger(input.pickupDeadlineDays) || input.pickupDeadlineDays < 1 || input.pickupDeadlineDays > 30) throw new FulfillmentError("取貨期限須為 1 至 30 天");
    if (input.expiryPolicy !== "manual_review") throw new FulfillmentError("逾期只能先進入人工確認，不能自動判定未取貨");
    const updated: LogisticsSettings = {
      ...current,
      revision: current.revision + 1,
      notificationEmail: email,
      automaticTrackingEnabled: input.automaticTrackingEnabled,
      pickupDeadlineDays: input.pickupDeadlineDays,
      expiryPolicy: "manual_review",
      trackedEvents: { ...input.trackedEvents },
      updatedAt: nowIso(input.now),
    };
    await atomicWriteJson(filePath, updated);
    return updated;
  }, { timeoutMs: 15_000 });
}

export async function updateGmailConnectionStatus(input: { status: LogisticsSettings["gmailConnection"]["status"]; recentProcessedCount: number; reviewCount: number; syncedAt?: string | null; filePath?: string; now?: Date }) {
  const filePath = input.filePath ?? getFulfillmentSettingsFile();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  return withFileLock(filePath, async () => {
    const current = await readLogisticsSettings(filePath);
    const updated: LogisticsSettings = {
      ...current,
      revision: current.revision + 1,
      gmailConnection: { status: input.status, lastSyncedAt: input.syncedAt ?? current.gmailConnection.lastSyncedAt, recentProcessedCount: Math.max(0, Math.floor(input.recentProcessedCount)), reviewCount: Math.max(0, Math.floor(input.reviewCount)) },
      updatedAt: nowIso(input.now),
    };
    await atomicWriteJson(filePath, updated);
    return updated;
  }, { timeoutMs: 15_000 });
}

function inferredState(order: StoredOrder): FulfillmentState {
  const status = String(order.status || "");
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  if (status === "uncollected") return "uncollected";
  if (status === "shipped" || status === "shipment_created") return "shipped";
  if (status === "ready_for_pickup") return order.orderMode === "studio_pickup" ? "ready_for_store_pickup" : "arrived_at_pickup_store";
  if (status === "confirmed") return "preparing";
  return "order_created";
}

function recordForOrder(store: FulfillmentStore, order: StoredOrder, now: Date) {
  const existing = store.records[order.orderNumber];
  if (existing) return existing;
  const timestamp = nowIso(now);
  const record: FulfillmentRecord = { orderId: order.orderNumber, currentState: inferredState(order), revision: 0, events: [], createdAt: timestamp, updatedAt: timestamp };
  store.records[order.orderNumber] = record;
  return record;
}

function canTransition(from: FulfillmentState, to: FulfillmentState, source: FulfillmentSource) {
  if (from === to) return "replay" as const;
  if (TERMINAL.has(from)) return source === "admin" ? "blocked" as const : "stale" as const;
  if (from === "exception_requires_review") return source === "admin" ? "advance" as const : "blocked" as const;
  if (to === "exception_requires_review") return "advance" as const;
  if (to === "suspected_uncollected") return ["arrived_at_pickup_store", "ready_for_store_pickup", "in_transit", "shipped"].includes(from) ? "advance" as const : "blocked" as const;
  if (to === "uncollected") return ["admin", "system"].includes(source) && ["suspected_uncollected", "arrived_at_pickup_store", "ready_for_store_pickup"].includes(from) ? "advance" as const : "blocked" as const;
  const fromRank = PROGRESS[from];
  const toRank = PROGRESS[to];
  if (fromRank === undefined || toRank === undefined) return "blocked" as const;
  return toRank > fromRank ? "advance" as const : "stale" as const;
}

function pickupDeadline(occurredAt: string, days: number) {
  const date = new Date(occurredAt);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function orderStatusForState(state: FulfillmentState, current: string) {
  if (state === "preparing") return "confirmed";
  if (state === "shipped" || state === "in_transit") return "shipped";
  if (state === "arrived_at_pickup_store" || state === "ready_for_store_pickup") return "ready_for_pickup";
  if (state === "completed") return "completed";
  if (state === "uncollected") return "uncollected";
  return current;
}

async function mirrorEventToOrder(order: StoredOrder, event: FulfillmentEvent, record: FulfillmentRecord) {
  await updateStoredOrderSafely(order.orderNumber, (latest) => {
    const existing = Array.isArray(latest.fulfillmentEvents) ? latest.fulfillmentEvents : [];
    const status = orderStatusForState(event.state, String(latest.status || ""));
    const changed = status !== latest.status;
    return {
      ...latest,
      status,
      updatedAt: event.recordedAt,
      fulfillmentSummary: {
        state: record.currentState,
        label: fulfillmentStateLabels[record.currentState],
        pickupDeadline: record.pickupDeadline,
        externalOrderId: record.externalOrderId,
        externalShipmentId: record.externalShipmentId,
      },
      fulfillmentEvents: existing.some((item: unknown) => isRecord(item) && item.eventId === event.eventId)
        ? existing
        : [...existing, { eventId: event.eventId, state: event.state, source: event.source, occurredAt: event.occurredAt, note: event.note }],
      statusHistory: changed ? [...(Array.isArray(latest.statusHistory) ? latest.statusHistory : []), { from: latest.status, to: status, at: event.occurredAt, source: "fulfillment" }] : latest.statusHistory,
    };
  });
}

async function runConsequence(order: StoredOrder, event: FulfillmentEvent) {
  if (event.state === "cancelled") {
    const memberId = typeof order.member?.memberId === "string" ? order.member.memberId : undefined;
    if (memberId) await handleReferralQualificationOrderOutcome({ memberId, orderId: order.orderNumber, outcome: "cancelled", idempotencyKey: `fulfillment:${event.eventId}`, now: new Date(event.occurredAt) });
    return;
  }
  if (event.state !== "completed" && event.state !== "uncollected") return;
  const items = Array.isArray(order.items) ? order.items as Array<Record<string, unknown>> : [];
  const creditApplied = Math.max(0, Number(order.credit?.appliedAmount || 0));
  const merchandiseAmount = Math.max(0, Number(order.subtotal || 0) - creditApplied);
  const basePV = items.reduce((sum, item) => sum + Math.max(0, Number(item.basePV || 0)) * Math.max(1, Number(item.quantity || 1)), 0);
  const effectivePV = items.reduce((sum, item) => sum + Math.max(0, Number(item.effectivePV || item.basePV || 0)) * Math.max(1, Number(item.quantity || 1)), 0);
  await handleCanonicalOrderOutcome({
    orderId: order.orderNumber,
    outcome: event.state,
    memberId: typeof order.member?.memberId === "string" ? order.member.memberId : undefined,
    merchandiseAmount,
    basePV,
    effectivePV,
    discountRatio: basePV > 0 ? Math.min(1, effectivePV / basePV) : 1,
    eligibleItemCount: Array.isArray(order.items) ? order.items.reduce((sum: number, item: Record<string, unknown>) => sum + Math.max(0, Number(item.quantity) || 0), 0) : 0,
    idempotencyKey: `fulfillment:${event.eventId}`,
    now: new Date(event.occurredAt),
  });
}

async function persistStore(filePath: string, store: FulfillmentStore, now = new Date()) {
  store.revision += 1;
  store.updatedAt = nowIso(now);
  await atomicWriteJson(filePath, store);
}

function review(store: FulfillmentStore, parsed: ParsedFulfillmentEvidence, reason: "unknown_order" | "ambiguous_mapping" | "malformed_evidence", message: string, now: Date) {
  const reviewId = `review_${randomUUID()}`;
  store.reviews.push({ reviewId, reason, externalOrderId: parsed.externalOrderId, externalShipmentId: parsed.externalShipmentId, recognizedEvent: parsed.eventType, sourceFingerprint: parsed.sourceFingerprint, message, status: "open", createdAt: nowIso(now) });
  store.processedFingerprints[parsed.sourceFingerprint] = { reviewId };
  return reviewId;
}

async function appendCanonicalEvent(input: { order: StoredOrder; state: FulfillmentState; source: FulfillmentSource; sourceFingerprint: string; sourceReference?: string; externalOrderId?: string; externalShipmentId?: string; occurredAt: string; actor?: string; note?: string; expectedRevision?: number; filePath: string; settings: LogisticsSettings; now: Date }) {
  return withFileLock(input.filePath, async () => {
    const store = await readFulfillmentStore(input.filePath);
    const existingPointer = store.processedFingerprints[input.sourceFingerprint];
    const existingRecord = existingPointer?.orderId ? store.records[existingPointer.orderId] : undefined;
    const existingEvent = existingRecord?.events.find((event) => event.eventId === existingPointer.eventId);
    if (existingEvent) {
      if (store.consequenceStatus[existingEvent.eventId] !== "completed") {
        await mirrorEventToOrder(input.order, existingEvent, existingRecord!);
        try {
          await runConsequence(input.order, existingEvent);
          store.consequenceStatus[existingEvent.eventId] = "completed";
        } catch {
          store.consequenceStatus[existingEvent.eventId] = "failed";
        }
        await persistStore(input.filePath, store, input.now);
      }
      return { event: existingEvent, record: existingRecord!, replayed: true, ignored: false };
    }

    const record = recordForOrder(store, input.order, input.now);
    if (input.expectedRevision !== undefined && record.revision !== input.expectedRevision) throw new FulfillmentError("訂單履約狀態已更新，請重新整理後再試", 409);
    const transition = canTransition(record.currentState, input.state, input.source);
    if (transition === "blocked") throw new FulfillmentError(`不能由「${fulfillmentStateLabels[record.currentState]}」變更為「${fulfillmentStateLabels[input.state]}」`, 409);
    if (transition === "stale" || transition === "replay") {
      store.processedFingerprints[input.sourceFingerprint] = { orderId: record.orderId };
      await persistStore(input.filePath, store, input.now);
      return { event: undefined, record, replayed: transition === "replay", ignored: true };
    }

    const revision = record.revision + 1;
    const event: FulfillmentEvent = {
      eventId: `ful_${randomUUID()}`,
      orderId: input.order.orderNumber,
      state: input.state,
      source: input.source,
      sourceFingerprint: input.sourceFingerprint,
      sourceReference: input.sourceReference,
      externalOrderId: input.externalOrderId,
      externalShipmentId: input.externalShipmentId,
      occurredAt: input.occurredAt,
      recordedAt: nowIso(input.now),
      actor: input.actor,
      note: input.note,
      revision,
    };
    record.currentState = input.state;
    record.revision = revision;
    record.updatedAt = event.recordedAt;
    record.externalOrderId = input.externalOrderId || record.externalOrderId;
    record.externalShipmentId = input.externalShipmentId || record.externalShipmentId;
    if (input.state === "arrived_at_pickup_store") {
      record.arrivedAt = input.occurredAt;
      record.pickupDeadline = pickupDeadline(input.occurredAt, input.settings.pickupDeadlineDays);
    }
    record.events.push(event);
    store.processedFingerprints[input.sourceFingerprint] = { eventId: event.eventId, orderId: record.orderId };
    store.consequenceStatus[event.eventId] = event.state === "completed" || event.state === "uncollected" || event.state === "cancelled" ? "pending" : "completed";
    await persistStore(input.filePath, store, input.now);
    await mirrorEventToOrder(input.order, event, record);
    if (store.consequenceStatus[event.eventId] === "pending") {
      try {
        await runConsequence(input.order, event);
        store.consequenceStatus[event.eventId] = "completed";
      } catch (error) {
        store.consequenceStatus[event.eventId] = "failed";
        await persistStore(input.filePath, store, input.now);
        throw error;
      }
      await persistStore(input.filePath, store, input.now);
    }
    return { event, record, replayed: false, ignored: false };
  }, { timeoutMs: 20_000 });
}

export async function associateExternalFulfillment(input: { orderId: string; externalOrderId: string; externalShipmentId?: string; expectedRevision?: number; filePath?: string; now?: Date }) {
  const externalOrderId = input.externalOrderId.trim().toUpperCase();
  const externalShipmentId = input.externalShipmentId?.trim().toUpperCase() || undefined;
  if (!ORDER_REFERENCE.test(externalOrderId)) throw new FulfillmentError("賣貨便訂單編號格式不正確");
  if (externalShipmentId && !SHIPMENT_REFERENCE.test(externalShipmentId)) throw new FulfillmentError("交貨便單號格式不正確");
  const order = await readOrder(input.orderId);
  if (!order) throw new FulfillmentError("找不到訂單", 404);
  if (order.orderMode !== "711_cod") throw new FulfillmentError("只有 7-ELEVEN 訂單可以連結賣貨便編號");
  const filePath = input.filePath ?? getFulfillmentStateFile();
  const now = input.now ?? new Date();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  return withFileLock(filePath, async () => {
    const store = await readFulfillmentStore(filePath);
    const conflicts = Object.values(store.records).filter((record) => record.orderId !== input.orderId && (record.externalOrderId === externalOrderId || (externalShipmentId && record.externalShipmentId === externalShipmentId)));
    if (conflicts.length) throw new FulfillmentError("此外部物流編號已連結其他訂單，請人工確認", 409);
    const record = recordForOrder(store, order, now);
    if (input.expectedRevision !== undefined && record.revision !== input.expectedRevision) throw new FulfillmentError("訂單履約狀態已更新，請重新整理後再試", 409);
    record.externalOrderId = externalOrderId;
    record.externalShipmentId = externalShipmentId || record.externalShipmentId;
    record.revision += 1;
    record.updatedAt = nowIso(now);
    for (const item of store.reviews) {
      if (item.status === "open" && item.externalOrderId === externalOrderId) {
        item.status = "resolved";
        item.resolvedAt = nowIso(now);
        delete store.processedFingerprints[item.sourceFingerprint];
      }
    }
    await persistStore(filePath, store, now);
    return record;
  }, { timeoutMs: 15_000 });
}

export async function processSevenElevenEmail(evidence: FulfillmentEmailEvidence, options: { filePath?: string; settingsFilePath?: string; now?: Date } = {}) {
  const parsed = parseSevenElevenEmail(evidence);
  const settings = await readLogisticsSettings(options.settingsFilePath);
  if (!parsed.recognized || !parsed.eventType || !parsed.externalOrderId) {
    if (!settings.automaticTrackingEnabled || parsed.reason === "wrong_sender") return { parsed, mutated: false, review: false };
    const filePath = options.filePath ?? getFulfillmentStateFile();
    const now = options.now ?? new Date();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const reviewId = await withFileLock(filePath, async () => {
      const store = await readFulfillmentStore(filePath);
      const replay = store.processedFingerprints[parsed.sourceFingerprint];
      if (replay?.reviewId) return replay.reviewId;
      const created = review(store, parsed, "malformed_evidence", "收到可信寄件者的新格式通知，系統未猜測狀態，請人工確認", now);
      await persistStore(filePath, store, now);
      return created;
    }, { timeoutMs: 15_000 });
    return { parsed, mutated: false, review: true, reviewId };
  }
  const tracked = { order_created: settings.trackedEvents.orderCreated, shipped: settings.trackedEvents.shipped, arrived_at_pickup_store: settings.trackedEvents.arrived, completed: settings.trackedEvents.completed }[parsed.eventType];
  if (!settings.automaticTrackingEnabled || !tracked) return { parsed, mutated: false, review: false };
  const filePath = options.filePath ?? getFulfillmentStateFile();
  const now = options.now ?? new Date();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const lookup = await withFileLock(filePath, async () => {
    const store = await readFulfillmentStore(filePath);
    const replay = store.processedFingerprints[parsed.sourceFingerprint];
    if (replay?.reviewId) return { reviewId: replay.reviewId, orderId: undefined };
    if (replay?.orderId) return { orderId: replay.orderId, reviewId: undefined };
    const matches = Object.values(store.records).filter((record) => record.externalOrderId === parsed.externalOrderId);
    if (matches.length !== 1) {
      const reviewId = review(store, parsed, matches.length ? "ambiguous_mapping" : "unknown_order", matches.length ? "物流編號對應多張訂單，請人工確認" : "找不到此外部物流編號對應的 KD Coffee 訂單", now);
      await persistStore(filePath, store, now);
      return { reviewId, orderId: undefined };
    }
    return { orderId: matches[0].orderId, reviewId: undefined };
  }, { timeoutMs: 15_000 });
  if (lookup.reviewId) return { parsed, mutated: false, review: true, reviewId: lookup.reviewId };
  const order = await readOrder(lookup.orderId!);
  if (!order) return { parsed, mutated: false, review: true };
  const result = await appendCanonicalEvent({ order, state: parsed.eventType, source: "seven_eleven_email", sourceFingerprint: parsed.sourceFingerprint, sourceReference: evidence.messageId?.slice(0, 300), externalOrderId: parsed.externalOrderId, externalShipmentId: parsed.externalShipmentId, occurredAt: parsed.eventTimestamp, filePath, settings, now });
  return { parsed, mutated: !result.ignored, review: false, ...result };
}

export async function recordAdminFulfillmentEvent(input: { orderId: string; state: FulfillmentState; expectedRevision: number; confirmed?: boolean; note?: string; filePath?: string; settingsFilePath?: string; now?: Date; actor?: string }) {
  if (!(fulfillmentStates as readonly string[]).includes(input.state)) throw new FulfillmentError("履約狀態不正確");
  if (["completed", "uncollected", "cancelled"].includes(input.state) && input.confirmed !== true) throw new FulfillmentError("此操作需要再次確認");
  const order = await readOrder(input.orderId);
  if (!order) throw new FulfillmentError("找不到訂單", 404);
  const now = input.now ?? new Date();
  const settings = await readLogisticsSettings(input.settingsFilePath);
  const sourceFingerprint = createHash("sha256").update(`admin:${input.orderId}:${input.state}:${input.expectedRevision}`).digest("hex");
  const filePath = input.filePath ?? getFulfillmentStateFile();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  return appendCanonicalEvent({ order, state: input.state, source: "admin", sourceFingerprint, occurredAt: nowIso(now), actor: input.actor || "後台管理員", note: input.note?.trim().slice(0, 200), expectedRevision: input.expectedRevision, filePath, settings, now });
}

export async function evaluatePickupDeadlines(options: { filePath?: string; settingsFilePath?: string; now?: Date } = {}) {
  const filePath = options.filePath ?? getFulfillmentStateFile();
  const now = options.now ?? new Date();
  const settings = await readLogisticsSettings(options.settingsFilePath);
  const store = await readFulfillmentStore(filePath);
  const due = Object.values(store.records).filter((record) => record.pickupDeadline && Date.parse(record.pickupDeadline) <= now.getTime() && ["arrived_at_pickup_store", "ready_for_store_pickup"].includes(record.currentState));
  const results = [];
  for (const record of due) {
    const target: FulfillmentState = "suspected_uncollected";
    const order = await readOrder(record.orderId);
    if (!order) continue;
    results.push(await appendCanonicalEvent({ order, state: target, source: "system", sourceFingerprint: createHash("sha256").update(`deadline:${record.orderId}:${record.pickupDeadline}`).digest("hex"), occurredAt: nowIso(now), note: "已超過取貨期限，尚未收到成功取貨通知", expectedRevision: record.revision, filePath, settings, now }));
  }
  return results;
}

export function fulfillmentRecordForOrder(store: FulfillmentStore, order: StoredOrder) {
  return store.records[order.orderNumber] || {
    orderId: order.orderNumber,
    currentState: inferredState(order),
    revision: 0,
    events: [],
    createdAt: order.createdAt,
    updatedAt: order.updatedAt || order.createdAt,
  } satisfies FulfillmentRecord;
}
