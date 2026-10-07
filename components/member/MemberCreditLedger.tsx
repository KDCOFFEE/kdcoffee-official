"use client";

import { useRef, useState } from "react";
import { MemberCopyText, useMemberCopyKey } from "./MemberCenterCopyProvider";
import { formatTaipeiDateTime } from "@/lib/memberRewardPresentation";
import type { MemberCreditPassbookPage, MemberCreditPassbookRow } from "@/lib/memberCreditPassbook";
import { captureCreditPassbookReturn } from "@/lib/memberCreditDetailReturn";
import MemberCreditEntryDetail from "./MemberCreditEntryDetail";
import styles from "./MemberCreditPassbook.module.css";

export default function MemberCreditLedger({ initialPage, onPageChange, scrollArea, pointDisplayName }: {
  initialPage: MemberCreditPassbookPage;
  onPageChange?: () => void;
  scrollArea?: { current: HTMLDivElement | null };
  pointDisplayName?: string;
}) {
  const copy = useMemberCopyKey();
  // Retain visited pages so Previous restores exactly the page the member saw.
  const [pages, setPages] = useState([initialPage]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const [selectedEntry, setSelectedEntry] = useState<MemberCreditPassbookRow | null>(null);
  const returnToPassbook = useRef<(() => void) | null>(null);
  const page = pages[pageIndex];
  const hasNext = page.nextCursor !== undefined ? page.nextCursor !== null : page.nextOffset !== null;
  const unit = copy("member.dashboard.label.622f3c5acb");
  const money = (amount: number) => amount.toLocaleString("zh-TW") + " " + unit;
  function move(index: number) {
    setPageIndex(index);
    setFailed(false);
    onPageChange?.();
  }
  async function loadNext() {
    if (!hasNext || busy.current) return;
    if (pages[pageIndex + 1]) { move(pageIndex + 1); return; }
    busy.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const query = page.nextCursor ? "cursor=" + encodeURIComponent(page.nextCursor) : "offset=" + page.nextOffset;
      const response = await fetch("/api/member/credit/history?" + query, { cache: "no-store" });
      if (!response.ok) throw new Error("History unavailable");
      const next: MemberCreditPassbookPage = await response.json();
      setPages((current) => [...current, next]);
      move(pageIndex + 1);
    } catch { setFailed(true); }
    finally { busy.current = false; setLoading(false); }
  }

  return <div className={styles.ledger} aria-busy={loading}>
    {page.entries.length ? <ol className={styles.rows}>
      {page.entries.map((entry, index) => <li className={styles.row} key={entry.date + ":" + index}>
        <time className={styles.date} dateTime={entry.date}>{formatTaipeiDateTime(entry.date)}</time>
        <div className={styles.transaction}>
          <strong className={styles.description}>{copy(entry.descriptionKey) || copy("credit.passbook.creditIssued")}</strong>
          <strong className={styles.delta + " " + (entry.change < 0 ? styles.debit : styles.credit)}>{entry.change > 0 ? "+" : ""}{money(entry.change)}</strong>
          <span className={styles.balance}>{entry.balanceAfter === null
            ? <MemberCopyText copyKey="credit.passbook.unresolvedBalance" />
            : <MemberCopyText copyKey="credit.passbook.balance" values={{ amount: money(entry.balanceAfter) }} />}</span>
          {entry.detail && <button type="button" className={styles.entryAction} aria-haspopup="dialog"
            aria-label={copy("credit.passbook.entryDetailsAria", { description: copy(entry.descriptionKey),
              date: formatTaipeiDateTime(entry.date, copy("member.rewards.label.99ff24be30")), amount: (entry.change > 0 ? "+" : "") + money(entry.change) })}
            onClick={(event) => {
              returnToPassbook.current = captureCreditPassbookReturn(event.currentTarget, scrollArea?.current);
              setSelectedEntry(entry);
            }}><MemberCopyText copyKey="credit.passbook.entryDetails" /></button>}
        </div>
      </li>)}
    </ol> : <p className={styles.empty}><MemberCopyText copyKey="credit.passbook.empty" /></p>}
    {page.entries.some((entry) => entry.balanceAfter === null) && <p className={styles.note}><MemberCopyText copyKey="credit.passbook.oldBalanceNote" /></p>}
    {failed && <p role="alert"><MemberCopyText copyKey="credit.passbook.loadError" /> <button type="button" onClick={() => void loadNext()} disabled={loading}><MemberCopyText copyKey="credit.passbook.retry" /></button></p>}
    {loading && <p role="status"><MemberCopyText copyKey="credit.passbook.loading" /></p>}
    <nav className={styles.pagination} aria-label={copy("credit.passbook.pagination")}>
      <button type="button" disabled={loading || pageIndex === 0} onClick={() => move(pageIndex - 1)}><MemberCopyText copyKey="credit.passbook.prevPage" /></button>
      <span aria-live="polite"><MemberCopyText copyKey="credit.passbook.pageLabel" values={{ page: pageIndex + 1 }} /></span>
      <button type="button" disabled={loading || !hasNext} onClick={() => void loadNext()}><MemberCopyText copyKey="credit.passbook.nextPage" /></button>
    </nav>
    <MemberCreditEntryDetail entry={selectedEntry} pointDisplayName={pointDisplayName} onDismiss={() => {
      setSelectedEntry(null);
      returnToPassbook.current?.();
      returnToPassbook.current = null;
    }} />
  </div>;
}
