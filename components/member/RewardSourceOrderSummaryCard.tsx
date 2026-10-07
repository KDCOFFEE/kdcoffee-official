"use client";

import { MemberCopyValue, MemberRewardCopyValue, useMemberCopyKey, useMemberPointDisplayName, MemberCopyText } from "@/components/member/MemberCenterCopyProvider";

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
  pointDisplayName: configuredPointDisplayName,
  title,
  sourceMemberNumber,
  variant = "full",
}: Props) {
  const copy = useMemberCopyKey();
  const pointDisplayName = useMemberPointDisplayName(configuredPointDisplayName);
  const creditMoney = (value: number) => `${value.toLocaleString("zh-TW", { maximumFractionDigits: 0 })} ${copy("member.dashboard.label.622f3c5acb")}`;
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
        <div className={styles.sourceRewardStatus}><span><MemberRewardCopyValue value={statusText} /></span>{timingText ? <small><MemberCopyValue value={timingText} /></small> : null}</div>
      </div> : null}
      {variant === "full" ? <div className="member-org-order-card-title">
        <div>
          <small><MemberCopyText copyKey="member.rewards.label.288a8028b8" /></small>
          <strong><MemberRewardCopyValue value={rewardTitle} /></strong>
        </div>
        <em>{summary.orderNumber}</em>
      </div> : <p><strong><MemberRewardCopyValue value={summary.sourceCategoryLabel} /></strong>・{summary.orderNumber}</p>}
      <div className="member-org-order-source">
        <span>
          <small><MemberCopyText copyKey="member.rewards.label.540dc43609" /></small>
          <strong><MemberRewardCopyValue value={summary.sourceCategoryLabel} /></strong>
        </span>
        <span>
          <small><MemberCopyText copyKey="member.rewards.label.a724b98d08" /></small>
          <strong><MemberRewardCopyValue value={summary.fulfillmentStatus} /></strong>
        </span>
        <span>
          <small><MemberCopyText copyKey="member.rewards.label.363cb82ec7" /></small>
          <strong>{formatTaipeiDateTime(summary.completedAt)}</strong>
        </span>
        {sourceMemberNumber ? <span><small><MemberCopyText copyKey="member.rewards.label.9008c2ba8d" /></small><strong>{sourceMemberNumber}</strong></span> : null}
        <span className="member-org-order-items">
          <small><MemberCopyText copyKey="member.rewards.label.ae864ac31e" /></small>
          <strong><MemberCopyValue value={itemText} /></strong>
        </span>
      </div>
      {variant === "full" ? <div className="member-org-order-calc">
        <span><small><MemberCopyValue value={basisLabel} /></small><strong><MemberCopyValue value={basisValue} /></strong></span>
        <span><small><MemberCopyText copyKey="member.rewards.reward.bcdf839b88" /></small><strong>{formatRewardRatePercent(summary.rewardRate)}</strong></span>
        <span><small><MemberCopyText copyKey="member.rewards.reward.5ff465da46" /></small><strong><MemberCopyValue value={summary.rewardPV == null ? "歷史資料未記錄" : `${points(summary.rewardPV)} ${pointDisplayName}`} /></strong></span>
        <span><small>{summary.rewardStatus === "released" ? <MemberCopyText copyKey="member.rewards.reward.14f77fbdd5" /> : <MemberCopyText copyKey="member.rewards.label.ccf442cc5e" />}</small><strong>{creditMoney(creditAmount)}</strong></span>
      </div> : null}
      {variant === "full" && ["released", "reversed", "cancelled"].includes(summary.waitingExplanation.state) ? <div className="member-org-order-source">
        <span>
          <small><MemberCopyValue value={timingLabel} /></small>
          <strong><MemberCopyValue value={timingValue} /></strong>
        </span>
        {summary.rewardStatus === "released" && summary.availableCreditAmount != null ? (
          <span><small><MemberCopyText copyKey="credit.passbook.available" /></small><strong>{creditMoney(summary.availableCreditAmount)}</strong></span>
        ) : null}
      </div> : null}
      {variant === "full" ? <div className={styles.sourceWaitingDisclosure}><RewardWaitingDisclosure explanation={summary.waitingExplanation} /></div> : null}
      {summary.canViewFullOrder ? (
        <p className="member-reward-consumption">
          <b><MemberCopyText copyKey="member.rewards.label.0ce1d41474" /></b>
          <span><Link href={`/orders/${encodeURIComponent(summary.orderNumber)}`}><MemberCopyText copyKey="member.rewards.button.52c7dd3708" /></Link></span>
        </p>
      ) : null}
    </div>
  );
}
