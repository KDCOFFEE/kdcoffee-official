"use client";

import { MemberCopyValue } from "@/components/member/MemberCenterCopyProvider";

import Link from "next/link";

import {
  compactRewardDisplayStatus,
  formatTaipeiDate,
  formatTaipeiDateTime,
  formatRewardRatePercent,
  rewardTimingText,
  type RewardSourceOrderSummary,
} from "@/lib/memberRewardPresentation";

import RewardWaitingDisclosure from "./RewardWaitingDisclosure";
import styles from "./MemberReferralExperience.module.css";

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
  const statusText = compactRewardDisplayStatus(summary.displayStatus);
  const timingText = rewardTimingText(summary.waitingExplanation);
  const timingLabel = summary.waitingExplanation.state === "released"
    ? "入帳日期"
    : summary.waitingExplanation.state === "reversed"
      ? "沖回日期"
      : summary.waitingExplanation.state === "cancelled"
        ? "入帳狀態"
        : "預計入帳日期";
  const timingValue = summary.waitingExplanation.state === "released"
    ? formatTaipeiDateTime(summary.releasedAt)
    : summary.waitingExplanation.state === "reversed"
      ? summary.reversedAt ? formatTaipeiDate(summary.reversedAt) : "已沖回"
      : summary.waitingExplanation.state === "cancelled"
        ? "已取消"
        : summary.releaseEligibleBusinessDate
          ? formatTaipeiDate(summary.releaseEligibleBusinessDate)
          : summary.waitingExplanation.state === "awaiting_completion"
            ? "待完成取貨後計算"
            : "入帳日期確認中";

  return (
    <div className={`member-org-order-card${variant === "source-only" ? " member-org-order-card-source-only" : ""}`}>
      {variant === "full" ? <div className="member-org-order-card-top">
        <time>{formatTaipeiDateTime(summary.createdAt)}</time>
        <div className={styles.sourceRewardStatus}><span><MemberCopyValue value={statusText} /></span>{timingText ? <small><MemberCopyValue value={timingText} /></small> : null}</div>
      </div> : null}
      {variant === "full" ? <div className="member-org-order-card-title">
        <div>
          <small><MemberCopyValue value={"REWARD SOURCE ORDER"} /></small>
          <strong>{rewardTitle}</strong>
        </div>
        <em>{summary.orderNumber}</em>
      </div> : <p><strong><MemberCopyValue value={summary.sourceCategoryLabel} /></strong>・{summary.orderNumber}</p>}
      <div className="member-org-order-source">
        <span>
          <small><MemberCopyValue value={"訂單類型"} /></small>
          <strong><MemberCopyValue value={summary.sourceCategoryLabel} /></strong>
        </span>
        <span>
          <small><MemberCopyValue value={"訂單狀態"} /></small>
          <strong><MemberCopyValue value={summary.fulfillmentStatus} /></strong>
        </span>
        <span>
          <small><MemberCopyValue value={"完成取貨"} /></small>
          <strong>{formatTaipeiDateTime(summary.completedAt)}</strong>
        </span>
        {sourceMemberNumber ? <span><small><MemberCopyValue value={"來源會員"} /></small><strong>{sourceMemberNumber}</strong></span> : null}
        <span className="member-org-order-items">
          <small><MemberCopyValue value={"購買內容"} /></small>
          <strong>{itemText}</strong>
        </span>
      </div>
      {variant === "full" ? <div className="member-org-order-calc">
        <span><small><MemberCopyValue value={basisLabel} /></small><strong><MemberCopyValue value={basisValue} /></strong></span>
        <span><small><MemberCopyValue value={"回饋比例"} /></small><strong>{formatRewardRatePercent(summary.rewardRate)}</strong></span>
        <span><small><MemberCopyValue value={"本筆回饋"} /></small><strong><MemberCopyValue value={summary.rewardPV == null ? "歷史資料未記錄" : `${points(summary.rewardPV)} ${pointDisplayName}`} /></strong></span>
        <span><small><MemberCopyValue value={summary.rewardStatus === "released" ? "實際入帳" : "預估折抵價值"} /></small><strong>{money(creditAmount)}</strong></span>
      </div> : null}
      {variant === "full" && ["released", "reversed", "cancelled"].includes(summary.waitingExplanation.state) ? <div className="member-org-order-source">
        <span>
          <small><MemberCopyValue value={timingLabel} /></small>
          <strong><MemberCopyValue value={timingValue} /></strong>
        </span>
        {summary.rewardStatus === "released" && summary.availableCreditAmount != null ? (
          <span><small><MemberCopyValue value={"目前可用"} /></small><strong>{money(summary.availableCreditAmount)}</strong></span>
        ) : null}
      </div> : null}
      {variant === "full" ? <div className={styles.sourceWaitingDisclosure}><RewardWaitingDisclosure explanation={summary.waitingExplanation} /></div> : null}
      {summary.canViewFullOrder ? (
        <p className="member-reward-consumption">
          <b><MemberCopyValue value={"完整訂單"} /></b>
          <span><Link href={`/orders/${encodeURIComponent(summary.orderNumber)}`}><MemberCopyValue value={"查看完整訂單 →"} /></Link></span>
        </p>
      ) : null}
    </div>
  );
}
