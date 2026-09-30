import Link from "next/link";

import {
  formatTaipeiDate,
  formatTaipeiDateTime,
  formatRewardRatePercent,
  type RewardSourceOrderSummary,
} from "@/lib/memberRewardPresentation";

type Props = {
  summary: RewardSourceOrderSummary;
  pointDisplayName: string;
  title?: string;
  sourceMemberNumber?: string | null;
  variant?: "full" | "source-only";
};

const points = (value: number) => value.toLocaleString("zh-TW", { maximumFractionDigits: 2 });
const money = (value: number) => `NT$ ${value.toLocaleString("zh-TW", { maximumFractionDigits: 0 })}`;

export default function RewardSourceOrderSummaryCard({
  summary,
  pointDisplayName,
  title,
  sourceMemberNumber,
  variant = "full",
}: Props) {
  const rewardTitle = title
    ?? (summary.referralLevel
      ? `第 ${summary.referralLevel} 代推薦回饋`
      : summary.sourceCategory === "self"
        ? "會員消費回饋"
        : "推廣零售回饋");
  const itemText = summary.sourceItems.length
    ? summary.sourceItems.map((item) => (
      `${item.name}${item.optionLabel ? `・${item.optionLabel}` : ""}${item.optionDetail ? `・${item.optionDetail}` : ""}${item.preparationLabel ? `・${item.preparationLabel}` : ""} × ${item.quantity}`
    )).join("、")
    : "歷史資料未記錄";
  const creditAmount = summary.rewardStatus === "released"
    ? summary.actualCreditAmount ?? summary.projectedCreditAmount
    : summary.projectedCreditAmount;
  const basisLabel = summary.calculationBasis === "paid_amount"
    ? "有效商品金額"
    : `有效 ${pointDisplayName}`;
  const basisValue = summary.calculationBasis === "paid_amount"
    ? money(summary.effectivePV)
    : `${points(summary.effectivePV)} ${pointDisplayName}`;

  return (
    <div className={`member-org-order-card${variant === "source-only" ? " member-org-order-card-source-only" : ""}`}>
      {variant === "full" ? <div className="member-org-order-card-top">
        <time>{formatTaipeiDateTime(summary.createdAt)}</time>
        <span>{summary.displayStatus}</span>
      </div> : null}
      {variant === "full" ? <div className="member-org-order-card-title">
        <div>
          <small>REWARD SOURCE ORDER</small>
          <strong>{rewardTitle}</strong>
        </div>
        <em>{summary.orderNumber}</em>
      </div> : <p><strong>{summary.sourceCategoryLabel}</strong>・{summary.orderNumber}</p>}
      <div className="member-org-order-source">
        <span>
          <small>訂單類型</small>
          <strong>{summary.sourceCategoryLabel}</strong>
        </span>
        <span>
          <small>訂單狀態</small>
          <strong>{summary.fulfillmentStatus}</strong>
        </span>
        <span>
          <small>完成取貨</small>
          <strong>{formatTaipeiDateTime(summary.completedAt)}</strong>
        </span>
        {sourceMemberNumber ? <span><small>來源會員</small><strong>{sourceMemberNumber}</strong></span> : null}
        <span className="member-org-order-items">
          <small>購買內容</small>
          <strong>{itemText}</strong>
        </span>
      </div>
      {variant === "full" ? <div className="member-org-order-calc">
        <span><small>{basisLabel}</small><strong>{basisValue}</strong></span>
        <span><small>回饋比例</small><strong>{formatRewardRatePercent(summary.rewardRate)}</strong></span>
        <span><small>本筆回饋</small><strong>{summary.rewardPV == null ? "歷史資料未記錄" : `${points(summary.rewardPV)} ${pointDisplayName}`}</strong></span>
        <span><small>{summary.rewardStatus === "released" ? "實際入帳" : "預估折抵價值"}</small><strong>{money(creditAmount)}</strong></span>
      </div> : null}
      {variant === "full" ? <div className="member-org-order-source">
        <span>
          <small>{summary.rewardStatus === "released" ? "入帳日期" : "預計入帳日期"}</small>
          <strong>{summary.rewardStatus === "released" ? formatTaipeiDateTime(summary.releasedAt) : formatTaipeiDate(summary.releaseEligibleBusinessDate, "待完成取貨後計算")}</strong>
        </span>
        {summary.rewardStatus === "released" && summary.availableCreditAmount != null ? (
          <span><small>目前可用</small><strong>{money(summary.availableCreditAmount)}</strong></span>
        ) : null}
      </div> : null}
      {summary.canViewFullOrder ? (
        <p className="member-reward-consumption">
          <b>完整訂單</b>
          <span><Link href={`/orders/${encodeURIComponent(summary.orderNumber)}`}>查看完整訂單 →</Link></span>
        </p>
      ) : null}
    </div>
  );
}
