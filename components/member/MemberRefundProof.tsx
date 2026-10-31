"use client";
import type {ReturnWorkflowView} from "@/lib/returnWorkflow";
import AttachmentLightbox from "@/components/shared/AttachmentLightbox";
import {MemberCopyText as Copy,useMemberCopyKey} from "./MemberCenterCopyProvider";
import styles from "./ReturnWorkflow.module.css";
/** Only references from this completed refund DTO; no order-upload discovery or fallback. */
export default function MemberRefundProof({request,compact=false}:{request:ReturnWorkflowView["requests"][number];compact?:boolean}){
 const copy=useMemberCopyKey(),refund=request.paymentRefund;
 if(refund.status!=="completed"||!refund.proof.length)return null;
 return <section className={compact?styles.refundProofReference:styles.refundProof} aria-label={copy(compact?"member.returns.refundProofView":"member.returns.refundProofTitle")}>
  {compact?<span><Copy copyKey="member.returns.refundProofView"/></span>:<h4><Copy copyKey="member.returns.refundProofTitle"/></h4>}
  <div className={styles.refundProofThumbnails}>{refund.proof.map((photo,index)=><AttachmentLightbox key={photo.url} src={photo.url} imageClassName={compact?styles.refundProofSmall:styles.refundProofThumbnail} alt={copy("member.returns.refundProofAlt",{number:index+1})} width={compact?48:80} height={compact?36:64} loading="lazy"/>)}</div>
  {!compact?<p><Copy copyKey="member.returns.refundProofHint"/></p>:null}
 </section>;
}
