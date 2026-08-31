import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import type { WebsiteData } from "@/data/websiteData";
import { atomicWriteJson, withFileLock } from "./jsonFileStore";
import {
  assignReferralRelationship,
  cancelOrReverseReferralRewards,
  createReferralRewardsFromFulfillment,
  handleReferralQualificationOrderOutcome,
  readMembershipCommerceState,
  registerReferralQualificationOrder,
  runReferralRewardReleaseScheduler,
  validateMembershipCommerceState,
  type ReferralReward,
  type Subscription,
} from "./membershipCommerce";
import { readMembershipRulesStore, validateMembershipBusinessRules, validateMembershipRulesStore, type MembershipBusinessRules } from "./membershipBusinessRules";
import { resolveSubscriptionInterval } from "./membershipPolicies";
import { resolveEffectivePv } from "./referralPv";
import { getMembershipTestLabCommerceFile, getMembershipTestLabDir, getMembershipTestLabRulesFile, getMembershipTestLabStateFile, getWebsiteDataFile } from "./storagePaths";

export const MEMBERSHIP_TEST_LAB_SCHEMA_VERSION = 1 as const;

export type SimulatedMember = {
  memberId: string;
  name: string;
  activeSubscription: boolean;
  subscriptionStatus: "active" | "paused" | "terminated";
  cycleDays: number;
  currentCredit: number;
  referralParentId: string | null;
};

export type SimulatedOrder = {
  orderId: string;
  memberId: string;
  rewardType: "new_referral" | "subscription";
  productSource: "synthetic" | "production-readonly";
  productName: string;
  skuLabel: string;
  quantity: number;
  regularUnitPrice: number;
  campaignUnitPrice: number | null;
  creditUsed: number;
  paidAmountBasis: number;
  basePV: number;
  effectivePV: number;
  status: "created" | "preparing" | "shipped" | "arrived" | "completed" | "cancelled" | "uncollected" | "refunded" | "returned";
  createdAt: string;
};

export type SimulationTimelineEntry = {
  timelineId: string;
  occurredAt: string;
  title: string;
  summary: string;
  details?: Record<string, unknown>;
};

export type MembershipTestLabState = {
  schemaVersion: typeof MEMBERSHIP_TEST_LAB_SCHEMA_VERSION;
  revision: number;
  scenarioName: string;
  simulationNow: string;
  memberCount: number;
  members: SimulatedMember[];
  orders: SimulatedOrder[];
  timeline: SimulationTimelineEntry[];
  simulatedNotifications: Array<{ eventType: string; memberId?: string; createdAt: string; delivered: false }>;
  ruleMode: "current-owner-rules" | "scenario-override";
  overrides: {
    calculationMode?: "paid_amount" | "pv";
    baseWaitingDays?: number;
    returnProtectionDays?: number;
    qualificationWindowDays?: number;
    organizationCap?: number;
    monthlyCap?: number;
    requireActiveSubscription?: boolean;
    reversalPolicy?: MembershipBusinessRules["referral"]["reversalPolicy"];
  };
  createdAt: string;
  updatedAt: string;
};

export const membershipTestLabPresets = [
  { id: "paid-five-level", name: "五代推薦＋實付金額" },
  { id: "pv-five-level", name: "五代推薦＋PV" },
  { id: "inactive-referrer", name: "推薦人沒有 active subscription" },
  { id: "qualification-window", name: "推薦獎勵資格期限 30 天" },
  { id: "new-referral-wait", name: "新推薦等待 7 天" },
  { id: "release-1530", name: "8/1 15:30・7+3 → 8/11" },
  { id: "release-0001", name: "8/1 00:01・7+3 → 8/11" },
  { id: "release-2359", name: "8/1 23:59・7+3 → 8/11" },
  { id: "release-base-zero", name: "Base 0・Return 7 → 8/8" },
  { id: "release-return-zero", name: "Base 7・Return 0 → 8/8" },
  { id: "release-both-zero", name: "Base 0・Return 0 → 同日" },
  { id: "refund-pending", name: "Pending 期間退款" },
  { id: "refund-released", name: "Release 後退款沖回" },
  { id: "organization-cap", name: "Organization cap exceeded" },
  { id: "monthly-cap", name: "Monthly cap reached" },
  { id: "cycle-attack", name: "Referral cycle attack" },
  { id: "self-attack", name: "Self-referral attack" },
  { id: "custom-cycle", name: "Custom subscription cycle bounds" },
] as const;

function testLabPaths() {
  return { dir: getMembershipTestLabDir(), state: getMembershipTestLabStateFile(), commerce: getMembershipTestLabCommerceFile(), rules: getMembershipTestLabRulesFile() };
}

export function isMembershipTestLabEnabled() {
  const explicit = process.env.ENABLE_MEMBERSHIP_TEST_LAB?.trim().toLowerCase();
  if (explicit === "true" || explicit === "1") return true;
  if (explicit === "false" || explicit === "0") return false;
  return process.env.NODE_ENV !== "production";
}

function simId(letter: string) { return `SIM_MEMBER_${letter}`; }
function entryId() { return `SIM_EVENT_${randomBytes(8).toString("hex")}`; }
function nowIso(date = new Date()) { return date.toISOString(); }
const simulationIdentityAdapter = { assertMember: async (memberId: string) => { if (!memberId.startsWith("SIM_MEMBER_")) throw new Error("Test Lab 只能使用 SIM_MEMBER identity"); } };

function createMembers(count = 7): SimulatedMember[] {
  return Array.from({ length: Math.min(10, Math.max(1, count)) }, (_, index) => {
    const letter = String.fromCharCode(65 + index);
    return { memberId: simId(letter), name: `模擬會員 ${letter}`, activeSubscription: true, subscriptionStatus: "active", cycleDays: 30, currentCredit: 0, referralParentId: index ? simId(String.fromCharCode(64 + index)) : null };
  });
}

function emptyLabState(date = new Date(), count = 7): MembershipTestLabState {
  const timestamp = nowIso(date);
  return { schemaVersion: 1, revision: 0, scenarioName: "五代推薦＋實付金額", simulationNow: timestamp, memberCount: count, members: createMembers(count), orders: [], timeline: [], simulatedNotifications: [], ruleMode: "scenario-override", overrides: { calculationMode: "paid_amount" }, createdAt: timestamp, updatedAt: timestamp };
}

function validateLabState(value: unknown): MembershipTestLabState {
  if (!value || typeof value !== "object") throw new Error("測試實驗室資料格式不正確");
  const state = value as MembershipTestLabState;
  if (state.schemaVersion !== 1 || !Array.isArray(state.members) || !Array.isArray(state.orders) || !Array.isArray(state.timeline) || !state.simulationNow.startsWith("20")) throw new Error("測試實驗室資料格式不完整");
  if (state.members.some((member) => !member.memberId.startsWith("SIM_MEMBER_"))) throw new Error("模擬會員 namespace 不正確");
  return state;
}

async function readLabState() {
  try { return validateLabState(JSON.parse(await fs.readFile(testLabPaths().state, "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

async function writeLabState(state: MembershipTestLabState) {
  const paths = testLabPaths();
  await fs.mkdir(paths.dir, { recursive: true });
  state.revision += 1;
  state.updatedAt = state.simulationNow;
  await atomicWriteJson(paths.state, state);
}

function timeline(state: MembershipTestLabState, title: string, summary: string, details?: SimulationTimelineEntry["details"]) {
  state.timeline.push({ timelineId: entryId(), occurredAt: state.simulationNow, title, summary, details });
}

async function writeSimulationRules(state: MembershipTestLabState) {
  const source = structuredClone(await readMembershipRulesStore());
  const active = source.versions.at(-1);
  if (!active) throw new Error("找不到目前 Owner 規則");
  if (state.ruleMode === "scenario-override") {
    if (state.overrides.calculationMode) active.rules.referral.referralRewardCalculationMode = state.overrides.calculationMode;
    if (state.overrides.baseWaitingDays != null) active.rules.referral.referralRewardBaseWaitingDays = state.overrides.baseWaitingDays;
    if (state.overrides.returnProtectionDays != null) active.rules.referral.referralRewardReturnProtectionDays = state.overrides.returnProtectionDays;
    if (state.overrides.qualificationWindowDays != null) active.rules.referral.referralRewardQualificationWindowDays = state.overrides.qualificationWindowDays;
    if (state.overrides.organizationCap != null) active.rules.referral.referralTotalRewardCap = state.overrides.organizationCap;
    if (state.overrides.monthlyCap != null) active.rules.referral.referralMonthlyCreditCap = state.overrides.monthlyCap;
    if (state.overrides.requireActiveSubscription != null) active.rules.referral.referrerEligibility = state.overrides.requireActiveSubscription ? { mode: "active-subscription" } : { mode: "none" };
    if (state.overrides.reversalPolicy) active.rules.referral.reversalPolicy = state.overrides.reversalPolicy;
  }
  active.rules = validateMembershipBusinessRules(active.rules);
  await fs.mkdir(testLabPaths().dir, { recursive: true });
  await atomicWriteJson(testLabPaths().rules, validateMembershipRulesStore(source));
}

async function syncSimulationSubscriptions(state: MembershipTestLabState) {
  const filePath = testLabPaths().commerce;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await withFileLock(filePath, async () => {
    const commerce = await readMembershipCommerceState(filePath);
    for (const key of Object.keys(commerce.subscriptions)) if (key.startsWith("SIM_SUB_")) delete commerce.subscriptions[key];
    for (const key of Object.keys(commerce.creditEntries)) if (key.startsWith("SIM_CREDIT_SEED_")) delete commerce.creditEntries[key];
    for (const member of state.members) {
      const letter = member.memberId.replace("SIM_MEMBER_", "");
      if (member.currentCredit > 0) {
        const creditId = `SIM_CREDIT_SEED_${letter}`;
        commerce.creditEntries[creditId] = { creditEntryId: creditId, memberId: member.memberId, sourceType: "manual", sourceReference: `simulation_seed:${member.memberId}`, amount: member.currentCredit, remainingAmount: member.currentCredit, issuedAt: state.simulationNow, expiresAt: new Date(new Date(state.simulationNow).getTime() + 365 * 86_400_000).toISOString(), status: "available", createdAt: state.simulationNow, metadata: { simulation: true } };
      }
      if (!member.activeSubscription && member.subscriptionStatus !== "paused" && member.subscriptionStatus !== "terminated") continue;
      const subscription: Subscription = { subscriptionId: `SIM_SUB_${letter}`, memberId: member.memberId, status: member.activeSubscription ? "active" : member.subscriptionStatus, startedFromOrderId: `SIM_SEED_${letter}`, anchorDate: state.simulationNow.slice(0, 10), intervalDays: member.cycleDays, shippingMethod: "simulation", storeSelection: null, defaultItems: [], rulesVersion: 1, statusReason: "Test Lab simulation adapter", createdAt: state.createdAt, updatedAt: state.simulationNow, revision: 0 };
      commerce.subscriptions[subscription.subscriptionId] = subscription;
    }
    commerce.revision += 1;
    commerce.updatedAt = state.simulationNow;
    await atomicWriteJson(filePath, validateMembershipCommerceState(commerce));
  });
}

async function buildReferralGraph(state: MembershipTestLabState) {
  for (const member of state.members) {
    if (!member.referralParentId) continue;
    await assignReferralRelationship({ referrerMemberId: member.referralParentId, referredMemberId: member.memberId, safeDisplayName: member.name, referralCode: `SIM_CODE_${member.referralParentId}`, idempotencyKey: `test-lab:${member.referralParentId}:${member.memberId}`, now: new Date(state.simulationNow), stateFilePath: testLabPaths().commerce }, simulationIdentityAdapter);
  }
}

async function initializeInternal(state: MembershipTestLabState) {
  const paths = testLabPaths();
  await fs.mkdir(paths.dir, { recursive: true });
  await fs.unlink(paths.commerce).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  await writeSimulationRules(state);
  await buildReferralGraph(state);
  await syncSimulationSubscriptions(state);
  timeline(state, "測試情境已建立", `${state.memberCount} 位模擬會員，所有 ID 均使用 SIM_MEMBER namespace。`);
  await writeLabState(state);
  return state;
}

export async function initializeMembershipTestLab(count = 7) {
  if (!isMembershipTestLabEnabled()) throw new Error("會員制度測試實驗室目前未啟用");
  await fs.mkdir(testLabPaths().dir, { recursive: true });
  return withFileLock(testLabPaths().state, () => initializeInternal(emptyLabState(new Date(), count)));
}

async function ensureLab() {
  const existing = await readLabState();
  if (existing) return existing;
  if (!isMembershipTestLabEnabled()) throw new Error("會員制度測試實驗室目前未啟用");
  return initializeInternal(emptyLabState());
}

function presetState(id: string, current: MembershipTestLabState) {
  const next = emptyLabState(new Date(current.simulationNow), 7);
  const preset = membershipTestLabPresets.find((item) => item.id === id);
  next.scenarioName = preset?.name || "自訂情境";
  if (id === "pv-five-level") next.overrides.calculationMode = "pv";
  if (id === "inactive-referrer") next.members[0].activeSubscription = false;
  if (id === "qualification-window") { next.overrides.qualificationWindowDays = 30; next.members[0].activeSubscription = false; }
  if (["new-referral-wait", "refund-pending", "refund-released"].includes(id)) { next.overrides.baseWaitingDays = 7; next.overrides.returnProtectionDays = 3; }
  if (["release-1530", "release-0001", "release-2359"].includes(id)) { next.overrides.baseWaitingDays = 7; next.overrides.returnProtectionDays = 3; }
  if (id === "release-base-zero") { next.overrides.baseWaitingDays = 0; next.overrides.returnProtectionDays = 7; }
  if (id === "release-return-zero") { next.overrides.baseWaitingDays = 7; next.overrides.returnProtectionDays = 0; }
  if (id === "release-both-zero") { next.overrides.baseWaitingDays = 0; next.overrides.returnProtectionDays = 0; }
  if (id === "organization-cap") next.overrides.organizationCap = 3;
  if (id === "monthly-cap") next.overrides.monthlyCap = 20;
  if (id === "custom-cycle") { next.members[0].cycleDays = 20; next.members[1].cycleDays = 120; }
  return next;
}

export async function applyMembershipTestLabPreset(id: string) {
  const current = await ensureLab();
  const state = presetState(id, current);
  await withFileLock(testLabPaths().state, () => initializeInternal(state));
  if (id === "self-attack") await simulateReferralAttack({ referrerMemberId: simId("A"), referredMemberId: simId("A") });
  if (id === "cycle-attack") await simulateReferralAttack({ referrerMemberId: simId("G"), referredMemberId: simId("A") });
  return getMembershipTestLabSnapshot();
}

export async function configureMembershipTestLab(input: { memberCount?: number; memberId?: string; name?: string; currentCredit?: number; activeSubscription?: boolean; subscriptionStatus?: SimulatedMember["subscriptionStatus"]; cycleDays?: number; parentId?: string | null; ruleMode?: MembershipTestLabState["ruleMode"]; overrides?: MembershipTestLabState["overrides"] }) {
  return withFileLock(testLabPaths().state, async () => {
    let state = await ensureLab();
    if (input.memberCount != null && input.memberCount !== state.memberCount) {
      state = emptyLabState(new Date(state.simulationNow), input.memberCount);
      await initializeInternal(state);
      return state;
    }
    const member = input.memberId ? state.members.find((item) => item.memberId === input.memberId) : undefined;
    if (member) {
      if (input.name != null) member.name = String(input.name).slice(0, 40);
      if (input.currentCredit != null) member.currentCredit = Math.max(0, Math.trunc(input.currentCredit));
      if (input.activeSubscription != null) member.activeSubscription = input.activeSubscription;
      if (input.subscriptionStatus) member.subscriptionStatus = input.subscriptionStatus;
      if (input.cycleDays != null) member.cycleDays = input.cycleDays;
      if (input.parentId !== undefined) member.referralParentId = input.parentId;
    }
    if (input.ruleMode) state.ruleMode = input.ruleMode;
    if (input.overrides) state.overrides = { ...state.overrides, ...input.overrides };
    await writeSimulationRules(state);
    await syncSimulationSubscriptions(state);
    timeline(state, "情境設定已更新", "這些變更只存在模擬 namespace，不影響正式 Owner 規則。");
    await writeLabState(state);
    return state;
  });
}

async function resolveSimulatedProduct(input: { source?: "synthetic" | "production-readonly"; productId?: string; skuId?: string; productName?: string; skuLabel?: string; quantity?: number; regularUnitPrice?: number; campaignUnitPrice?: number | null; creditUsed?: number; basePV?: number }, rules: MembershipBusinessRules) {
  const quantity = Math.max(1, Math.trunc(Number(input.quantity || 1)));
  if (input.source === "production-readonly") {
    const website = JSON.parse(await fs.readFile(getWebsiteDataFile(), "utf8")) as WebsiteData;
    const product = website.menu.products.find((item) => item.slug === input.productId) ?? website.menu.products.find((item) => item.active !== false && item.purchasable !== false);
    const options = product ? (product.skus?.length ? product.skus : product.purchase) : [];
    const sku = options.find((item, index) => (item.id || `${product?.slug}:${index}`) === input.skuId) ?? options.find((item) => item.enabled !== false);
    if (!product || !sku) throw new Error("找不到可唯讀模擬的正式商品 SKU");
    const discounted = input.campaignUnitPrice ?? sku.price;
    const pv = resolveEffectivePv({ sku, originalUnitPrice: sku.price, discountedUnitPrice: discounted, quantity, roundingMode: rules.money.roundingMode });
    return { productSource: "production-readonly" as const, productName: product.name, skuLabel: sku.label, quantity, regularUnitPrice: sku.price, campaignUnitPrice: input.campaignUnitPrice ?? null, creditUsed: Math.max(0, Math.trunc(Number(input.creditUsed || 0))), ...pv };
  }
  const regularUnitPrice = Math.max(1, Math.trunc(Number(input.regularUnitPrice || 600)));
  const campaignUnitPrice = input.campaignUnitPrice == null ? null : Math.max(0, Math.trunc(Number(input.campaignUnitPrice)));
  const sku = { label: input.skuLabel || "測試規格", detail: "Test Lab synthetic SKU", price: regularUnitPrice, pvEnabled: true, pvValue: Math.max(0, Number(input.basePV ?? 100)) };
  const pv = resolveEffectivePv({ sku, originalUnitPrice: regularUnitPrice, discountedUnitPrice: campaignUnitPrice ?? regularUnitPrice, quantity, roundingMode: rules.money.roundingMode });
  return { productSource: "synthetic" as const, productName: input.productName || "測試咖啡", skuLabel: sku.label, quantity, regularUnitPrice, campaignUnitPrice, creditUsed: Math.max(0, Math.trunc(Number(input.creditUsed || 0))), ...pv };
}

export async function createMembershipTestLabOrder(input: { memberId: string; rewardType?: SimulatedOrder["rewardType"]; source?: SimulatedOrder["productSource"]; productId?: string; skuId?: string; productName?: string; skuLabel?: string; quantity?: number; regularUnitPrice?: number; campaignUnitPrice?: number | null; creditUsed?: number; basePV?: number }) {
  return withFileLock(testLabPaths().state, async () => {
    const state = await ensureLab();
    if (!state.members.some((item) => item.memberId === input.memberId)) throw new Error("模擬下單會員不存在");
    const store = await readMembershipRulesStore(testLabPaths().rules);
    const rules = store.versions.at(-1)!.rules;
    const product = await resolveSimulatedProduct(input, rules);
    const merchandise = (product.campaignUnitPrice ?? product.regularUnitPrice) * product.quantity;
    const order: SimulatedOrder = { orderId: `SIM_ORDER_${randomBytes(8).toString("hex")}`, memberId: input.memberId, rewardType: input.rewardType || "new_referral", productSource: product.productSource, productName: product.productName, skuLabel: product.skuLabel, quantity: product.quantity, regularUnitPrice: product.regularUnitPrice, campaignUnitPrice: product.campaignUnitPrice, creditUsed: product.creditUsed, paidAmountBasis: Math.max(0, merchandise - product.creditUsed), basePV: product.basePV, effectivePV: product.effectivePV, status: "created", createdAt: state.simulationNow };
    state.orders.push(order);
    await registerReferralQualificationOrder({ memberId: order.memberId, orderId: order.orderId, orderCreatedAt: order.createdAt, orderType: order.rewardType === "subscription" ? "subscription" : "normal", idempotencyKey: `test-lab:${order.orderId}:created`, now: new Date(state.simulationNow), stateFilePath: testLabPaths().commerce, rulesFilePath: testLabPaths().rules });
    timeline(state, `${order.memberId} 建立模擬訂單`, `${order.productName} × ${order.quantity}，商品實付基礎 NT$${order.paidAmountBasis}。`, { orderId: order.orderId, basePV: order.basePV, effectivePV: order.effectivePV });
    await writeLabState(state);
    return order;
  });
}

export async function transitionMembershipTestLabOrder(orderId: string, status: SimulatedOrder["status"]) {
  return withFileLock(testLabPaths().state, async () => {
    const state = await ensureLab();
    const order = state.orders.find((item) => item.orderId === orderId);
    if (!order) throw new Error("找不到模擬訂單");
    order.status = status;
    const now = new Date(state.simulationNow);
    if (status === "completed") {
      await syncSimulationSubscriptions(state);
      const before = await readMembershipCommerceState(testLabPaths().commerce);
      await handleReferralQualificationOrderOutcome({ memberId: order.memberId, orderId: order.orderId, outcome: "completed", idempotencyKey: `test-lab:${order.orderId}:qualification-completed`, now, stateFilePath: testLabPaths().commerce, rulesFilePath: testLabPaths().rules });
      const created = await createReferralRewardsFromFulfillment({ sourceMemberId: order.memberId, orderId: order.orderId, rewardType: order.rewardType, paidAmountBasis: order.paidAmountBasis, basePV: order.basePV, effectivePV: order.effectivePV, discountRatio: order.basePV ? order.effectivePV / order.basePV : 1, idempotencyKey: `test-lab:${order.orderId}:completed`, now, stateFilePath: testLabPaths().commerce, rulesFilePath: testLabPaths().rules });
      const scheduler = await runReferralRewardReleaseScheduler({ now, stateFilePath: testLabPaths().commerce, rulesFilePath: testLabPaths().rules });
      const after = await readMembershipCommerceState(testLabPaths().commerce);
      const rules = (await readMembershipRulesStore(testLabPaths().rules)).versions.at(-1)!.rules;
      const ancestors: string[] = [];
      let current = order.memberId;
      for (let level = 0; level < rules.referral.referralMaxRewardDepth; level += 1) {
        const parent = Object.values(after.referrals).find((relation) => relation.referredMemberId === current)?.referrerMemberId;
        if (!parent) break;
        ancestors.push(parent); current = parent;
      }
      const alreadyQualified = order.rewardType === "new_referral" && before.events.some((item) => item.type === "referral_new_qualified" && item.memberId === order.memberId);
      timeline(state, `${order.memberId} 模擬成功取貨`, created.length ? `建立 ${created.length} 筆推薦 reward；${scheduler.filter((item) => item.status === "released").length} 筆當次釋放。` : alreadyQualified ? "New Referral Reward 未建立：Already qualified previously。定期購週期仍可使用 subscription reward。" : "沒有建立新 reward；請查看各推薦人的資格原因。", { createdRewards: created.length, previousRewards: Object.keys(before.referralRewards).length, schedulerResults: scheduler.length, ancestors });
    } else if (["cancelled", "uncollected", "refunded", "returned"].includes(status)) {
      await handleReferralQualificationOrderOutcome({ memberId: order.memberId, orderId: order.orderId, outcome: status as "cancelled" | "uncollected" | "refunded" | "returned", idempotencyKey: `test-lab:${order.orderId}:qualification-${status}`, now, stateFilePath: testLabPaths().commerce, rulesFilePath: testLabPaths().rules });
      const changed = await cancelOrReverseReferralRewards({ orderId: order.orderId, outcome: status as "cancelled" | "uncollected" | "refunded" | "returned", idempotencyKey: `test-lab:${order.orderId}:${status}`, now, stateFilePath: testLabPaths().commerce, rulesFilePath: testLabPaths().rules });
      timeline(state, `${order.memberId} 模擬${status === "returned" ? "退貨" : status === "refunded" ? "退款" : "取消"}`, `處理 ${changed.length} 筆 reward；只寫入模擬 ledger。`, { changedRewards: changed.length });
    } else timeline(state, `${order.orderId} 狀態更新`, `模擬狀態：${status}`);
    await captureSimulatedNotifications(state);
    await writeLabState(state);
    return order;
  });
}

async function captureSimulatedNotifications(state: MembershipTestLabState) {
  const commerce = await readMembershipCommerceState(testLabPaths().commerce);
  state.simulatedNotifications = commerce.notifications.map((item) => ({ eventType: item.eventType, memberId: item.memberId, createdAt: item.createdAt, delivered: false as const }));
}

export async function advanceMembershipTestLabClock(input: { days?: number; dateTime?: string }) {
  return withFileLock(testLabPaths().state, async () => {
    const state = await ensureLab();
    const before = new Date(state.simulationNow);
    const next = input.dateTime ? new Date(input.dateTime) : new Date(before.getTime() + Number(input.days || 0) * 86_400_000);
    if (!Number.isFinite(next.getTime())) throw new Error("模擬日期時間不正確");
    state.simulationNow = next.toISOString();
    timeline(state, "模擬時間已調整", `${before.toISOString()} → ${state.simulationNow}`);
    await writeLabState(state);
    return state;
  });
}

export async function runMembershipTestLabScheduler() {
  return withFileLock(testLabPaths().state, async () => {
    const state = await ensureLab();
    await syncSimulationSubscriptions(state);
    const before = await readMembershipCommerceState(testLabPaths().commerce);
    const pending = Object.values(before.referralRewards).filter((item) => item.status === "scheduled");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(state.simulationNow));
    const due = pending.filter((item) => Boolean((item.releaseEligibleBusinessDate ?? item.scheduledReleaseAt?.slice(0, 10)) && today >= (item.releaseEligibleBusinessDate ?? item.scheduledReleaseAt.slice(0, 10))));
    const results = await runReferralRewardReleaseScheduler({ now: new Date(state.simulationNow), stateFilePath: testLabPaths().commerce, rulesFilePath: testLabPaths().rules });
    const released = results.filter((item) => item.status === "released").length;
    const failed = results.filter((item) => item.status === "failed").length;
    const summary = { pending: pending.length, due: due.length, released, skipped: Math.max(0, pending.length - due.length), failed, results };
    timeline(state, "執行模擬到期獎勵", `Pending ${summary.pending}、Due ${summary.due}、Released ${released}、Skipped ${summary.skipped}、Failed ${failed}。`, { pending: summary.pending, due: summary.due, released, skipped: summary.skipped, failed });
    for (const result of results) timeline(state, `Reward ${result.rewardId}`, result.status === "released" ? "已由 simulation scheduler 發放到模擬 ledger。" : `未發放：${result.error || "未知原因"}`, { status: result.status, reason: result.error || "released" });
    await captureSimulatedNotifications(state);
    await writeLabState(state);
    return summary;
  });
}

export async function testMembershipLabCycle(days: number) {
  const state = await ensureLab();
  const store = await readMembershipRulesStore(testLabPaths().rules);
  const result = resolveSubscriptionInterval(days, store.versions.at(-1)!.rules);
  return { days, accepted: result.allowed, reason: result.allowed ? (result.kind === "custom" ? "符合自訂週期上下限" : "符合已啟用快捷週期") : "不符合已啟用快捷週期或自訂上下限", simulationNow: state.simulationNow };
}

export async function simulateReferralAttack(input: { referrerMemberId: string; referredMemberId: string }) {
  return withFileLock(testLabPaths().state, async () => {
    const state = await ensureLab();
    try {
      await assignReferralRelationship({ ...input, referralCode: "SIM_ATTACK", idempotencyKey: `test-lab:attack:${entryId()}`, now: new Date(state.simulationNow), stateFilePath: testLabPaths().commerce }, simulationIdentityAdapter);
      timeline(state, "推薦關係測試", "關係建立成功。", { referrer: input.referrerMemberId, referred: input.referredMemberId });
      await writeLabState(state);
      return { accepted: true, reason: "關係建立成功" };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "推薦關係被拒絕";
      timeline(state, "推薦攻擊已拒絕", reason, { referrer: input.referrerMemberId, referred: input.referredMemberId });
      await writeLabState(state);
      return { accepted: false, reason };
    }
  });
}

function rewardExplanation(reward: ReferralReward) {
  const basis = reward.calculationMode === "pv" ? `Effective PV ${reward.effectivePV}` : `商品實付 NT$${reward.paidAmountBasis}`;
  const qualification = reward.qualificationStatus ? `資格狀態 ${reward.qualificationStatus}，須於 ${reward.qualificationExpiresAt?.slice(0, 10)} 前下單。` : "歷史相容 reward。";
  return `${reward.beneficiaryMemberId} 是第 ${reward.referralLevel} 代推薦人；${basis} × ${reward.rewardRate}%${reward.calculationMode === "pv" ? ` = Reward PV ${reward.rewardPV}，再按 1 PV = NT$${reward.pvRewardMoneyValue}` : ""}，套用組織與月上限後為 NT$${reward.calculatedCreditAmount}。${qualification}`;
}

async function readProductionProductOptions() {
  try {
    const website = JSON.parse(await fs.readFile(getWebsiteDataFile(), "utf8")) as WebsiteData;
    return website.menu.products.filter((product) => product.active !== false && product.purchasable !== false).map((product) => ({ productId: product.slug, productName: product.name, skus: (product.skus?.length ? product.skus : product.purchase).filter((sku) => sku.enabled !== false).map((sku, index) => ({ skuId: sku.id || `${product.slug}:${index}`, skuLabel: sku.label, price: sku.price, pvEnabled: sku.pvEnabled === true, pvValue: sku.pvValue ?? 0 })) })).filter((product) => product.skus.length);
  } catch { return []; }
}

export async function getMembershipTestLabSnapshot() {
  const state = await ensureLab();
  const commerce = await readMembershipCommerceState(testLabPaths().commerce);
  const rulesStore = await readMembershipRulesStore(testLabPaths().rules);
  const rules = rulesStore.versions.at(-1)!.rules;
  const rewards = Object.values(commerce.referralRewards).map((reward) => ({ ...reward, explanation: rewardExplanation(reward), eligible: true }));
  return { testMode: true, isolationNamespace: "membership-test-lab", externalDeliveryEnabled: false, state, rules, rewards, creditEntries: Object.values(commerce.creditEntries), relationships: Object.values(commerce.referrals), presets: membershipTestLabPresets, productionProducts: await readProductionProductOptions() };
}

export type MembershipTestLabSnapshot = Awaited<ReturnType<typeof getMembershipTestLabSnapshot>>;

export async function resetMembershipTestLab() {
  const paths = testLabPaths();
  const resolvedDir = path.resolve(paths.dir);
  for (const file of [paths.state, paths.commerce, paths.rules]) {
    const resolved = path.resolve(file);
    if (path.dirname(resolved) !== resolvedDir) throw new Error("拒絕清除測試目錄以外的檔案");
    await fs.unlink(resolved).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  }
  return initializeMembershipTestLab();
}

export async function getMembershipTestLabIsolationProof() {
  const paths = testLabPaths();
  return { simulationDir: paths.dir, productionCommerceFileReferenced: false, productionRulesWriteEnabled: false, externalDeliveryEnabled: false, idsAreNamespaced: true };
}
