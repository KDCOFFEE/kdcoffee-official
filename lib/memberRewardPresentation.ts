export type RewardSourceOrderItem = {
  name: string;
  optionLabel: string;
  optionDetail: string;
  preparationLabel: string;
  quantity: number;
};

export type RewardWaitingRuleSnapshot = {
  baseWaitingDays: number;
  returnProtectionDays: number;
};

export type RewardWaitingExplanation = {
  state: "not_applicable" | "awaiting_completion" | "safety_wait" | "due" | "released" | "reversed" | "cancelled";
  completedAt: string | null;
  baseWaitingDays: number | null;
  returnProtectionDays: number | null;
  projectedReleaseDate: string | null;
  releasedAt: string | null;
  reversedAt: string | null;
  exactDayBreakdownAvailable: boolean;
};

export type RewardSourceOrderSummary = {
  orderNumber: string;
  sourceCategory: "guest" | "downline" | "self";
  sourceCategoryLabel: string;
  canViewFullOrder: boolean;
  createdAt: string | null;
  completedAt: string | null;
  fulfillmentStatus: string;
  sourceItems: RewardSourceOrderItem[];
  referralLevel: number | null;
  calculationBasis: "pv" | "paid_amount";
  effectivePV: number;
  rewardRate: number;
  rewardPV: number | null;
  projectedCreditAmount: number;
  actualCreditAmount: number | null;
  availableCreditAmount: number | null;
  releaseEligibleBusinessDate: string | null;
  releasedAt: string | null;
  reversedAt: string | null;
  rewardStatus: string;
  displayStatus: string;
  waitingExplanation: RewardWaitingExplanation;
};

export type EffectiveRewardDisplayInput = {
  status: string | null;
  qualificationStatus?: string | null;
  qualificationAuthority?: "legacy_order" | "qualification_coverage" | "self_purchase_direct" | null;
  qualificationCoverage?: object | null;
  qualificationMaturation?: object | null;
  releaseEligibleBusinessDate?: string | null;
  releasedAt?: string | null;
  sourceCompleted?: boolean;
};

type TaipeiDateValue = string | Date | null | undefined;

const TAIPEI_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const padTwo = (value: number) => String(value).padStart(2, "0");

function taipeiDateParts(value: TaipeiDateValue) {
  const epochMs = value instanceof Date
    ? value.getTime()
    : typeof value === "string" && value.trim()
      ? Date.parse(value)
      : Number.NaN;
  if (!Number.isFinite(epochMs)) return null;
  const taipei = new Date(epochMs + TAIPEI_UTC_OFFSET_MS);
  return {
    year: String(taipei.getUTCFullYear()).padStart(4, "0"),
    month: padTwo(taipei.getUTCMonth() + 1),
    day: padTwo(taipei.getUTCDate()),
    hour: padTwo(taipei.getUTCHours()),
    minute: padTwo(taipei.getUTCMinutes()),
  };
}

export function formatTaipeiDate(value: TaipeiDateValue, fallback = "歷史資料未記錄") {
  const parts = taipeiDateParts(value);
  return parts ? `${parts.year}/${parts.month}/${parts.day}` : fallback;
}

export function formatTaipeiMonthDay(value: TaipeiDateValue, fallback = "日期未記錄") {
  const parts = taipeiDateParts(value);
  return parts ? `${parts.month}/${parts.day}` : fallback;
}

export function formatTaipeiDateTime(value: TaipeiDateValue, fallback = "歷史資料未記錄") {
  const parts = taipeiDateParts(value);
  return parts ? `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}` : fallback;
}

export function formatTaipeiMonthKey(value: TaipeiDateValue) {
  const parts = taipeiDateParts(value);
  return parts ? `${parts.year}-${parts.month}` : "";
}

export function rewardTimingText(
  explanation: RewardWaitingExplanation | null | undefined,
  compact = false,
) {
  if (!explanation) return null;
  const formatProjected = compact ? formatTaipeiMonthDay : formatTaipeiDate;
  if (explanation.state === "released") {
    return explanation.releasedAt ? `已入帳 ${formatTaipeiDate(explanation.releasedAt)}` : "已入帳";
  }
  if (explanation.state === "reversed") {
    return explanation.reversedAt ? `已沖回 ${formatTaipeiDate(explanation.reversedAt)}` : "已沖回";
  }
  if (explanation.state === "cancelled") return null;
  if (explanation.state === "due") {
    if (!explanation.projectedReleaseDate) return "已到預計發放日，系統將自動處理";
    const dueDate = formatProjected(explanation.projectedReleaseDate);
    return compact
      ? `發放日 ${dueDate}・系統將自動處理`
      : `已到預計發放日 ${dueDate}，系統將自動處理`;
  }
  if (explanation.state === "safety_wait") {
    return explanation.projectedReleaseDate
      ? `預計 ${formatProjected(explanation.projectedReleaseDate)} 入帳`
      : "入帳日期確認中";
  }
  if (explanation.state === "awaiting_completion") return "待完成取貨後計算";
  return explanation.projectedReleaseDate
    ? `預計 ${formatProjected(explanation.projectedReleaseDate)} 入帳`
    : null;
}

export function summarizePendingRewards(items: Array<{
  rewardPV: number | null;
  projectedCreditAmount: number;
}>) {
  const recordedPointValues = items
    .map((item) => item.rewardPV)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    rewardPoints: recordedPointValues.reduce((sum, value) => sum + value, 0),
    rewardCount: items.length,
    projectedCreditAmount: items.reduce(
      (sum, item) => sum + finiteNumber(item.projectedCreditAmount),
      0,
    ),
    hasIncompletePointHistory: recordedPointValues.length !== items.length,
  };
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const safeText = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const safeDate = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
};

const finiteNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const safeWaitingRuleSnapshot = (value: RewardWaitingRuleSnapshot | null | undefined) =>
  value
    && Number.isSafeInteger(value.baseWaitingDays)
    && value.baseWaitingDays >= 0
    && Number.isSafeInteger(value.returnProtectionDays)
    && value.returnProtectionDays >= 0
    ? { baseWaitingDays: value.baseWaitingDays, returnProtectionDays: value.returnProtectionDays }
    : null;

/**
 * Selects only immutable, reward-specific timing evidence. Current business
 * rules are deliberately not accepted as an input.
 */
export function selectHistoricalRewardWaitingRule(input: {
  qualificationAuthority: EffectiveRewardDisplayInput["qualificationAuthority"];
  rewardSnapshot?: RewardWaitingRuleSnapshot | null;
  qualificationRoundSnapshot?: RewardWaitingRuleSnapshot | null;
  maturationSnapshot?: RewardWaitingRuleSnapshot | null;
}) {
  if (input.qualificationAuthority === "qualification_coverage") {
    return safeWaitingRuleSnapshot(input.qualificationRoundSnapshot)
      ?? safeWaitingRuleSnapshot(input.maturationSnapshot);
  }
  return safeWaitingRuleSnapshot(input.rewardSnapshot);
}

export function buildRewardWaitingExplanation(input: {
  rewardStatus: string;
  displayStatus: string;
  sourceCompleted: boolean;
  completedAt?: string | null;
  releaseEligibleBusinessDate?: string | null;
  releasedAt?: string | null;
  reversedAt?: string | null;
  waitingRuleSnapshot?: RewardWaitingRuleSnapshot | null;
}): RewardWaitingExplanation {
  const snapshot = safeWaitingRuleSnapshot(input.waitingRuleSnapshot);
  const state: RewardWaitingExplanation["state"] = input.rewardStatus === "released"
    ? "released"
    : input.rewardStatus === "reversed"
      ? "reversed"
      : input.rewardStatus === "cancelled"
        ? "cancelled"
        : !input.sourceCompleted
          ? "awaiting_completion"
          : input.displayStatus === "待系統入帳"
            ? "due"
            : input.displayStatus.includes("安全等待中")
              ? "safety_wait"
              : "not_applicable";
  return {
    state,
    completedAt: safeDate(input.completedAt),
    baseWaitingDays: snapshot?.baseWaitingDays ?? null,
    returnProtectionDays: snapshot?.returnProtectionDays ?? null,
    projectedReleaseDate: safeDate(input.releaseEligibleBusinessDate)?.slice(0, 10) ?? null,
    releasedAt: safeDate(input.releasedAt),
    reversedAt: safeDate(input.reversedAt),
    exactDayBreakdownAvailable: Boolean(snapshot),
  };
}

export function formatRewardRatePercent(value: number) {
  return `${finiteNumber(value).toLocaleString("zh-TW", { maximumFractionDigits: 2 })}%`;
}

export function summarizeRewardSourceItems(items: RewardSourceOrderItem[]) {
  const first = items[0];
  if (!first) return "歷史資料未記錄";
  const firstText = `${first.name}${first.optionLabel ? `・${first.optionLabel}` : ""}${first.preparationLabel ? `・${first.preparationLabel}` : ""} × ${first.quantity}`;
  return items.length > 1 ? `${firstText} ＋ ${items.length - 1} 項商品` : firstText;
}

export function compactRewardDisplayStatus(value: string) {
  if (value === "資格已確認・安全等待中" || value === "本人消費不需推薦資格・安全等待中") return "安全等待中";
  if (value === "已入帳 ✓") return "已入帳";
  if (value === "尚待取得推薦回饋資格") return "尚待取得資格";
  return value;
}

export type RewardLedgerSortItem = {
  stableKey: string;
  releaseEligibleBusinessDate: string | null;
  releasedAt: string | null;
  sourceOrderCreatedAt: string | null;
};

export function sortRewardLedgerItems<T extends RewardLedgerSortItem>(
  items: T[],
  mode: "all" | "pending" | "released",
) {
  return [...items].sort((left, right) => {
    if (mode === "pending") {
      const leftDate = left.releaseEligibleBusinessDate;
      const rightDate = right.releaseEligibleBusinessDate;
      if (leftDate && rightDate && leftDate !== rightDate) return leftDate.localeCompare(rightDate);
      if (leftDate && !rightDate) return -1;
      if (!leftDate && rightDate) return 1;
      const sourceDifference = String(right.sourceOrderCreatedAt ?? "").localeCompare(String(left.sourceOrderCreatedAt ?? ""));
      return sourceDifference || left.stableKey.localeCompare(right.stableKey);
    }

    if (mode === "released") {
      const releaseDifference = String(right.releasedAt ?? "").localeCompare(String(left.releasedAt ?? ""));
      return releaseDifference || left.stableKey.localeCompare(right.stableKey);
    }

    const leftActivity = left.releasedAt ?? left.sourceOrderCreatedAt ?? left.releaseEligibleBusinessDate ?? "";
    const rightActivity = right.releasedAt ?? right.sourceOrderCreatedAt ?? right.releaseEligibleBusinessDate ?? "";
    const activityDifference = rightActivity.localeCompare(leftActivity);
    return activityDifference || left.stableKey.localeCompare(right.stableKey);
  });
}

export function resolveEffectiveRewardDisplayStatus(
  input: EffectiveRewardDisplayInput,
  todayDate: string,
) {
  if (input.status === "released") return "已入帳 ✓";
  if (input.status === "reversed") return "已沖回";
  if (input.status === "cancelled") return "已取消";
  if (input.qualificationStatus === "expired") return "資格已逾期";
  if (!input.sourceCompleted) return "等待來源訂單完成";

  const isSelfPurchase = input.qualificationAuthority === "self_purchase_direct";
  const hasCoverage = input.qualificationAuthority === "qualification_coverage"
    && Boolean(input.qualificationCoverage);
  const hasMaturation = input.qualificationAuthority === "qualification_coverage"
    && Boolean(input.qualificationMaturation);
  const isQualified = isSelfPurchase || hasCoverage || hasMaturation || input.qualificationStatus === "qualified";

  if (!isQualified) {
    if (input.qualificationStatus === "awaiting_completion") return "等待來源訂單完成";
    return "尚待取得推薦回饋資格";
  }

  if (
    input.status === "scheduled"
    && input.releaseEligibleBusinessDate
    && input.releaseEligibleBusinessDate <= todayDate
  ) return "待系統入帳";

  if (isSelfPurchase) return "本人消費不需推薦資格・安全等待中";
  return "資格已確認・安全等待中";
}

export function buildSafeRewardSourceOrderSummary(input: {
  currentMemberId: string;
  rewardBeneficiaryMemberId: string;
  sourceOrderNumber: string | null;
  order: unknown;
  referralLevel: number | null;
  calculationBasis?: "pv" | "paid_amount";
  effectivePV: number;
  rewardRate: number;
  rewardPV: number | null;
  projectedCreditAmount: number;
  actualCreditAmount?: number | null;
  availableCreditAmount?: number | null;
  releaseEligibleBusinessDate?: string | null;
  releasedAt?: string | null;
  reversedAt?: string | null;
  waitingRuleSnapshot?: RewardWaitingRuleSnapshot | null;
  rewardStatus: string;
  qualificationStatus?: string | null;
  qualificationAuthority?: "legacy_order" | "qualification_coverage" | "self_purchase_direct" | null;
  qualificationCoverage?: object | null;
  qualificationMaturation?: object | null;
  successfulCompletionAt?: string | null;
  todayDate: string;
}): RewardSourceOrderSummary | null {
  if (input.rewardBeneficiaryMemberId !== input.currentMemberId) return null;
  if (!input.sourceOrderNumber || !/^KD[0-9-]+$/u.test(input.sourceOrderNumber)) return null;

  const order = record(input.order);
  if (!order || order.orderNumber !== input.sourceOrderNumber) return null;

  const orderMember = record(order.member);
  const orderMemberId = safeText(orderMember?.memberId, 160);
  const canViewFullOrder = Boolean(orderMemberId && orderMemberId === input.currentMemberId);
  const sourceCategory = canViewFullOrder ? "self" : orderMemberId ? "downline" : "guest";
  const sourceCategoryLabel = sourceCategory === "self"
    ? "自己的訂單"
    : sourceCategory === "guest"
      ? "訪客訂單"
      : input.referralLevel && input.referralLevel >= 1 && input.referralLevel <= 3
        ? `第 ${input.referralLevel} 代會員訂單`
        : "會員訂單";

  const fulfillmentEvents = Array.isArray(order.fulfillmentEvents) ? order.fulfillmentEvents : [];
  const completionEvent = fulfillmentEvents
    .map(record)
    .filter((event): event is Record<string, unknown> => Boolean(event && event.state === "completed" && safeDate(event.occurredAt)))
    .sort((left, right) => String(right.occurredAt).localeCompare(String(left.occurredAt)))[0];
  const completedAt = safeDate(completionEvent?.occurredAt)
    ?? safeDate(input.successfulCompletionAt);
  const fulfillmentSummary = record(order.fulfillmentSummary);
  const rawStatus = safeText(fulfillmentSummary?.state, 80) || safeText(order.status, 80);
  const fulfillmentStatus = ({
    completed: "已完成取貨",
    ready_for_pickup: "等待取貨",
    ready_for_store_pickup: "等待取貨",
    arrived_at_pickup_store: "已到店等待取貨",
    shipped: "已出貨",
    in_transit: "配送中",
    preparing: "準備中",
    order_created: "訂單已成立",
    cancelled: "已取消",
    uncollected: "未完成取貨",
  } as Record<string, string>)[rawStatus] ?? (rawStatus ? "處理中" : "歷史資料未記錄");

  const sourceItems = (Array.isArray(order.items) ? order.items : [])
    .slice(0, 20)
    .map((value): RewardSourceOrderItem => {
      const item = record(value);
      return {
        name: safeText(item?.name, 80) || "KD Coffee 商品",
        optionLabel: safeText(item?.optionLabel, 60),
        optionDetail: safeText(item?.optionDetail, 80),
        preparationLabel: safeText(item?.preparationLabel, 60),
        quantity: Math.max(1, Math.min(999, Math.trunc(finiteNumber(item?.quantity, 1)))),
      };
    });
  const sourceCompleted = rawStatus === "completed" || Boolean(completedAt);
  const releaseEligibleBusinessDate = safeDate(input.releaseEligibleBusinessDate)?.slice(0, 10) ?? null;
  const releasedAt = safeDate(input.releasedAt);
  const reversedAt = safeDate(input.reversedAt);
  const displayStatus = resolveEffectiveRewardDisplayStatus({
    status: input.rewardStatus,
    qualificationStatus: input.qualificationStatus,
    qualificationAuthority: input.qualificationAuthority,
    qualificationCoverage: input.qualificationCoverage,
    qualificationMaturation: input.qualificationMaturation,
    releaseEligibleBusinessDate,
    releasedAt,
    sourceCompleted,
  }, input.todayDate);

  return {
    orderNumber: input.sourceOrderNumber,
    sourceCategory,
    sourceCategoryLabel,
    canViewFullOrder,
    createdAt: safeDate(order.createdAt),
    completedAt,
    fulfillmentStatus,
    sourceItems,
    referralLevel: input.referralLevel,
    calculationBasis: input.calculationBasis ?? "pv",
    effectivePV: finiteNumber(input.effectivePV),
    rewardRate: finiteNumber(input.rewardRate),
    rewardPV: typeof input.rewardPV === "number" && Number.isFinite(input.rewardPV) ? input.rewardPV : null,
    projectedCreditAmount: finiteNumber(input.projectedCreditAmount),
    actualCreditAmount: typeof input.actualCreditAmount === "number" && Number.isFinite(input.actualCreditAmount) ? input.actualCreditAmount : null,
    availableCreditAmount: typeof input.availableCreditAmount === "number" && Number.isFinite(input.availableCreditAmount) ? input.availableCreditAmount : null,
    releaseEligibleBusinessDate,
    releasedAt,
    reversedAt,
    rewardStatus: input.rewardStatus,
    displayStatus,
    waitingExplanation: buildRewardWaitingExplanation({
      rewardStatus: input.rewardStatus,
      displayStatus,
      sourceCompleted,
      completedAt,
      releaseEligibleBusinessDate,
      releasedAt,
      reversedAt,
      waitingRuleSnapshot: input.waitingRuleSnapshot,
    }),
  };
}
