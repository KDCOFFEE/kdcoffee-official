"use client";

import { useEffect, useId, useRef } from "react";
import { MemberCopyText, useMemberCopyKey, useMemberPointDisplayName } from "./MemberCenterCopyProvider";
import { formatTaipeiDateTime } from "@/lib/memberRewardPresentation";
import type { MemberCreditPassbookRow } from "@/lib/memberCreditPassbook";
import styles from "./MemberCreditPassbook.module.css";

export default function MemberCreditEntryDetail({ entry, pointDisplayName = "", onDismiss }: {
  entry: MemberCreditPassbookRow | null;
  pointDisplayName?: string;
  onDismiss: () => void;
}) {
  const copy = useMemberCopyKey();
  const pointName = useMemberPointDisplayName(pointDisplayName);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const detail = entry?.detail;
  useEffect(() => { if (detail && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [detail]);
  const unknown = copy("member.rewards.label.99ff24be30");
  const date = (value: string | null) => formatTaipeiDateTime(value, unknown);
  const credit = (value: number) => `${value.toLocaleString("zh-TW")} ${copy("member.dashboard.label.622f3c5acb")}`;
  const products = detail?.products.map((item) => [item.name, item.optionLabel, item.optionDetail, item.preparationLabel]
    .filter(Boolean).join("・") + ` × ${item.quantity}`).join("、");
  return <dialog ref={dialog} className={`${styles.dialog} ${styles.entryDetail}`} aria-labelledby={titleId}
    onCancel={(event) => { event.stopPropagation(); event.preventDefault(); dialog.current?.close(); }}
    onClose={(event) => { event.stopPropagation(); onDismiss(); }}
    onClick={(event) => {
      event.stopPropagation();
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.current?.close();
    }}>
    <header className={styles.header}>
      <h2 id={titleId}><MemberCopyText copyKey="member.referral.reward.7631502fb3" /></h2>
      <div className={styles.actions}><button type="button" autoFocus aria-label={copy("member.referral.tooltip.fd8688ce9b")}
        onClick={() => dialog.current?.close()}>×</button></div>
    </header>
    {detail && entry && <div className={styles.body}>
      <h3 className={styles.detailTitle}>{copy(detail.titleKey, detail.titleValues)}</h3>
      <dl className={styles.detailFields}>
        <dt><MemberCopyText copyKey="credit.passbook.detail.status" /></dt><dd>{copy(detail.statusKey)}</dd>
        <dt><MemberCopyText copyKey="member.navigation.label.59fcdacba3" /></dt><dd>{detail.orderNumber ?? unknown}</dd>
        <dt><MemberCopyText copyKey="member.subscription.label.004922066e" /></dt><dd>{products || unknown}</dd>
        <dt><MemberCopyText copyKey="member.rewards.reward.5ff465da46" /></dt><dd>{detail.rewardPoints === null ? unknown
          : `${detail.rewardPoints > 0 ? "+" : ""}${detail.rewardPoints.toLocaleString("zh-TW", { maximumFractionDigits: 2 })} ${pointName}`}</dd>
        <dt><MemberCopyText copyKey="credit.passbook.detail.creditAmount" /></dt><dd>{detail.creditAmount > 0 ? "+" : ""}{credit(detail.creditAmount)}</dd>
        <dt><MemberCopyText copyKey="credit.passbook.detail.createdAt" /></dt><dd>{date(detail.createdAt)}</dd>
        <dt><MemberCopyText copyKey={entry.change < 0 ? "member.rewards.label.6339e76163" : "member.rewards.reward.c5769e5a26"} /></dt><dd>{date(detail.creditedAt)}</dd>
      </dl>
      <p className={styles.detailBalance}>{entry.balanceAfter === null ? <MemberCopyText copyKey="credit.passbook.unresolvedBalance" />
        : <MemberCopyText copyKey="credit.passbook.balance" values={{ amount: credit(entry.balanceAfter) }} />}</p>
    </div>}
  </dialog>;
}
