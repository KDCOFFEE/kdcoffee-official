"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";

import MemberQualificationProgress from "./MemberQualificationProgress";

type Progress = ComponentProps<typeof MemberQualificationProgress>["progress"];

const displayDate = (value: string | null | undefined) => value ? value.slice(0, 10).replaceAll("-", "/") : null;

export default function MemberQualificationSummary({ progress }: { progress: Progress }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const validUntil = displayDate(progress.activeCoverage?.coverageEndsAt);
  const status = progress.isQualifiedNow
    ? "已達成 ✓"
    : progress.status === "ready_on_next_completion"
      ? "等待訂單完成確認"
      : "累積中";
  const supporting = progress.isQualifiedNow
    ? validUntil ? `有效至 ${validUntil}` : "目前資格有效"
    : progress.status === "ready_on_next_completion"
      ? "等待有效訂單完成後確認"
      : "查看目前資格進度";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <section className={`member-qualification-summary${progress.isQualifiedNow ? " is-qualified" : ""}`} aria-labelledby="qualification-summary-title">
      <div className="member-qualification-summary-main">
        <strong id="qualification-summary-title">推薦回饋資格</strong>
        <span className="member-qualification-summary-badge">{status}</span>
      </div>
      <div className="member-qualification-summary-meta">
        <span>{supporting}</span>
        <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>查看詳情 <span aria-hidden="true">→</span></button>
      </div>
      <dialog ref={dialogRef} className="member-ia-dialog member-qualification-dialog" aria-labelledby="qualification-dialog-title" onClose={() => { setOpen(false); window.setTimeout(() => triggerRef.current?.focus(), 0); }}>
        <div className="member-ia-dialog-shell">
          <header><div><p className="eyebrow dark">REWARD QUALIFICATION</p><h2 id="qualification-dialog-title">推薦回饋資格詳情</h2></div><button type="button" aria-label="關閉推薦回饋資格詳情" onClick={() => dialogRef.current?.close()}>×</button></header>
          <div className="member-ia-dialog-body"><MemberQualificationProgress progress={progress} /></div>
        </div>
      </dialog>
    </section>
  );
}
