"use client";
import { useEffect, useId, useRef, useState } from "react";
import { MemberCopyText, useMemberCopyKey } from "./MemberCenterCopyProvider";
import type { CancelCreditPreview } from "@/lib/cancelCreditPreview";
import { formatTaipeiDateTime } from "@/lib/memberRewardPresentation";
import styles from "./MemberCreditPassbook.module.css";

export function CancelCreditPreviewContent({ preview }: { preview: CancelCreditPreview }) {
  const copy = useMemberCopyKey();
  const money = (amount: number) => amount.toLocaleString("zh-TW") + " " + copy("member.dashboard.label.622f3c5acb");
  if (preview.status === "none") return null;
  return <>
    {preview.originalAmount !== null && <p><MemberCopyText copyKey="credit.cancelPreview.original" />：{money(preview.originalAmount)}</p>}
    {preview.status === "ready" ? <>
      <dl className={styles.detailFields}>
        <dt><MemberCopyText copyKey="credit.cancelPreview.restorable" /></dt><dd>{money(preview.restorableAmount!)}</dd>
        <dt><MemberCopyText copyKey="credit.cancelPreview.expired" /></dt><dd>{money(preview.expiredAmount!)}</dd>
        {!!preview.otherUnavailableAmount && <><dt><MemberCopyText copyKey="credit.cancelPreview.otherUnavailable" /></dt><dd>{money(preview.otherUnavailableAmount)}</dd></>}
      </dl>
      <details><summary><MemberCopyText copyKey="credit.cancelPreview.sources" /></summary>
        <ul>{preview.entries.map((entry, index) => <li key={index}>{copy("credit.cancelPreview.source", {
          amount: money(entry.amount), restorable: money(entry.restorableAmount), date: formatTaipeiDateTime(entry.expiresAt),
        })}</li>)}</ul>
      </details>
      <p><MemberCopyText copyKey="credit.cancelPreview.warning" /></p>
    </> : <p role="status"><MemberCopyText copyKey="credit.cancelPreview.unknown" /></p>}
  </>;
}

/** Both member cancellation entry points await this same read-only confirmation. */
export function useCancelCreditConfirmation() {
  const [data, setData] = useState<{ preview: CancelCreditPreview | null; blocked: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const resolve = useRef<((confirmed: boolean) => void) | null>(null);
  const busy = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const titleId = useId();
  function finish(confirmed: boolean) {
    const callback = resolve.current;
    resolve.current = null;
    dialog.current?.close();
    setData(null);
    callback?.(confirmed);
  }
  useEffect(() => { if (data && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [data]);
  useEffect(() => () => { abort.current?.abort(); resolve.current?.(false); resolve.current = null; }, []);
  async function confirm(orderNumber: string): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true;
    setLoading(true);
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    abort.current = new AbortController();
    try {
      let preview: CancelCreditPreview | null = null;
      let blocked = false;
      try {
        const response = await fetch(`/api/member/orders/${encodeURIComponent(orderNumber)}/cancel/credit-preview`, {
          cache: "no-store", signal: abort.current.signal,
        });
        if (response.status === 401 || response.status === 404 || response.status === 403) blocked = true;
        else if (response.ok) preview = await response.json();
      } catch { if (abort.current.signal.aborted) return false; }
      setLoading(false);
      if (preview?.status === "none") return true;
      return await new Promise<boolean>(done => {
        resolve.current = done;
        setData({ preview: preview ?? { status: "unavailable", originalAmount: null, restorableAmount: null,
          expiredAmount: null, otherUnavailableAmount: null, entries: [], generatedAt: "" }, blocked });
      });
    } finally {
      busy.current = false;
      setLoading(false);
      trigger?.focus();
    }
  }
  const confirmation = <>
    {loading && <p role="status"><MemberCopyText copyKey="credit.cancelPreview.loading" /></p>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); finish(false); }} onClose={() => finish(false)}>
      <header className={styles.header}><h2 id={titleId}><MemberCopyText copyKey="credit.cancelPreview.title" /></h2></header>
      <div className={styles.body}>
        {data?.blocked ? <p role="alert"><MemberCopyText copyKey="credit.cancelPreview.blocked" /></p>
          : data?.preview && <CancelCreditPreviewContent preview={data.preview} />}
        <div className="member-action-buttons">
          <button type="button" autoFocus onClick={() => finish(false)}><MemberCopyText copyKey="credit.cancelPreview.back" /></button>
          {!data?.blocked && <button type="button" onClick={() => finish(true)}><MemberCopyText copyKey="credit.cancelPreview.confirm" /></button>}
        </div>
      </div>
    </dialog>
  </>;
  return { confirm, confirmation, loading };
}
