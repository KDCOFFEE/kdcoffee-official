"use client";
/* eslint-disable @next/next/no-img-element -- Native blob previews follow the existing order-photo UI; these user uploads bypass image optimization. */

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { ReturnWorkflowView, safeCreditPreview } from "@/lib/returnWorkflow";
import { returnTaipeiDate } from "@/lib/returnPresentation";
import { MemberCopyText } from "./MemberCenterCopyProvider";
import { useMemberCopyKey } from "./MemberCenterCopyProvider";
import ReturnReasonFields from "./ReturnReasonFields";
import { PackageReturnIcon, ReturnPhotoIcon } from "./ReturnIcons";
import { ORDER_PHOTO_ACCEPT, validOrderPhotoSelection } from "@/lib/orderPhotoPolicy";
import { ReturnCreditEvidence, ReturnRequestEvidence, ReturnRewardEvidence } from "./ReturnEvidence";
import styles from "./ReturnWorkflow.module.css";

type Confirmation = { preview: ReturnType<typeof safeCreditPreview>; confirmationToken: string; values: Record<string, unknown>; idempotencyKey: string; photos: File[] };
export default function MemberReturnWorkflow({ initial }: { initial: ReturnWorkflowView }) {
  const [view, setView] = useState(initial), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [photos, setPhotos] = useState<File[]>([]), [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const copy = useMemberCopyKey();
  const photoInputId = `return-photos-${view.orderNumber}`;
  const dialog = useRef<HTMLDialogElement>(null), previewButton = useRef<HTMLButtonElement>(null);
  const activePhotoUrls = useRef<string[]>([]);
  const endpoint = `/api/member/orders/${encodeURIComponent(view.orderNumber)}/returns`;
  const remaining = view.lines.reduce((sum, line) => sum + line.remainingReturnableQuantity, 0);
  const requests = [...view.requests].reverse().sort((a, b) => Number(["pending", "processing"].includes(b.status)) - Number(["pending", "processing"].includes(a.status)));
  useEffect(() => {
    const urls = activePhotoUrls.current;
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, []);
  function replacePhotos(selected: File[]) {
    activePhotoUrls.current.forEach(url => URL.revokeObjectURL(url));
    const urls = selected.map(photo => URL.createObjectURL(photo));
    activePhotoUrls.current.splice(0, activePhotoUrls.current.length, ...urls);
    setPhotos(selected); setPhotoUrls(urls);
  }
  useEffect(() => {
    if (confirmation) dialog.current?.showModal();
    else if (dialog.current?.open) { dialog.current.close(); previewButton.current?.focus(); }
  }, [confirmation]);
  async function reload() {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (response.ok) setView(await response.json());
  }
  async function post(values: Record<string, unknown>, attachments: File[] = []) {
    const form = new FormData();
    if (attachments.length) { form.append("payload", JSON.stringify(values)); attachments.forEach(photo => form.append("photos", photo)); }
    const response = await fetch(endpoint, { method: "POST", headers: attachments.length ? undefined : { "Content-Type": "application/json" }, body: attachments.length ? form : JSON.stringify(values) });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || copy("member.returns.submitError")), { status: response.status });
    return result;
  }
  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const data = new FormData(event.currentTarget);
    const values = { lines: view.lines.map(line => ({ returnLineRef: line.returnLineRef, quantity: Number(data.get(line.returnLineRef)) })).filter(line => line.quantity > 0),
      reason: data.get("reason"), conditionAcknowledgement: { itemsComplete: data.get("itemsComplete") === "on", unopenedUnusedWhereApplicable: data.get("unopened") === "on" }, quantityAcknowledged: data.get("quantityAcknowledged") === "on" };
    try { const result = await post({ ...values, action: "preview" }); setConfirmation({ ...result, values, photos: [...photos], idempotencyKey: crypto.randomUUID() }); }
    catch (error) { setError(error instanceof Error ? error.message : copy("member.returns.previewError")); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!confirmation || busy) return;
    setBusy(true); setError("");
    try {
      await post({ ...confirmation.values, action: "create", confirmationToken: confirmation.confirmationToken, finalConfirmation: true, idempotencyKey: confirmation.idempotencyKey }, confirmation.photos);
      setConfirmation(null); setOpen(false); replacePhotos([]); await reload();
    } catch (error) {
      setError(error instanceof Error ? error.message : copy("member.returns.submitError"));
      if (error instanceof Error && "status" in error && error.status === 409) { setConfirmation(null); await reload(); }
    }
    finally { setBusy(false); }
  }
  async function withdraw(returnRequestId: string) {
    setBusy(true); setError("");
    try { await post({ action: "withdraw", returnRequestId, idempotencyKey: `withdraw:${returnRequestId}` }); await reload(); }
    catch (error) { setError(error instanceof Error ? error.message : copy("member.returns.submitError")); }
    finally { setBusy(false); }
  }
  return <main className={styles.panel}><Link className={styles.back} href="/member#orders">← <MemberCopyText copyKey="member.returns.back" /></Link>
    <header className={styles.hero}><span className={styles.heroIcon}><PackageReturnIcon /></span><div><h1><MemberCopyText copyKey="member.returns.pageTitle" /></h1><p><MemberCopyText copyKey="member.returns.pageIntro" /></p></div></header>
    <section className={styles.orderSummary}><div><strong><MemberCopyText copyKey="member.returns.order" values={{ orderNumber: view.orderNumber }} /></strong>{view.orderStatus === "completed" ? <span className={styles.badge}><MemberCopyText copyKey="member.returns.completed" /></span> : null}</div>
      {view.returnDeadline ? <p><MemberCopyText copyKey="member.returns.deadline" values={{ date: returnTaipeiDate(view.returnDeadline) }} /></p> : null}</section>
    {view.message ? <p className={styles.notice}><MemberCopyText copyKey="member.returns.manualHelp" /></p> : null}
    {!view.eligible && !view.message ? <p className={styles.muted}><MemberCopyText copyKey={view.eligibility === "return_deadline_expired" ? "member.returns.deadlinePassed" : "member.returns.unavailable"} /></p> : null}
    {error && !confirmation ? <p role="alert" className={styles.notice}>{error}</p> : null}
    {requests.length ? <section className={styles.requestSection}><h2><MemberCopyText copyKey="member.returns.history" /></h2>{requests.map(request => <article className={styles.card} key={request.returnRequestId}>
      <ReturnRequestEvidence request={request} view={view} />{request.withdrawable ? <button className={styles.secondary} type="button" disabled={busy} onClick={() => withdraw(request.returnRequestId)}><MemberCopyText copyKey="member.returns.withdraw" /></button> : null}</article>)}</section> : null}
    {view.eligible ? <section className={styles.newRequest}><div><strong><MemberCopyText copyKey="member.returns.remaining" values={{ quantity: remaining }} /></strong></div><button type="button" data-action="start-return" onClick={() => setOpen(!open)} disabled={busy}><MemberCopyText copyKey={requests.length ? "member.returns.applyAgain" : "member.returns.apply"} /></button></section> : null}
    {open && view.eligible ? <form className={styles.form} onSubmit={preview}><h2><MemberCopyText copyKey="member.returns.selectItems" /></h2>{view.lines.map(line => <div className={styles.lineCard} key={line.returnLineRef}><strong>{line.name}</strong><p>{line.option}</p>
      <small><MemberCopyText copyKey="member.returns.quantitySummary" values={{ original: line.originalQuantity, approved: line.approvedQuantity, pending: line.effectivePendingQuantity, remaining: line.remainingReturnableQuantity }} /></small>
      <label><MemberCopyText copyKey="member.returns.quantity" /><input type="number" name={line.returnLineRef} min={0} max={line.remainingReturnableQuantity} step={1} defaultValue={0} disabled={!line.remainingReturnableQuantity || busy} /></label></div>)}
      <ReturnReasonFields disabled={busy} />
      <section className={styles.photoPicker}><label className={`${styles.uploadControl}${busy ? ` ${styles.uploadDisabled}` : ""}`} htmlFor={photoInputId}><ReturnPhotoIcon /><span><strong><MemberCopyText copyKey="member.returns.uploadPhotos" /></strong><small>JPEG / PNG / WebP</small></span>
        <input id={photoInputId} className={styles.nativeFileInput} type="file" multiple accept={ORDER_PHOTO_ACCEPT} disabled={busy} aria-describedby={`${photoInputId}-help`} onChange={event => {
        const selected = [...photos, ...Array.from(event.target.files ?? [])]; event.target.value = "";
        if (selected.length > 3 || selected.some(photo => !validOrderPhotoSelection(photo))) { setError(copy("member.returns.photoError")); return; }
        setError(""); replacePhotos(selected);
      }} /></label><p id={`${photoInputId}-help`} className={styles.muted}><MemberCopyText copyKey="member.returns.photosHint" /></p>
        <div className={styles.photos}>{photos.map((photo, index) => <figure key={`${photo.name}-${index}`}><img src={photoUrls[index]} alt={copy("member.returns.photoAlt")} /><button type="button" disabled={busy} className={styles.secondary} onClick={() => replacePhotos(photos.filter((_, i) => i !== index))}><MemberCopyText copyKey="member.returns.removePhoto" /></button></figure>)}</div>
      </section>
      <div className={styles.conditions}><label><input type="checkbox" name="itemsComplete" required disabled={busy} /><MemberCopyText copyKey="member.returns.conditionComplete" /></label>
      <label><input type="checkbox" name="unopened" required disabled={busy} /><MemberCopyText copyKey="member.returns.conditionUnused" /></label>
      <label><input type="checkbox" name="quantityAcknowledged" required disabled={busy} /><MemberCopyText copyKey="member.returns.conditionQuantity" /></label></div>
      <button type="submit" disabled={busy} ref={previewButton}><MemberCopyText copyKey="member.returns.confirmTitle" /></button>
    </form> : null}
    <dialog ref={dialog} className={`${styles.panel} ${styles.dialog}`} aria-labelledby="return-confirm-title" onCancel={event => { event.preventDefault(); if (!busy) { setConfirmation(null); setError(""); } }}>
      {confirmation ? <><div className={styles.dialogBody}><h2 id="return-confirm-title"><MemberCopyText copyKey="member.returns.confirmTitle" /></h2>
        <p><MemberCopyText copyKey="member.returns.confirmBody" values={{ quantity: confirmation.preview.lines.reduce((sum, line) => sum + line.quantity, 0) }} /></p>
        {confirmation.preview.lines.map(line => <p key={line.returnLineRef}>{view.lines.find(item => item.returnLineRef === line.returnLineRef)?.name} × {line.quantity}</p>)}
        <ReturnCreditEvidence preview={confirmation.preview} warning />
        {error ? <p role="alert" className={styles.notice}>{error}</p> : null}
        </div>
        <div className={styles.actions}><button className={styles.secondary} type="button" autoFocus disabled={busy} onClick={() => { setConfirmation(null); setError(""); }}><MemberCopyText copyKey="member.returns.cancel" /></button><button type="button" disabled={busy} onClick={confirm}><MemberCopyText copyKey="member.returns.confirmSubmit" /></button></div>
      </> : null}
    </dialog>
    {!requests.length ? <p className={styles.empty}><MemberCopyText copyKey="member.returns.noRequests" /></p> : null}
    <ReturnRewardEvidence rewards={view.rewards} />
  </main>;
}
