"use client";

import Link from "next/link";
import { useRef } from "react";
import { MemberCopyText, useMemberCopyKey } from "./MemberCenterCopyProvider";
import MemberCreditLedger from "./MemberCreditLedger";
import type { MemberCreditPassbookPage } from "@/lib/memberCreditPassbook";
import styles from "./MemberCreditPassbook.module.css";

export default function MemberCreditPassbook({ availableCredit, initialPage, pointDisplayName }: {
  availableCredit: number;
  initialPage: MemberCreditPassbookPage;
  pointDisplayName?: string;
}) {
  const copy = useMemberCopyKey();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  return <div className={styles.cardSlot}>
    <button ref={trigger} type="button" className={`member-dashboard-card ${styles.trigger}`} aria-haspopup="dialog"
      onClick={() => dialog.current?.showModal()}>
      <small><MemberCopyText copyKey="member.dashboard.label.3dd941956d" /></small>
      <strong>{availableCredit.toLocaleString("zh-TW")} <MemberCopyText copyKey="member.dashboard.label.622f3c5acb" /></strong>
      <span><MemberCopyText copyKey="member.dashboard.reward.65ec2fee29" /></span>
    </button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="member-credit-passbook-title"
      onClose={() => trigger.current?.focus()} onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right
          || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.current?.close();
      }}>
      <header className={styles.header}>
        <h2 id="member-credit-passbook-title"><MemberCopyText copyKey="credit.passbook.title" /></h2>
        <div className={styles.actions}>
          <Link href="/member?rewardView=released#rewards" onClick={() => dialog.current?.close()}>
            <MemberCopyText copyKey="credit.passbook.details" />
          </Link>
          <button type="button" autoFocus aria-label={copy("credit.passbook.close")} onClick={() => dialog.current?.close()}>×</button>
        </div>
      </header>
      <div ref={scrollArea} className={styles.body}>
        <div className={styles.summary}><small><MemberCopyText copyKey="credit.passbook.available" /></small><strong>{availableCredit.toLocaleString("zh-TW")} <MemberCopyText copyKey="member.dashboard.label.622f3c5acb" /></strong></div>
        <MemberCreditLedger initialPage={initialPage} scrollArea={scrollArea} pointDisplayName={pointDisplayName}
          onPageChange={() => scrollArea.current?.scrollTo({ top: 0 })} />
      </div>
    </dialog>
  </div>;
}
