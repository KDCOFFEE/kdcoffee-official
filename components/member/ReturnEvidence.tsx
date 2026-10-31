"use client";
import MemberPaymentRefundPreview from "./MemberPaymentRefundPreview";
import MemberReturnTimeline, {MemberReturnPaymentStatus} from "./MemberReturnTimeline";
import AttachmentLightbox from "@/components/shared/AttachmentLightbox";

import type { ReturnWorkflowView, safeCreditPreview } from "@/lib/returnWorkflow";
import { returnTaipeiDate, returnStatusCopyKey, returnCreditExpiryDate } from "@/lib/returnPresentation";
import { MemberCopyText as Copy, useMemberCopyKey, useMemberPointDisplayName } from "./MemberCenterCopyProvider";
import styles from "./ReturnWorkflow.module.css";

export function ReturnCreditEvidence({ preview, warning = false, historical = false }: { preview: ReturnType<typeof safeCreditPreview>; warning?: boolean; historical?: boolean }) {
  const copy = useMemberCopyKey();
  const creditName = copy("member.rewards.storeCredit.title");
  const credit = (value: number) => `${value < 0 ? "−" : ""}${Math.abs(value).toLocaleString("zh-TW")} ${creditName}`;
  return <section className={styles.credit}><h3><Copy copyKey={historical ? "member.returns.creditHistoricalTitle" : "member.returns.creditTitle"} /></h3>
    <dl className={styles.amounts}><dt><Copy copyKey="member.returns.creditTotal" /></dt><dd>{credit(preview.returnCreditAmount)}</dd>
      <dt><Copy copyKey={historical ? "member.returns.creditHistoricalRestorable" : "member.returns.creditRestorable"} /></dt><dd>{credit(preview.restorableCreditAmount)}</dd>
      <dt><Copy copyKey={historical ? "member.returns.creditHistoricalExpired" : "member.returns.creditExpired"} /></dt><dd>{credit(preview.expiredCreditAmount)}</dd></dl>
    {warning && preview.hasExpiredReturnCredit ? <div className={styles.notice} role="note"><strong><Copy copyKey="member.returns.expiredTitle" /></strong><p><Copy copyKey="member.returns.expiredBody" /></p></div> : null}
    {warning && (preview.expiryWarning?.amount ?? 0) > 0 ? <div className={styles.notice} role="note"><strong><Copy copyKey="member.returns.nearExpiryTitle" /></strong><p><Copy copyKey="member.returns.nearExpiryBody" /></p><p><Copy copyKey="member.returns.nearExpiryAmount" values={{amount:credit(preview.expiryWarning!.amount)}} /></p></div> : null}
    <details className={styles.details}><summary><Copy copyKey="member.returns.creditDetails" /></summary>
      {preview.expiryWarning?.entries.map((entry,index)=><p key={"near-"+index}><Copy copyKey="member.returns.nearExpiryDate" values={{amount:credit(entry.amount),date:returnCreditExpiryDate(entry.expiresAt)}} /></p>)}
      <p><Copy copyKey="member.returns.creditPolicy" /></p>
      {preview.entries.map((entry, index) => <div className={styles.detailRow} key={index}><Copy copyKey="member.returns.creditEntry" values={{ amount: credit(entry.amount), expiryDate: returnCreditExpiryDate(entry.expiresAt) }} />
        <small><Copy copyKey={entry.classification === "restorable" ? "member.returns.creditValid" : "member.returns.creditInvalid"} /></small>
        {warning && entry.classification === "expired_not_restorable" ? <p><Copy copyKey="member.returns.returnExpiredCreditConfirmationNotice" values={{ amount: credit(entry.amount), expiryDate: returnCreditExpiryDate(entry.expiresAt) }} /></p> : null}
      </div>)}<small><Copy copyKey="member.returns.previewTime" values={{ date: returnTaipeiDate(preview.generatedAt, true) }} /></small>
    </details><p className={styles.muted}><Copy copyKey={historical ? "member.returns.creditHistoricalDescription" : "member.returns.settlementNotice"} /></p>
  </section>;
}
export function ReturnCreditSettlement({ result, preview }: { result: NonNullable<ReturnWorkflowView["requests"][number]["creditSettlement"]>; preview: ReturnType<typeof safeCreditPreview> | null }) {
  const copy = useMemberCopyKey();
  const credit = (amount: number) => amount.toLocaleString("zh-TW") + " " + copy("member.rewards.storeCredit.title");
  if (result.status !== "applied") return <p className={styles.muted} role="status"><Copy copyKey={result.status === "manual_review_required" ? "member.returns.creditSettlementReview" : "member.returns.creditSettlementPending"} /></p>;
  const restoredEntries = result.entries.filter(entry => entry.restoredAmount > 0);
  const expiredEntries = result.entries.filter(entry => entry.expiredAmount > 0);
  return <>
    <section className={styles.settlement}>
      <h3><Copy copyKey="member.returns.creditSettlementTitle" /></h3>
      <dl className={styles.resultAmounts}>
        <dt><Copy copyKey="member.returns.creditActualRestored" /></dt><dd className={styles.restoredAmount}>{credit(result.restoredAmount ?? 0)}</dd>
        <dt><Copy copyKey="member.returns.creditFinalExpired" /></dt><dd>{credit(result.expiredAmount ?? 0)}</dd>
      </dl>
      <details className={styles.explanation}>
        <summary><span aria-hidden="true">ⓘ</span> <Copy copyKey="member.returns.creditExplanationToggle" /></summary>
        <div className={styles.explanationBody}>
          <h4><Copy copyKey="member.returns.creditExplanationTitle" /></h4>
          {restoredEntries.length ? <div className={styles.sourceGroup}>
            <h4><Copy copyKey="member.returns.creditSourceRestored" /></h4>
            <ul>{restoredEntries.map((entry, index) => <li key={index}><Copy copyKey="member.returns.creditResultEntry" values={{ amount: credit(entry.restoredAmount), expiryDate: returnCreditExpiryDate(entry.expiresAt) }} /></li>)}</ul>
          </div> : null}
          {expiredEntries.length ? <div className={styles.sourceGroup}>
            <h4><Copy copyKey="member.returns.creditSourceNotRestored" /></h4>
            <ul>{expiredEntries.map((entry, index) => <li key={index}><Copy copyKey="member.returns.creditResultEntry" values={{ amount: credit(entry.expiredAmount), expiryDate: returnCreditExpiryDate(entry.expiresAt) }} /></li>)}</ul>
            <p><Copy copyKey="member.returns.creditFinalExpiredReason" /></p>
          </div> : null}
          <p><Copy copyKey="member.returns.creditSettlementDescription" /></p>
          <small><Copy copyKey="member.returns.creditSettlementTime" values={{ date: returnTaipeiDate(result.settledAt, true) }} /></small>
        </div>
      </details>
    </section>
    {preview ? <details className={styles.historicalEstimate}>
      <summary><Copy copyKey="member.returns.creditHistoricalToggle" /></summary>
      <ReturnCreditEvidence preview={preview} historical />
    </details> : null}
  </>;
}
export function ReturnRewardEvidence({ rewards }: { rewards: ReturnWorkflowView["rewards"] }) {
  const copy = useMemberCopyKey(), pointName = useMemberPointDisplayName("");
  const number = (value: number) => value.toLocaleString("zh-TW", { maximumFractionDigits: 6 });
  const creditName = copy("member.rewards.storeCredit.title");
  const entitlement = (value: number | null, unit: "points" | "credit") => value === null ? copy("member.returns.pointUnknown") : `${value < 0 ? "−" : ""}${number(Math.abs(value))} ${unit === "points" ? pointName : creditName}`;
  if (!rewards.length) return null;
  return <section id="return-rewards" className={styles.rewardSection}><h2><Copy copyKey="member.returns.rewardTitle" /></h2>{rewards.map((reward, index) => <article className={styles.rewardCard} key={index}>
    <div className={styles.cardHeading}><h3><Copy copyKey={reward.programCopyKey} /></h3>{reward.blocked ? <span className={styles.dot} aria-hidden="true" /> : null}</div>
    <p className={styles.muted}><Copy copyKey="member.returns.rewardSource" values={{ orderNumber: reward.sourceOrderId }} /></p>
    <dl className={styles.amounts}><dt><Copy copyKey="member.returns.rewardOriginal" /></dt><dd>{entitlement(reward.display.original, reward.display.unit)}</dd>
      <dt><Copy copyKey="member.returns.rewardEffective" /></dt><dd>{entitlement(reward.display.effective, reward.display.unit)}</dd>
      <dt><Copy copyKey="member.returns.rewardDelta" /></dt><dd>{entitlement(reward.display.delta, reward.display.unit)}</dd></dl>
    {reward.display.unit === "points" ? <details className={styles.details}><summary><Copy copyKey="member.returns.rewardConversionDetails" /></summary>
      {reward.display.originalBasis !== null && reward.display.rewardRate !== null ? <p><Copy copyKey="member.returns.rewardPointBasis" values={{ basis: number(reward.display.originalBasis), rate: number(reward.display.rewardRate), pointName }} /></p> : null}
      {reward.display.conversionValue !== null ? <p><Copy copyKey="member.returns.rewardConversion" values={{ pointName, value: number(reward.display.conversionValue) }} /></p> : null}
      <p><Copy copyKey="member.returns.rewardCreditEquivalent" values={{ original: number(reward.display.originalCredit), effective: number(reward.display.effectiveCredit) }} /></p>
    </details> : <p className={styles.muted}><Copy copyKey="member.returns.rewardMoneyBasisNotice" /></p>}
    <p><Copy copyKey={reward.reasonCopyKey} /></p>{reward.adjustedAt ? <small className={styles.muted}><Copy copyKey="member.returns.rewardTime" values={{ date: returnTaipeiDate(reward.adjustedAt, true) }} /></small> : null}
  </article>)}</section>;
}
export function ReturnRequestEvidence({ request, view, admin = false }: { request: ReturnWorkflowView["requests"][number]; view: ReturnWorkflowView; admin?: boolean }) {
  const copy = useMemberCopyKey();
  const zeroCredit=(request.creditPreview?.returnCreditAmount??request.creditSettlement?.selectedAmount)===0;
  const creditContent=request.creditSettlement?.status==="applied"?<ReturnCreditSettlement result={request.creditSettlement} preview={request.creditPreview}/>:<>{request.creditPreview?<ReturnCreditEvidence preview={request.creditPreview} warning/>:<p><Copy copyKey="member.returns.noCreditSnapshot"/></p>}{request.creditSettlement?<ReturnCreditSettlement result={request.creditSettlement} preview={null}/>:null}</>;
  const notice = { pending: "pendingNotice", processing: "processingNotice", approved: "approvedNotice", rejected: "rejectedNotice", withdrawn: "withdrawnNotice" }[request.status];
  return <><div className={styles.cardHeading}><h3><Copy copyKey={admin ? "member.returns.adminRequestTitle" : "member.returns.requestTitle"} /></h3><span className={`${styles.badge} ${styles[request.status] ?? ""}`}><Copy copyKey={returnStatusCopyKey(request.status)} /></span></div>
    <p><Copy copyKey={`member.returns.${notice}`} /></p>
    {!admin?(["pending","processing"].includes(request.status)?<MemberPaymentRefundPreview preview={request.paymentRefund.preview}/>:<MemberReturnPaymentStatus request={request}/>):null}
    {request.status === "approved" && request.rejectedLines?.length ? <p><Copy copyKey="member.returns.partialApproval" values={{ approved: request.approvedLines?.reduce((sum,line) => sum + line.quantity, 0) ?? 0, rejected: request.rejectedLines.reduce((sum,line) => sum + line.quantity, 0) }} /></p> : null}
    <div className={styles.itemList}>{request.lines.map(line => <div className={styles.item} key={line.returnLineRef}><span><strong>{view.lines.find(item => item.returnLineRef === line.returnLineRef)?.name}</strong><small>{view.lines.find(item => item.returnLineRef === line.returnLineRef)?.option}</small></span><b>× {line.quantity}</b></div>)}</div>
    <p><Copy copyKey="member.returns.reasonLabel" />：{request.reason}</p>
    {request.photos?.length ? <section><h3><Copy copyKey="member.returns.submittedPhotos" /></h3><div className={styles.photos}>{request.photos.map(photo => <AttachmentLightbox key={photo.url} src={photo.url} alt={copy("member.returns.photoAlt")} width={128} height={108} loading="lazy"/>)}</div></section> : null}
    {admin?creditContent:zeroCredit?<details className={styles.creditCompact}><summary><Copy copyKey="member.returns.creditSecondaryTitle"/><span><Copy copyKey="member.returns.creditNoneRequired"/></span></summary>{creditContent}</details>:<section className={styles.memberCreditSecondary}>{creditContent}</section>}
    {!admin?<MemberReturnTimeline request={request} view={view}/>:<details className={styles.details}><summary><Copy copyKey="member.returns.timelineDetails" /></summary><p><Copy copyKey="member.returns.acknowledged" /></p>
      {request.confirmedAt ? <small><Copy copyKey="member.returns.confirmedTime" values={{ date: returnTaipeiDate(request.confirmedAt, true) }} /></small> : null}
      <ol className={styles.timeline}>{request.timeline.map((entry, index) => <li key={index}><strong><Copy copyKey={returnStatusCopyKey(entry.type)} /></strong><time>{returnTaipeiDate(entry.occurredAt, true)}</time>{entry.type !== "RETURN_WITHDRAWN" ? <p>{entry.reason}</p> : null}</li>)}</ol>
    </details>}
  </>;
}
