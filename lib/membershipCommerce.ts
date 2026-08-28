import { createHash, randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import { atomicWriteJson, withFileLock } from "./jsonFileStore";
import { getCanonicalMemberRecord } from "./memberIdentity";
import {
  getActiveMembershipRules,
  OWNER_DECISION_REQUIRED,
  type MembershipBusinessRules,
  type RulesVersion,
} from "./membershipBusinessRules";
import {
  addTaipeiCalendarDays,
  addTaipeiCalendarMonths,
  applyPercentage,
  assertIntegerMoney,
  cycleDates,
  giftEligibleAt,
  giftQuantityForItems,
  maximumCreditRedemption,
  referralRewardForMerchandise,
  validateSubscriptionItem,
  type SubscriptionItem,
} from "./membershipPolicies";
import { getMembershipCommerceStateFile } from "./storagePaths";

export const MEMBERSHIP_COMMERCE_SCHEMA_VERSION = 1 as const;

export type SubscriptionStatus = "pending_activation" | "active" | "paused" | "terminated";
export type CycleStatus = "scheduled" | "modifiable" | "locked" | "order_created" | "shipped" | "ready_for_pickup" | "completed" | "skipped" | "blocked_stock" | "cancelled" | "uncollected";
export type CycleKind = "scheduled" | "manual_replenishment";

export type SubscriptionDefaultItem = SubscriptionItem & { unitPrice: number };

export type Subscription = {
  subscriptionId: string;
  memberId: string;
  status: SubscriptionStatus;
  startedFromOrderId: string;
  anchorDate: string;
  intervalDays: number;
  shippingMethod: string;
  storeSelection: { storeId: string; storeName: string } | null;
  defaultItems: SubscriptionDefaultItem[];
  rulesVersion: number;
  statusReason: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
};

export type PricingSnapshot = {
  merchandiseOriginal: number;
  subscriptionDiscountPercent: number;
  subscriptionPrice: number;
  campaignPrice: number | null;
  selectedPriceSource: "subscription" | "campaign";
  campaign: { campaignId: string; subscriptionEligible: boolean; adjustment: number; pricingMode: string } | null;
  creditReserved: number;
  shipping: number;
  finalAmount: number;
  currency: "TWD";
  roundingMode: string;
};

export type SubscriptionCycle = {
  cycleId: string;
  subscriptionId: string;
  sequence: number;
  kind: CycleKind;
  plannedDate: string;
  modificationDeadline: string;
  orderCreationDate: string;
  status: CycleStatus;
  itemsDraft: SubscriptionDefaultItem[];
  itemsSnapshot: SubscriptionDefaultItem[] | null;
  pricingSnapshot: PricingSnapshot | null;
  giftSnapshot: { eligible: boolean; quantity: number; selectedProductId: string | null; packingLockedAt: string | null } | null;
  shippingSnapshot: { method: string; storeSelection: { storeId: string; storeName: string } | null; freeShipping: boolean } | null;
  rulesSnapshot: RulesVersion | null;
  createdOrderId: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
};

export type ReferralRelationship = {
  relationshipId: string;
  referrerMemberId: string;
  referredMemberId: string;
  referralCode: string;
  safeDisplayName: string;
  status: "registered" | "qualified" | "inactive";
  createdAt: string;
  updatedAt: string;
};

export type ReferralConversion = {
  conversionId: string;
  relationshipId: string;
  orderId: string;
  status: "pending" | "rewarded" | "ineligible" | "uncollected";
  rewardCreditEntryId: string | null;
  pendingRewardAmount: number;
  occurredAt: string;
};

export type CreditEntry = {
  creditEntryId: string;
  memberId: string;
  sourceType: "referral" | "manual" | "promotion" | "compensation";
  sourceReference: string;
  amount: number;
  remainingAmount: number;
  issuedAt: string;
  expiresAt: string;
  status: "available" | "reserved" | "consumed" | "expired";
  createdAt: string;
  metadata: Record<string, string | number | boolean>;
};

export type CreditReservation = {
  reservationId: string;
  memberId: string;
  orderId: string;
  requestedAmount: number;
  amount: number;
  allocations: Array<{ creditEntryId: string; amount: number }>;
  status: "reserved" | "consumed" | "released";
  createdAt: string;
  updatedAt: string;
};

export type CommerceEvent = {
  eventId: string;
  type: string;
  memberId?: string;
  subscriptionId?: string;
  orderId?: string;
  occurredAt: string;
  safeData: Record<string, string | number | boolean>;
};

export type NotificationEvent = {
  notificationId: string;
  eventType: "modification_window" | "deadline_tomorrow" | "order_created" | "shipped" | "ready_for_pickup" | "uncollected_terminated" | "gift_eligible" | "stock_blocked" | "subscription_paused" | "subscription_resumed" | "subscription_terminated" | "cycle_skipped" | "referral_conversion" | "credit_issued" | "credit_expiring";
  memberId?: string;
  channels: Array<"member_center" | "email" | "line" | "admin">;
  status: "pending";
  sourceEvent: string;
  createdAt: string;
  safeData: Record<string, string | number | boolean>;
};

export type AuditRecord = {
  auditId: string;
  actor: "member" | "admin" | "system";
  action: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  before: Record<string, string | number | boolean>;
  after: Record<string, string | number | boolean>;
  reason: string;
  sourceEvent: string;
};

export type MembershipCommerceState = {
  schemaVersion: typeof MEMBERSHIP_COMMERCE_SCHEMA_VERSION;
  revision: number;
  createdAt: string;
  updatedAt: string;
  subscriptions: Record<string, Subscription>;
  cycles: Record<string, SubscriptionCycle>;
  referrals: Record<string, ReferralRelationship>;
  referralConversions: Record<string, ReferralConversion>;
  creditEntries: Record<string, CreditEntry>;
  creditReservations: Record<string, CreditReservation>;
  events: CommerceEvent[];
  notifications: NotificationEvent[];
  audit: AuditRecord[];
  idempotency: Record<string, { resultId: string; occurredAt: string }>;
};

export class MembershipCommerceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MembershipCommerceError";
  }
}

export class MembershipRevisionConflictError extends MembershipCommerceError {
  constructor() {
    super("資料已在其他視窗更新，請重新整理後再試一次。");
    this.name = "MembershipRevisionConflictError";
  }
}

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

function deterministicId(prefix: string, source: string) {
  return `${prefix}_${createHash("sha256").update(source).digest("hex").slice(0, 24)}`;
}

function nowIso(now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new MembershipCommerceError("時間格式不正確");
  return now.toISOString();
}

function emptyState(now = new Date()): MembershipCommerceState {
  const timestamp = nowIso(now);
  return { schemaVersion: 1, revision: 0, createdAt: timestamp, updatedAt: timestamp, subscriptions: {}, cycles: {}, referrals: {}, referralConversions: {}, creditEntries: {}, creditReservations: {}, events: [], notifications: [], audit: [], idempotency: {} };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateMembershipCommerceState(value: unknown): MembershipCommerceState {
  if (!isObject(value) || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") throw new MembershipCommerceError("會員商務資料格式不正確");
  for (const field of ["subscriptions", "cycles", "referrals", "referralConversions", "creditEntries", "creditReservations", "idempotency"] as const) if (!isObject(value[field])) throw new MembershipCommerceError("會員商務資料集合不完整");
  for (const field of ["events", "notifications", "audit"] as const) if (!Array.isArray(value[field])) throw new MembershipCommerceError("會員商務事件集合不完整");
  for (const entry of Object.values(value.creditEntries as Record<string, CreditEntry>)) {
    assertIntegerMoney(entry.amount, "抵用金");
    assertIntegerMoney(entry.remainingAmount, "抵用金餘額");
    if (entry.remainingAmount > entry.amount) throw new MembershipCommerceError("抵用金餘額超過發放金額");
  }
  return value as MembershipCommerceState;
}

export async function readMembershipCommerceState(filePath = getMembershipCommerceStateFile()) {
  try {
    return validateMembershipCommerceState(JSON.parse(await fs.readFile(filePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw error;
  }
}

async function transaction<T>(operation: (state: MembershipCommerceState, now: Date) => Promise<T> | T, options: { now?: Date; filePath?: string } = {}) {
  const filePath = options.filePath ?? getMembershipCommerceStateFile();
  const now = options.now ?? new Date();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  return withFileLock(filePath, async () => {
    const state = await readMembershipCommerceState(filePath);
    const result = await operation(state, now);
    state.revision += 1;
    state.updatedAt = nowIso(now);
    validateMembershipCommerceState(state);
    await atomicWriteJson(filePath, state);
    return result;
  });
}

function remember(state: MembershipCommerceState, key: string, resultId: string, now: Date) {
  state.idempotency[key] = { resultId, occurredAt: nowIso(now) };
}

function remembered(state: MembershipCommerceState, key: string) {
  return state.idempotency[key]?.resultId;
}

function audit(state: MembershipCommerceState, input: Omit<AuditRecord, "auditId" | "timestamp">, now: Date) {
  state.audit.push({ auditId: id("audit"), timestamp: nowIso(now), ...input });
}

function event(state: MembershipCommerceState, type: string, safeData: CommerceEvent["safeData"], now: Date, refs: Pick<CommerceEvent, "memberId" | "subscriptionId" | "orderId"> = {}) {
  const record: CommerceEvent = { eventId: id("event"), type, occurredAt: nowIso(now), safeData, ...refs };
  state.events.push(record);
  return record;
}

function notify(state: MembershipCommerceState, rules: MembershipBusinessRules, eventType: NotificationEvent["eventType"], sourceEvent: string, now: Date, input: { memberId?: string; safeData?: NotificationEvent["safeData"]; adminOnly?: boolean } = {}) {
  state.notifications.push({ notificationId: id("notice"), eventType, memberId: input.memberId, channels: input.adminOnly ? ["admin"] : [...rules.notification.channels], status: "pending", sourceEvent, createdAt: nowIso(now), safeData: input.safeData ?? {} });
}

async function assertCanonicalMember(memberId: string) {
  const member = await getCanonicalMemberRecord(memberId);
  if (!member || member.memberId !== memberId || member.status === "merged-tombstone") throw new MembershipCommerceError("定期購必須使用 I.0A 正式會員身份");
}

function cloneItems(items: SubscriptionDefaultItem[]) {
  return items.map((item) => ({ ...validateSubscriptionItem(item), unitPrice: assertIntegerMoney(item.unitPrice, "商品原價") }));
}

function assertMemberOwns(subscription: Subscription, memberId?: string) {
  if (memberId && subscription.memberId !== memberId) throw new MembershipCommerceError("無法存取其他會員的定期購");
}

function assertRevision(record: { revision: number }, expectedRevision?: number) {
  if (expectedRevision != null && record.revision !== expectedRevision) throw new MembershipRevisionConflictError();
}

function touch(record: { revision: number; updatedAt: string }, now: Date) {
  record.revision += 1;
  record.updatedAt = nowIso(now);
}

export async function createSubscription(input: { memberId: string; startedFromOrderId: string; anchorDate: string; intervalDays: number; shippingMethod: string; storeSelection?: Subscription["storeSelection"]; defaultItems: SubscriptionDefaultItem[]; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  await assertCanonicalMember(input.memberId);
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  if (!version.rules.subscription.intervalsDays.includes(input.intervalDays)) throw new MembershipCommerceError("此配送週期目前未開放");
  const items = cloneItems(input.defaultItems);
  const key = `subscription:create:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const existingId = remembered(state, key);
    if (existingId) return state.subscriptions[existingId];
    if (Object.values(state.subscriptions).some((subscription) => subscription.startedFromOrderId === input.startedFromOrderId)) throw new MembershipCommerceError("此首筆訂單已建立定期購");
    const subscriptionId = id("sub");
    const timestamp = nowIso(now);
    const subscription: Subscription = { subscriptionId, memberId: input.memberId, status: "pending_activation", startedFromOrderId: input.startedFromOrderId, anchorDate: input.anchorDate, intervalDays: input.intervalDays, shippingMethod: input.shippingMethod, storeSelection: input.storeSelection ?? null, defaultItems: items, rulesVersion: version.rulesVersion, statusReason: "等待首筆原價訂單成功取貨", createdAt: timestamp, updatedAt: timestamp, revision: 0 };
    state.subscriptions[subscriptionId] = subscription;
    remember(state, key, subscriptionId, now);
    audit(state, { actor: "member", action: "subscription-created", entityType: "subscription", entityId: subscriptionId, before: {}, after: { status: subscription.status }, reason: "首筆原價訂單建立定期購", sourceEvent: input.startedFromOrderId }, now);
    return subscription;
  }, { now: input.now, filePath: input.stateFilePath });
}

function giftProgress(state: MembershipCommerceState, subscriptionId: string) {
  let count = 0;
  for (const item of state.events) {
    if (item.subscriptionId !== subscriptionId) continue;
    if (item.type === "gift_progress_reset") count = 0;
    if (item.type === "qualifying_fulfillment") count += 1;
  }
  return count;
}

export async function activateSubscriptionFromPickup(input: { subscriptionId: string; orderId: string; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `subscription:activate:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const subscription = state.subscriptions[input.subscriptionId];
    if (!subscription) throw new MembershipCommerceError("找不到定期購");
    if (remembered(state, key)) return subscription;
    if (subscription.status !== "pending_activation") throw new MembershipCommerceError("只有等待首筆取貨的定期購可以啟動");
    subscription.status = "active";
    subscription.statusReason = "首筆原價訂單成功取貨";
    touch(subscription, now);
    const fulfillment = event(state, "qualifying_fulfillment", { fulfillmentNumber: 1, originalPriceOrder: true }, now, { memberId: subscription.memberId, subscriptionId: subscription.subscriptionId, orderId: input.orderId });
    remember(state, key, subscription.subscriptionId, now);
    audit(state, { actor: "system", action: "subscription-activated", entityType: "subscription", entityId: subscription.subscriptionId, before: { status: "pending_activation" }, after: { status: "active", giftProgress: 1 }, reason: "首筆原價訂單成功取貨", sourceEvent: fulfillment.eventId }, now);
    if (giftEligibleAt(1, version.rules)) notify(state, version.rules, "gift_eligible", fulfillment.eventId, now, { memberId: subscription.memberId, safeData: { fulfillmentNumber: 1 } });
    return subscription;
  }, { now: input.now, filePath: input.stateFilePath });
}

/** One membership entry point for canonical order outcomes. */
export async function handleCanonicalOrderOutcome(input: { orderId: string; outcome: "completed" | "uncollected"; memberId?: string; merchandiseAmount: number; eligibleItemCount?: number; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const snapshot = await readMembershipCommerceState(input.stateFilePath);
  const subscription = Object.values(snapshot.subscriptions).find((item) => item.startedFromOrderId === input.orderId);
  const cycle = Object.values(snapshot.cycles).find((item) => item.createdOrderId === input.orderId);
  const relationship = input.memberId
    ? Object.values(snapshot.referrals).find((item) => item.referredMemberId === input.memberId && item.status !== "inactive")
    : undefined;

  if (input.outcome === "completed") {
    if (subscription?.status === "pending_activation") {
      await activateSubscriptionFromPickup({ subscriptionId: subscription.subscriptionId, orderId: input.orderId, idempotencyKey: `${input.idempotencyKey}:activate`, now: input.now, stateFilePath: input.stateFilePath, rulesFilePath: input.rulesFilePath });
    }
    if (cycle) {
      await recordCycleFulfillment({ cycleId: cycle.cycleId, orderId: input.orderId, idempotencyKey: `${input.idempotencyKey}:cycle`, now: input.now, stateFilePath: input.stateFilePath, rulesFilePath: input.rulesFilePath });
    }
  } else if (subscription || cycle) {
    const linkedSubscription = subscription ?? snapshot.subscriptions[cycle!.subscriptionId];
    await markUncollected({ subscriptionId: linkedSubscription.subscriptionId, cycleId: cycle?.cycleId, orderId: input.orderId, idempotencyKey: `${input.idempotencyKey}:uncollected`, now: input.now, stateFilePath: input.stateFilePath, rulesFilePath: input.rulesFilePath });
  }

  if (relationship && input.memberId) {
    await processReferralOrderOutcome({ referredMemberId: input.memberId, orderId: input.orderId, outcome: input.outcome, orderMerchandiseAmount: input.merchandiseAmount, eligibleItemCount: input.eligibleItemCount, referrerCompletedOrders: 0, idempotencyKey: `${input.idempotencyKey}:referral`, now: input.now, stateFilePath: input.stateFilePath, rulesFilePath: input.rulesFilePath });
  }

  return { subscriptionHandled: Boolean(subscription || cycle), referralEvaluated: Boolean(relationship) };
}

export async function generateSubscriptionCycle(input: { subscriptionId: string; sequence: number; plannedDate: string; kind?: CycleKind; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `cycle:generate:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const existingId = remembered(state, key);
    if (existingId) return state.cycles[existingId];
    const subscription = state.subscriptions[input.subscriptionId];
    if (!subscription) throw new MembershipCommerceError("找不到定期購");
    if (subscription.status !== "active") throw new MembershipCommerceError("目前定期購不會建立新一期");
    const kind = input.kind ?? "scheduled";
    const duplicate = Object.values(state.cycles).find((cycle) => cycle.subscriptionId === input.subscriptionId && cycle.sequence === input.sequence && cycle.kind === kind);
    if (duplicate) { remember(state, key, duplicate.cycleId, now); return duplicate; }
    const dates = cycleDates(input.plannedDate, version.rules.subscription.modificationCutoffDays, version.rules.subscription.orderCreationLeadDays);
    const cycleId = id("cycle");
    const timestamp = nowIso(now);
    const cycle: SubscriptionCycle = { cycleId, subscriptionId: subscription.subscriptionId, sequence: input.sequence, kind, ...dates, status: "modifiable", itemsDraft: cloneItems(subscription.defaultItems), itemsSnapshot: null, pricingSnapshot: null, giftSnapshot: null, shippingSnapshot: null, rulesSnapshot: null, createdOrderId: null, createdAt: timestamp, updatedAt: timestamp, revision: 0 };
    state.cycles[cycleId] = cycle;
    remember(state, key, cycleId, now);
    audit(state, { actor: "system", action: "cycle-generated", entityType: "cycle", entityId: cycleId, before: {}, after: { status: cycle.status, sequence: cycle.sequence }, reason: kind === "scheduled" ? "依配送週期建立" : "會員立即補貨", sourceEvent: input.idempotencyKey }, now);
    return cycle;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function modifyCycleDate(input: { cycleId: string; plannedDate: string; recalculateAnchor: boolean; idempotencyKey: string; memberId?: string; expectedRevision?: number; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `cycle:date:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const cycle = state.cycles[input.cycleId];
    if (!cycle) throw new MembershipCommerceError("找不到配送期次");
    if (remembered(state, key)) return cycle;
    if (!["scheduled", "modifiable"].includes(cycle.status)) throw new MembershipCommerceError("本期已截止修改");
    const subscription = state.subscriptions[cycle.subscriptionId];
    assertMemberOwns(subscription, input.memberId);
    assertRevision(cycle, input.expectedRevision);
    const before = cycle.plannedDate;
    Object.assign(cycle, cycleDates(input.plannedDate, version.rules.subscription.modificationCutoffDays, version.rules.subscription.orderCreationLeadDays));
    if (input.recalculateAnchor) subscription.anchorDate = input.plannedDate;
    touch(cycle, now);
    if (input.recalculateAnchor) touch(subscription, now);
    remember(state, key, cycle.cycleId, now);
    audit(state, { actor: "member", action: "cycle-date-changed", entityType: "cycle", entityId: cycle.cycleId, before: { plannedDate: before }, after: { plannedDate: cycle.plannedDate, anchorChanged: input.recalculateAnchor }, reason: input.recalculateAnchor ? "從新日期重算後續週期" : "只修改本次", sourceEvent: input.idempotencyKey }, now);
    return cycle;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function updateCycleItems(input: { cycleId: string; items: SubscriptionDefaultItem[]; idempotencyKey: string; memberId?: string; expectedRevision?: number; now?: Date; stateFilePath?: string }) {
  const items = cloneItems(input.items);
  const key = `cycle:items:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const cycle = state.cycles[input.cycleId];
    if (!cycle) throw new MembershipCommerceError("找不到配送期次");
    if (remembered(state, key)) return cycle;
    if (!["scheduled", "modifiable"].includes(cycle.status)) throw new MembershipCommerceError("本期已截止修改");
    assertMemberOwns(state.subscriptions[cycle.subscriptionId], input.memberId);
    assertRevision(cycle, input.expectedRevision);
    cycle.itemsDraft = items;
    touch(cycle, now);
    remember(state, key, cycle.cycleId, now);
    return cycle;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function lockSubscriptionCycle(input: { cycleId: string; idempotencyKey: string; shipping: number; campaign?: PricingSnapshot["campaign"]; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `cycle:lock:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const cycle = state.cycles[input.cycleId];
    if (!cycle) throw new MembershipCommerceError("找不到配送期次");
    if (remembered(state, key)) return cycle;
    if (!["scheduled", "modifiable"].includes(cycle.status)) throw new MembershipCommerceError("本期無法鎖定");
    const subscription = state.subscriptions[cycle.subscriptionId];
    const items = cloneItems(cycle.itemsDraft);
    const original = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const subscriptionPrice = applyPercentage(original, version.rules.subscription.discountPercent, version.rules.money.roundingMode);
    const campaign = input.campaign ?? null;
    if (campaign?.subscriptionEligible && version.rules.campaign.eligiblePricingMode === OWNER_DECISION_REQUIRED) throw new MembershipCommerceError("活動適用定期購時的價格方式尚待 Owner 決定");
    const campaignAdjustment = campaign?.subscriptionEligible ? assertIntegerMoney(campaign.adjustment, "活動調整") : 0;
    const campaignPrice = campaign?.subscriptionEligible ? Math.max(0, original - campaignAdjustment) : null;
    const useCampaign = campaignPrice != null && (version.rules.campaign.eligiblePricingMode === "campaign-replaces-subscription" || version.rules.campaign.eligiblePricingMode === "campaign-defined" || (version.rules.campaign.eligiblePricingMode === "best-price" && campaignPrice < subscriptionPrice));
    const merchandisePrice = useCampaign ? campaignPrice : subscriptionPrice;
    const shipping = version.rules.shipping.subscriptionFreeShipping ? 0 : assertIntegerMoney(input.shipping, "運費");
    const progress = giftProgress(state, subscription.subscriptionId);
    const fulfillmentNumber = progress + 1;
    const giftEligible = giftEligibleAt(fulfillmentNumber, version.rules);
    cycle.status = "locked";
    cycle.itemsSnapshot = items;
    cycle.rulesSnapshot = structuredClone(version);
    cycle.pricingSnapshot = { merchandiseOriginal: original, subscriptionDiscountPercent: version.rules.subscription.discountPercent, subscriptionPrice, campaignPrice, selectedPriceSource: useCampaign ? "campaign" : "subscription", campaign, creditReserved: 0, shipping, finalAmount: Math.max(0, merchandisePrice + shipping), currency: "TWD", roundingMode: version.rules.money.roundingMode };
    cycle.giftSnapshot = { eligible: giftEligible, quantity: giftEligible ? giftQuantityForItems(items, version.rules) : 0, selectedProductId: null, packingLockedAt: null };
    cycle.shippingSnapshot = { method: subscription.shippingMethod, storeSelection: structuredClone(subscription.storeSelection), freeShipping: shipping === 0 };
    touch(cycle, now);
    remember(state, key, cycle.cycleId, now);
    audit(state, { actor: "system", action: "cycle-locked", entityType: "cycle", entityId: cycle.cycleId, before: { status: "modifiable" }, after: { status: "locked", rulesVersion: version.rulesVersion, finalAmount: cycle.pricingSnapshot.finalAmount }, reason: "會員修改期限截止", sourceEvent: input.idempotencyKey }, now);
    return cycle;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function createOrderFromCycle(input: { cycleId: string; orderId: string; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `cycle:order:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const cycle = state.cycles[input.cycleId];
    if (!cycle) throw new MembershipCommerceError("找不到配送期次");
    if (remembered(state, key)) return cycle;
    if (cycle.status !== "locked" || !cycle.pricingSnapshot) throw new MembershipCommerceError("本期尚未完成鎖定");
    if (Object.values(state.cycles).some((other) => other.createdOrderId === input.orderId)) throw new MembershipCommerceError("訂單已連結其他配送期次");
    cycle.status = "order_created";
    cycle.createdOrderId = input.orderId;
    touch(cycle, now);
    remember(state, key, cycle.cycleId, now);
    const source = event(state, "order_created", { cycleSequence: cycle.sequence }, now, { subscriptionId: cycle.subscriptionId, orderId: input.orderId });
    notify(state, version.rules, "order_created", source.eventId, now, { memberId: state.subscriptions[cycle.subscriptionId].memberId });
    return cycle;
  }, { now: input.now, filePath: input.stateFilePath });
}

const TRANSITIONS: Record<CycleStatus, CycleStatus[]> = {
  scheduled: ["modifiable", "skipped", "cancelled", "blocked_stock"],
  modifiable: ["locked", "skipped", "cancelled", "blocked_stock"],
  locked: ["order_created", "blocked_stock", "cancelled"],
  order_created: ["shipped", "cancelled", "uncollected"],
  shipped: ["ready_for_pickup", "uncollected"],
  ready_for_pickup: ["completed", "uncollected"],
  blocked_stock: ["modifiable", "skipped", "cancelled"],
  completed: [], skipped: [], cancelled: [], uncollected: [],
};

export async function transitionCycle(input: { cycleId: string; to: CycleStatus; reason: string; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `cycle:transition:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const cycle = state.cycles[input.cycleId];
    if (!cycle) throw new MembershipCommerceError("找不到配送期次");
    if (remembered(state, key)) return cycle;
    if (!TRANSITIONS[cycle.status].includes(input.to)) throw new MembershipCommerceError(`配送狀態不可由 ${cycle.status} 變更為 ${input.to}`);
    const before = cycle.status;
    cycle.status = input.to;
    touch(cycle, now);
    remember(state, key, cycle.cycleId, now);
    const source = event(state, `cycle_${input.to}`, { from: before, reason: input.reason }, now, { subscriptionId: cycle.subscriptionId, orderId: cycle.createdOrderId ?? undefined });
    const memberId = state.subscriptions[cycle.subscriptionId].memberId;
    if (input.to === "blocked_stock") notify(state, version.rules, "stock_blocked", source.eventId, now, { memberId });
    if (input.to === "shipped") notify(state, version.rules, "shipped", source.eventId, now, { memberId });
    if (input.to === "ready_for_pickup") notify(state, version.rules, "ready_for_pickup", source.eventId, now, { memberId });
    return cycle;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function handleCycleProductAvailability(input: { cycleId: string; availability: "out-of-stock" | "discontinued"; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const target: CycleStatus = input.availability === "out-of-stock" ? "blocked_stock" : "cancelled";
  return transitionCycle({ ...input, to: target, reason: input.availability === "out-of-stock" ? "定期購作品暫時缺貨，等待會員選擇" : "定期購作品已停售，停止此作品續訂" });
}

export async function lockCycleGiftSelection(input: { cycleId: string; availableProductIds: string[]; idempotencyKey: string; now?: Date; stateFilePath?: string }) {
  const key = `cycle:gift:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const cycle = state.cycles[input.cycleId];
    if (!cycle?.giftSnapshot || !cycle.rulesSnapshot) throw new MembershipCommerceError("本期尚未建立贈品快照");
    if (remembered(state, key)) return cycle.giftSnapshot;
    if (!["locked", "order_created"].includes(cycle.status)) throw new MembershipCommerceError("本期贈品已不可變更");
    const available = new Set(input.availableProductIds);
    const selected = cycle.rulesSnapshot.rules.gift.pool.filter((item) => item.enabled && available.has(item.productId)).sort((a, b) => a.priority - b.priority)[0];
    cycle.giftSnapshot.selectedProductId = cycle.giftSnapshot.eligible ? selected?.productId ?? null : null;
    cycle.giftSnapshot.packingLockedAt = nowIso(now);
    cycle.updatedAt = nowIso(now);
    remember(state, key, cycle.cycleId, now);
    audit(state, { actor: "system", action: "gift-packing-locked", entityType: "cycle", entityId: cycle.cycleId, before: {}, after: { eligible: cycle.giftSnapshot.eligible, selected: cycle.giftSnapshot.selectedProductId ?? "none", mainOrderBlocked: false }, reason: selected ? "依贈品候選順序選擇" : "無可用贈品，主商品照常出貨", sourceEvent: input.idempotencyKey }, now);
    return cycle.giftSnapshot;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function skipCycle(input: { cycleId: string; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  return transitionCycle({ ...input, to: "skipped", reason: "會員跳過本次" });
}

export async function memberSkipCycle(input: { memberId: string; cycleId: string; expectedRevision: number; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `cycle:member-skip:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const cycle = state.cycles[input.cycleId];
    if (!cycle) throw new MembershipCommerceError("找不到配送期次");
    if (remembered(state, key)) return cycle;
    assertMemberOwns(state.subscriptions[cycle.subscriptionId], input.memberId);
    assertRevision(cycle, input.expectedRevision);
    if (!["scheduled", "modifiable"].includes(cycle.status)) throw new MembershipCommerceError("本期已截止修改");
    const before = cycle.status;
    cycle.status = "skipped";
    touch(cycle, now);
    remember(state, key, cycle.cycleId, now);
    const source = event(state, "cycle_skipped", { sequence: cycle.sequence }, now, { memberId: input.memberId, subscriptionId: cycle.subscriptionId });
    notify(state, version.rules, "cycle_skipped", source.eventId, now, { memberId: input.memberId });
    audit(state, { actor: "member", action: "cycle-skipped", entityType: "cycle", entityId: cycle.cycleId, before: { status: before }, after: { status: "skipped" }, reason: "會員跳過本次", sourceEvent: source.eventId }, now);
    return cycle;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function updateSubscriptionPreferences(input: { memberId: string; subscriptionId: string; expectedRevision: number; idempotencyKey: string; shippingMethod?: string; storeSelection?: Subscription["storeSelection"]; defaultItems?: SubscriptionDefaultItem[]; now?: Date; stateFilePath?: string }) {
  const items = input.defaultItems ? cloneItems(input.defaultItems) : null;
  const key = `subscription:preferences:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const subscription = state.subscriptions[input.subscriptionId];
    if (!subscription) throw new MembershipCommerceError("找不到定期購");
    if (remembered(state, key)) return subscription;
    assertMemberOwns(subscription, input.memberId);
    assertRevision(subscription, input.expectedRevision);
    if (!["active", "paused"].includes(subscription.status)) throw new MembershipCommerceError("目前無法修改定期購內容");
    const beforeStore = subscription.storeSelection?.storeId ?? "none";
    if (input.shippingMethod) subscription.shippingMethod = input.shippingMethod;
    if (input.storeSelection !== undefined) subscription.storeSelection = structuredClone(input.storeSelection);
    if (items) subscription.defaultItems = items;
    touch(subscription, now);
    remember(state, key, subscription.subscriptionId, now);
    const source = event(state, "subscription_preferences_changed", { storeChanged: beforeStore !== (subscription.storeSelection?.storeId ?? "none"), itemsChanged: Boolean(items) }, now, { memberId: input.memberId, subscriptionId: subscription.subscriptionId });
    audit(state, { actor: "member", action: "subscription-preferences-changed", entityType: "subscription", entityId: subscription.subscriptionId, before: { storeId: beforeStore }, after: { storeId: subscription.storeSelection?.storeId ?? "none" }, reason: "會員修改後續配送設定", sourceEvent: source.eventId }, now);
    return subscription;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function setSubscriptionStatus(input: { subscriptionId: string; status: "paused" | "active" | "terminated"; reason: string; idempotencyKey: string; memberId?: string; expectedRevision?: number; resumeDate?: string; intervalDays?: number; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `subscription:status:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const subscription = state.subscriptions[input.subscriptionId];
    if (!subscription) throw new MembershipCommerceError("找不到定期購");
    if (remembered(state, key)) return subscription;
    assertMemberOwns(subscription, input.memberId);
    assertRevision(subscription, input.expectedRevision);
    const before = subscription.status;
    const allowed = (before === "active" && ["paused", "terminated"].includes(input.status)) || (before === "paused" && ["active", "terminated"].includes(input.status));
    if (!allowed) throw new MembershipCommerceError("定期購狀態無法進行這項變更");
    if (before === "paused" && input.status === "active") {
      if (version.rules.subscription.pauseResumeAnchorPolicy === OWNER_DECISION_REQUIRED) throw new MembershipCommerceError("恢復配送後的基準日期尚待 Owner 決定");
      if (version.rules.subscription.pauseResumeAnchorPolicy === "member-selects-date") {
        if (!input.resumeDate || !input.intervalDays || !version.rules.subscription.intervalsDays.includes(input.intervalDays)) throw new MembershipCommerceError("請選擇恢復配送日期與週期");
        const earliest = addTaipeiCalendarDays(nowIso(now).slice(0, 10), version.rules.subscription.preparationLeadDays);
        if (input.resumeDate < earliest) throw new MembershipCommerceError(`最早可從 ${earliest} 恢復配送`);
        subscription.anchorDate = input.resumeDate;
        subscription.intervalDays = input.intervalDays;
      }
    }
    subscription.status = input.status;
    subscription.statusReason = input.reason;
    touch(subscription, now);
    remember(state, key, subscription.subscriptionId, now);
    const source = event(state, `subscription_${input.status}`, { reason: input.reason }, now, { memberId: subscription.memberId, subscriptionId: subscription.subscriptionId });
    const notificationType = input.status === "paused" ? "subscription_paused" : input.status === "active" ? "subscription_resumed" : "subscription_terminated";
    notify(state, version.rules, notificationType, source.eventId, now, { memberId: subscription.memberId });
    audit(state, { actor: "member", action: `subscription-${input.status}`, entityType: "subscription", entityId: subscription.subscriptionId, before: { status: before }, after: { status: input.status }, reason: input.reason, sourceEvent: source.eventId }, now);
    return subscription;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function markUncollected(input: { subscriptionId: string; cycleId?: string; orderId: string; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `subscription:uncollected:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const subscription = state.subscriptions[input.subscriptionId];
    if (!subscription) throw new MembershipCommerceError("找不到定期購");
    if (remembered(state, key)) return subscription;
    const beforeProgress = giftProgress(state, subscription.subscriptionId);
    subscription.status = "terminated";
    subscription.statusReason = "首次未取貨，停止定期配送";
    subscription.updatedAt = nowIso(now);
    if (input.cycleId && state.cycles[input.cycleId] && !["completed", "cancelled", "skipped"].includes(state.cycles[input.cycleId].status)) state.cycles[input.cycleId].status = "uncollected";
    for (const cycle of Object.values(state.cycles)) if (cycle.subscriptionId === subscription.subscriptionId && ["scheduled", "modifiable", "blocked_stock"].includes(cycle.status)) cycle.status = "cancelled";
    const uncollected = event(state, "uncollected_order", { orderId: input.orderId }, now, { memberId: subscription.memberId, subscriptionId: subscription.subscriptionId, orderId: input.orderId });
    event(state, "gift_progress_reset", { previousProgress: beforeProgress, reason: "uncollected_order" }, now, { memberId: subscription.memberId, subscriptionId: subscription.subscriptionId, orderId: input.orderId });
    remember(state, key, subscription.subscriptionId, now);
    notify(state, version.rules, "uncollected_terminated", uncollected.eventId, now, { memberId: subscription.memberId });
    notify(state, version.rules, "uncollected_terminated", uncollected.eventId, now, { adminOnly: true, safeData: { subscriptionId: subscription.subscriptionId } });
    audit(state, { actor: "system", action: "uncollected-terminated", entityType: "subscription", entityId: subscription.subscriptionId, before: { giftProgress: beforeProgress }, after: { status: "terminated", giftProgress: 0 }, reason: "首次未取貨", sourceEvent: uncollected.eventId }, now);
    return subscription;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function assignReferralRelationship(input: { referrerMemberId: string; referredMemberId: string; safeDisplayName?: string; referralCode?: string; idempotencyKey: string; now?: Date; stateFilePath?: string }) {
  if (input.referrerMemberId === input.referredMemberId) throw new MembershipCommerceError("不可推薦自己");
  await Promise.all([assertCanonicalMember(input.referrerMemberId), assertCanonicalMember(input.referredMemberId)]);
  const key = `referral:assign:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const existingId = remembered(state, key);
    if (existingId) return state.referrals[existingId];
    const existing = Object.values(state.referrals).find((relationship) => relationship.referredMemberId === input.referredMemberId && relationship.status !== "inactive");
    if (existing) {
      if (existing.referrerMemberId !== input.referrerMemberId) throw new MembershipCommerceError("此會員已有推薦關係");
      remember(state, key, existing.relationshipId, now);
      return existing;
    }
    const relationshipId = id("refrel");
    const timestamp = nowIso(now);
    const relationship: ReferralRelationship = { relationshipId, referrerMemberId: input.referrerMemberId, referredMemberId: input.referredMemberId, referralCode: input.referralCode || deterministicId("KD", relationshipId).toUpperCase(), safeDisplayName: String(input.safeDisplayName || "").slice(0, 40), status: "registered", createdAt: timestamp, updatedAt: timestamp };
    state.referrals[relationshipId] = relationship;
    remember(state, key, relationshipId, now);
    audit(state, { actor: "system", action: "referral-assigned", entityType: "referral", entityId: relationshipId, before: {}, after: { status: "registered" }, reason: "推薦碼完成歸屬", sourceEvent: input.idempotencyKey }, now);
    return relationship;
  }, { now: input.now, filePath: input.stateFilePath });
}

function issueCreditInState(state: MembershipCommerceState, rules: MembershipBusinessRules, input: { memberId: string; sourceType: CreditEntry["sourceType"]; sourceReference: string; amount: number; metadata?: CreditEntry["metadata"] }, now: Date) {
  const duplicate = Object.values(state.creditEntries).find((entry) => entry.sourceType === input.sourceType && entry.sourceReference === input.sourceReference);
  if (duplicate) return duplicate;
  const amount = assertIntegerMoney(input.amount, "抵用金");
  if (amount < 1) throw new MembershipCommerceError("抵用金必須大於零");
  const issuedDate = nowIso(now).slice(0, 10);
  const expiryDate = addTaipeiCalendarMonths(issuedDate, rules.credit.expiryCalendarMonths);
  const creditEntryId = id("credit");
  const entry: CreditEntry = { creditEntryId, memberId: input.memberId, sourceType: input.sourceType, sourceReference: input.sourceReference, amount, remainingAmount: amount, issuedAt: nowIso(now), expiresAt: `${addTaipeiCalendarDays(expiryDate, 1)}T00:00:00+08:00`, status: "available", createdAt: nowIso(now), metadata: input.metadata ?? {} };
  state.creditEntries[creditEntryId] = entry;
  return entry;
}

export async function issueCredit(input: { memberId: string; sourceType: CreditEntry["sourceType"]; sourceReference: string; amount: number; metadata?: CreditEntry["metadata"]; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  await assertCanonicalMember(input.memberId);
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `credit:issue:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const existingId = remembered(state, key);
    if (existingId) return state.creditEntries[existingId];
    const entry = issueCreditInState(state, version.rules, input, now);
    remember(state, key, entry.creditEntryId, now);
    const source = event(state, "credit_issued", { amount: entry.amount, sourceType: entry.sourceType }, now, { memberId: entry.memberId });
    notify(state, version.rules, "credit_issued", source.eventId, now, { memberId: entry.memberId, safeData: { amount: entry.amount } });
    return entry;
  }, { now: input.now, filePath: input.stateFilePath });
}

function referralRewardAmount(rules: MembershipBusinessRules, orderMerchandiseAmount: number, eligibleItemCount = 0) {
  if (rules.referral.reward.mode === OWNER_DECISION_REQUIRED) return null;
  return referralRewardForMerchandise({ merchandiseAfterDiscounts: orderMerchandiseAmount, eligibleItemCount, rules });
}

export async function processReferralOrderOutcome(input: { referredMemberId: string; orderId: string; outcome: "completed" | "uncollected"; orderMerchandiseAmount: number; eligibleItemCount?: number; referrerCompletedOrders?: number; referrerLifetimeSpend?: number; referrerLastValidPurchaseAt?: string; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `referral:conversion:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const existingId = remembered(state, key);
    if (existingId) return state.referralConversions[existingId];
    const relationship = Object.values(state.referrals).find((item) => item.referredMemberId === input.referredMemberId && item.status !== "inactive");
    if (!relationship) return null;
    const sourceReference = `referral_conversion:${relationship.relationshipId}:${input.orderId}`;
    const existing = Object.values(state.referralConversions).find((conversion) => conversion.relationshipId === relationship.relationshipId && conversion.orderId === input.orderId);
    if (existing) { remember(state, key, existing.conversionId, now); return existing; }
    const eligibility = version.rules.referral.referrerEligibility;
    const recentThreshold = eligibility.mode === "recent-valid-purchase" ? now.getTime() - eligibility.withinDays * 86_400_000 : 0;
    const eligible = eligibility.mode === "none" || (eligibility.mode === "completed-orders" && (input.referrerCompletedOrders ?? 0) >= eligibility.minimumOrders) || (eligibility.mode === "lifetime-spend" && (input.referrerLifetimeSpend ?? 0) >= eligibility.minimumAmount) || (eligibility.mode === "recent-valid-purchase" && Date.parse(input.referrerLastValidPurchaseAt ?? "") >= recentThreshold);
    const calculatedReward = input.outcome === "completed" ? referralRewardAmount(version.rules, input.orderMerchandiseAmount, input.eligibleItemCount) : null;
    const repeatedAllowed = version.rules.referral.reward.repeatedRewards || !Object.values(state.referralConversions).some((item) => item.relationshipId === relationship.relationshipId && item.status === "rewarded");
    const rewardAmount = eligible && repeatedAllowed ? calculatedReward : null;
    const credit = rewardAmount ? issueCreditInState(state, version.rules, { memberId: relationship.referrerMemberId, sourceType: "referral", sourceReference, amount: rewardAmount, metadata: { relationshipId: relationship.relationshipId } }, now) : null;
    const conversionId = id("conversion");
    const pendingRewardAmount = input.outcome === "completed" && !eligible && calculatedReward ? calculatedReward : 0;
    const conversion: ReferralConversion = { conversionId, relationshipId: relationship.relationshipId, orderId: input.orderId, status: input.outcome === "uncollected" ? "uncollected" : credit ? "rewarded" : pendingRewardAmount ? "pending" : "ineligible", rewardCreditEntryId: credit?.creditEntryId ?? null, pendingRewardAmount, occurredAt: nowIso(now) };
    state.referralConversions[conversionId] = conversion;
    if (credit) relationship.status = "qualified";
    relationship.updatedAt = nowIso(now);
    remember(state, key, conversionId, now);
    const source = event(state, "referral_conversion", { status: conversion.status, rewardAmount: credit?.amount ?? 0 }, now, { memberId: relationship.referrerMemberId, orderId: input.orderId });
    if (credit) {
      notify(state, version.rules, "referral_conversion", source.eventId, now, { memberId: relationship.referrerMemberId, safeData: { rewardAmount: credit.amount } });
      notify(state, version.rules, "credit_issued", source.eventId, now, { memberId: relationship.referrerMemberId, safeData: { amount: credit.amount } });
    }
    return conversion;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function releasePendingReferralRewards(input: { referrerMemberId: string; completedOrders?: number; lifetimeSpend?: number; lastValidPurchaseAt?: string; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `referral:release-pending:${input.idempotencyKey}`;
  return transaction((state, now) => {
    if (remembered(state, key)) return [];
    const eligibility = version.rules.referral.referrerEligibility;
    const eligible = eligibility.mode === "none" || (eligibility.mode === "completed-orders" && (input.completedOrders ?? 0) >= eligibility.minimumOrders) || (eligibility.mode === "lifetime-spend" && (input.lifetimeSpend ?? 0) >= eligibility.minimumAmount) || (eligibility.mode === "recent-valid-purchase" && Date.parse(input.lastValidPurchaseAt ?? "") >= now.getTime() - eligibility.withinDays * 86_400_000);
    if (!eligible) return [];
    const relationshipIds = new Set(Object.values(state.referrals).filter((item) => item.referrerMemberId === input.referrerMemberId).map((item) => item.relationshipId));
    const released: CreditEntry[] = [];
    for (const conversion of Object.values(state.referralConversions).filter((item) => relationshipIds.has(item.relationshipId) && item.status === "pending" && item.pendingRewardAmount > 0)) {
      const credit = issueCreditInState(state, version.rules, { memberId: input.referrerMemberId, sourceType: "referral", sourceReference: `referral_conversion:${conversion.relationshipId}:${conversion.orderId}`, amount: conversion.pendingRewardAmount }, now);
      conversion.status = "rewarded";
      conversion.rewardCreditEntryId = credit.creditEntryId;
      conversion.pendingRewardAmount = 0;
      released.push(credit);
    }
    remember(state, key, released[0]?.creditEntryId ?? "none", now);
    return released;
  }, { now: input.now, filePath: input.stateFilePath });
}

function refreshExpiry(entry: CreditEntry, now: Date) {
  if (["available", "reserved"].includes(entry.status) && Date.parse(entry.expiresAt) <= now.getTime() && entry.remainingAmount > 0) entry.status = "expired";
}

export async function getAvailableCredit(memberId: string, now = new Date(), filePath = getMembershipCommerceStateFile()) {
  const state = await readMembershipCommerceState(filePath);
  return Object.values(state.creditEntries).filter((entry) => entry.memberId === memberId && entry.remainingAmount > 0 && ["available", "reserved"].includes(entry.status) && Date.parse(entry.expiresAt) > now.getTime()).reduce((sum, entry) => sum + entry.remainingAmount, 0);
}

export async function reserveCredit(input: { memberId: string; orderId: string; requestedAmount: number; merchandiseSubtotal: number; shipping: number; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  await assertCanonicalMember(input.memberId);
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const maximum = maximumCreditRedemption({ merchandiseSubtotal: input.merchandiseSubtotal, shipping: input.shipping, rules: version.rules });
  const requested = Math.min(assertIntegerMoney(input.requestedAmount, "要求折抵金額"), maximum);
  const key = `credit:reserve:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const existingId = remembered(state, key);
    if (existingId) return state.creditReservations[existingId];
    const duplicateOrder = Object.values(state.creditReservations).find((reservation) => reservation.orderId === input.orderId && reservation.status === "reserved");
    if (duplicateOrder) throw new MembershipCommerceError("此訂單已有抵用金保留");
    const entries = Object.values(state.creditEntries).filter((entry) => {
      refreshExpiry(entry, now);
      return entry.memberId === input.memberId && entry.status === "available" && entry.remainingAmount > 0;
    }).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.issuedAt.localeCompare(b.issuedAt) || a.creditEntryId.localeCompare(b.creditEntryId));
    const available = entries.reduce((sum, entry) => sum + entry.remainingAmount, 0);
    if (requested > available) throw new MembershipCommerceError("可用抵用金不足");
    let remaining = requested;
    const allocations: CreditReservation["allocations"] = [];
    for (const entry of entries) {
      if (!remaining) break;
      const amount = Math.min(remaining, entry.remainingAmount);
      entry.remainingAmount -= amount;
      entry.status = entry.remainingAmount === 0 ? "reserved" : "available";
      allocations.push({ creditEntryId: entry.creditEntryId, amount });
      remaining -= amount;
    }
    const reservationId = id("reserve");
    const timestamp = nowIso(now);
    const reservation: CreditReservation = { reservationId, memberId: input.memberId, orderId: input.orderId, requestedAmount: input.requestedAmount, amount: requested, allocations, status: "reserved", createdAt: timestamp, updatedAt: timestamp };
    state.creditReservations[reservationId] = reservation;
    remember(state, key, reservationId, now);
    audit(state, { actor: "member", action: "credit-reserved", entityType: "credit-reservation", entityId: reservationId, before: {}, after: { amount: requested }, reason: "會員選擇使用抵用金", sourceEvent: input.orderId }, now);
    return reservation;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function settleCreditReservation(input: { reservationId: string; action: "consume" | "release"; idempotencyKey: string; reason: string; now?: Date; stateFilePath?: string }) {
  const key = `credit:${input.action}:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const reservation = state.creditReservations[input.reservationId];
    if (!reservation) throw new MembershipCommerceError("找不到抵用金保留紀錄");
    if (remembered(state, key)) return reservation;
    const targetStatus = input.action === "consume" ? "consumed" : "released";
    if (reservation.status === targetStatus) { remember(state, key, reservation.reservationId, now); return reservation; }
    if (reservation.status !== "reserved") throw new MembershipCommerceError("此抵用金保留紀錄已完成處理");
    for (const allocation of reservation.allocations) {
      const entry = state.creditEntries[allocation.creditEntryId];
      if (!entry) throw new MembershipCommerceError("抵用金來源紀錄遺失");
      if (input.action === "release") {
        entry.remainingAmount += allocation.amount;
        entry.status = Date.parse(entry.expiresAt) <= now.getTime() ? "expired" : "available";
      } else if (entry.remainingAmount === 0) entry.status = "consumed";
    }
    reservation.status = targetStatus;
    reservation.updatedAt = nowIso(now);
    remember(state, key, reservation.reservationId, now);
    audit(state, { actor: "system", action: `credit-${input.action}d`, entityType: "credit-reservation", entityId: reservation.reservationId, before: { status: "reserved" }, after: { status: targetStatus, amount: reservation.amount }, reason: input.reason, sourceEvent: reservation.orderId }, now);
    return reservation;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function recordCycleFulfillment(input: { cycleId: string; orderId: string; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `cycle:complete:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const cycle = state.cycles[input.cycleId];
    if (!cycle) throw new MembershipCommerceError("找不到配送期次");
    if (remembered(state, key)) return { cycle, giftProgress: giftProgress(state, cycle.subscriptionId) };
    if (!["order_created", "shipped", "ready_for_pickup"].includes(cycle.status)) throw new MembershipCommerceError("本期尚未進入可完成取貨的狀態");
    const subscription = state.subscriptions[cycle.subscriptionId];
    const nextProgress = giftProgress(state, subscription.subscriptionId) + 1;
    cycle.status = "completed";
    cycle.updatedAt = nowIso(now);
    const source = event(state, "qualifying_fulfillment", { fulfillmentNumber: nextProgress, originalPriceOrder: false }, now, { memberId: subscription.memberId, subscriptionId: subscription.subscriptionId, orderId: input.orderId });
    remember(state, key, cycle.cycleId, now);
    if (giftEligibleAt(nextProgress, cycle.rulesSnapshot?.rules ?? version.rules)) notify(state, cycle.rulesSnapshot?.rules ?? version.rules, "gift_eligible", source.eventId, now, { memberId: subscription.memberId, safeData: { fulfillmentNumber: nextProgress } });
    return { cycle, giftProgress: nextProgress };
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function getGiftProgress(subscriptionId: string, filePath = getMembershipCommerceStateFile()) {
  return giftProgress(await readMembershipCommerceState(filePath), subscriptionId);
}

export function nextScheduledDate(anchorDate: string, intervalDays: number, sequence: number) {
  if (!Number.isSafeInteger(intervalDays) || intervalDays < 1 || !Number.isSafeInteger(sequence) || sequence < 1) throw new MembershipCommerceError("配送週期資料不正確");
  return addTaipeiCalendarDays(anchorDate, intervalDays * sequence);
}

export function safeReferralMemberView(state: MembershipCommerceState, referrerMemberId: string) {
  return Object.values(state.referrals).filter((item) => item.referrerMemberId === referrerMemberId).map((item) => ({ memberNumberReference: item.referredMemberId, safeDisplayName: item.safeDisplayName, joined: true, qualifiedPurchases: Object.values(state.referralConversions).filter((conversion) => conversion.relationshipId === item.relationshipId && conversion.status === "rewarded").length, rewards: Object.values(state.referralConversions).filter((conversion) => conversion.relationshipId === item.relationshipId && conversion.status === "rewarded").reduce((sum, conversion) => sum + (conversion.rewardCreditEntryId ? state.creditEntries[conversion.rewardCreditEntryId]?.amount ?? 0 : 0), 0), status: item.status }));
}

export async function getMemberCommerceDashboard(memberId: string, now = new Date(), filePath = getMembershipCommerceStateFile()) {
  const state = await readMembershipCommerceState(filePath);
  const subscriptions = Object.values(state.subscriptions).filter((item) => item.memberId === memberId);
  const subscriptionIds = new Set(subscriptions.map((item) => item.subscriptionId));
  const cycles = Object.values(state.cycles).filter((item) => subscriptionIds.has(item.subscriptionId)).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
  const credits = Object.values(state.creditEntries).filter((item) => item.memberId === memberId).map((item) => ({ ...item, status: Date.parse(item.expiresAt) <= now.getTime() && item.remainingAmount > 0 ? "expired" as const : item.status }));
  const pendingCredit = Object.values(state.referralConversions).filter((conversion) => conversion.status === "pending" && state.referrals[conversion.relationshipId]?.referrerMemberId === memberId).reduce((sum, item) => sum + item.pendingRewardAmount, 0);
  return { subscriptions: structuredClone(subscriptions), cycles: structuredClone(cycles), credits: structuredClone(credits), pendingCredit, referrals: safeReferralMemberView(state, memberId) };
}
