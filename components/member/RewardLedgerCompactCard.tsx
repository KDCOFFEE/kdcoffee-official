"use client";

import type { ReactNode } from "react";

import {
  compactRewardDisplayStatus,
  formatTaipeiDate,
  formatTaipeiMonthDay,
  formatRewardRatePercent,
  summarizeRewardSourceItems,
  type RewardSourceOrderItem,
  type RewardSourceOrderSummary,
} from "@/lib/memberRewardPresentation";

import RewardSourceOrderSummaryCard from "./RewardSourceOrderSummaryCard";
import styles from "./MemberReferralExperience.module.css";

type Props = {
  detailId: string;
  expanded: boolean;
  onToggle: () => void;
  title: string;
  displayStatus: string;
  sourceDate: string | null;
  sourceOrderNumber: string | null;
  sourceItems: RewardSourceOrderItem[];
  rewardPV: number | null;
  creditAmount: number;
  pointDisplayName: string;
  releaseEligibleBusinessDate: string | null;
  releasedAt: string | null;
  calculationBasis: "pv" | "paid_amount";
  calculationBaseValue: number | null;
  rewardRate: number | null;
  sourceOrderSummary: RewardSourceOrderSummary | null;
  sourceMemberNumber?: string | null;
  qualificationSummary: ReactNode;
  qualificationValidUntil?: string | null;
  qualificationRuleText?: string | null;
  lifecycleLabels: string[];
  lifecycleStage: number;
};

const number = (value: number) => value.toLocaleString("zh-TW", { maximumFractionDigits: 2 });
const money = (value: number) => `NT$ ${value.toLocaleString("zh-TW", { maximumFractionDigits: 0 })}`;

export default function RewardLedgerCompactCard({
  detailId,
  expanded,
  onToggle,
  title,
  displayStatus,
  sourceDate,
  sourceOrderNumber,
  sourceItems,
  rewardPV,
  creditAmount,
  pointDisplayName,
  releaseEligibleBusinessDate,
  releasedAt,
  calculationBasis,
  calculationBaseValue,
  rewardRate,
  sourceOrderSummary,
  sourceMemberNumber,
  qualificationSummary,
  qualificationValidUntil,
  qualificationRuleText,
  lifecycleLabels,
  lifecycleStage,
}: Props) {
  const reversed = displayStatus.includes("已沖回");
  const credited = Boolean(releasedAt) || sourceOrderSummary?.rewardStatus === "released";
  const transactionDateSource = credited ? releasedAt : releaseEligibleBusinessDate;
  const transactionText = transactionDateSource
    ? `${reversed ? "已沖回" : credited ? "已入帳" : "預計入帳"} ${formatTaipeiDate(transactionDateSource)}`
    : "待完成取貨後計算";
  const basisLabel = calculationBasis === "paid_amount" ? "有效商品金額" : `有效 ${pointDisplayName}`;
  const basisValue = calculationBaseValue == null
    ? "歷史資料未記錄"
    : calculationBasis === "paid_amount"
      ? money(calculationBaseValue)
      : `${number(calculationBaseValue)} ${pointDisplayName}`;

  return (
    <article className={`${styles.compactRewardCard}${expanded ? ` ${styles.compactRewardCardExpanded}` : ""}`}>
      <div className={styles.compactRewardTopline}>
        <strong>{title}</strong>
        <span>{compactRewardDisplayStatus(displayStatus)}</span>
      </div>
      <p className={styles.compactRewardSource}>
        <time>{formatTaipeiMonthDay(sourceDate)}</time>
        <span aria-hidden="true">·</span>
        <b>{sourceOrderNumber ?? "歷史訂單"}</b>
      </p>
      <p className={styles.compactRewardProduct}>{summarizeRewardSourceItems(sourceItems)}</p>
      <div className={styles.compactRewardResult}>
        <strong>{rewardPV == null ? "點數未記錄" : `+ ${number(rewardPV)} ${pointDisplayName}`}</strong>
        <span>{money(creditAmount)}</span>
      </div>
      <p className={styles.compactRewardDate}>{transactionText}</p>
      <button
        type="button"
        className={styles.compactRewardToggle}
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={onToggle}
      >
        {expanded ? "收合詳情" : "查看詳情"}<span aria-hidden="true">{expanded ? "⌃" : "〉"}</span>
      </button>

      <div id={detailId} className={styles.rewardExpandedDetail} hidden={!expanded}>
        <section aria-labelledby={`${detailId}-calculation`}>
          <h5 id={`${detailId}-calculation`}>回饋怎麼算</h5>
          <dl className={styles.rewardCalculationGrid}>
            <div><dt>{basisLabel}</dt><dd>{basisValue}</dd></div>
            <div><dt>回饋比例</dt><dd>{rewardRate == null ? "歷史資料未記錄" : formatRewardRatePercent(rewardRate)}</dd></div>
            <div><dt>本筆回饋</dt><dd>{rewardPV == null ? "歷史資料未記錄" : `${number(rewardPV)} ${pointDisplayName}`}</dd></div>
            <div><dt>{reversed ? "已沖回折抵" : credited ? "實際入帳" : "預估折抵"}</dt><dd>{money(creditAmount)}</dd></div>
          </dl>
        </section>

        <section aria-labelledby={`${detailId}-source`}>
          <h5 id={`${detailId}-source`}>來源訂單</h5>
          {sourceOrderSummary ? (
            <RewardSourceOrderSummaryCard
              summary={sourceOrderSummary}
              pointDisplayName={pointDisplayName}
              title={title}
              sourceMemberNumber={sourceMemberNumber}
              variant="source-only"
            />
          ) : (
            <p className={styles.rewardDetailFallback}>{sourceOrderNumber ?? "歷史資料未記錄"}・完整來源明細未保留</p>
          )}
        </section>

        <section aria-labelledby={`${detailId}-qualification`}>
          <h5 id={`${detailId}-qualification`}>資格狀態</h5>
          <div className={styles.rewardQualificationSummary}>{qualificationSummary}</div>
          {qualificationValidUntil ? <p className={styles.rewardQualificationDate}>推薦資格有效至 {formatTaipeiDate(qualificationValidUntil)}</p> : null}
          {qualificationRuleText ? (
            <details className={styles.rewardRuleDisclosure}>
              <summary>查看資格規則</summary>
              <p>{qualificationRuleText}</p>
            </details>
          ) : null}
        </section>

        <section aria-labelledby={`${detailId}-progress`}>
          <h5 id={`${detailId}-progress`}>入帳進度</h5>
          <div className={styles.rewardLifecycle} aria-label="回饋入帳進度">
            {lifecycleLabels.map((label, index) => {
              const step = index + 1;
              const state = step < lifecycleStage ? styles.rewardLifecycleDone : step === lifecycleStage ? styles.rewardLifecycleCurrent : "";
              return <span key={label} className={state}><i>{step < lifecycleStage ? "✓" : step === lifecycleStage ? "●" : "○"}</i>{label}</span>;
            })}
          </div>
        </section>
      </div>
    </article>
  );
}
