"use client";
import MemberRefundProof from "./MemberRefundProof";
import type {ReturnWorkflowView} from "@/lib/returnWorkflow";
import {returnTaipeiDate,returnStatusCopyKey} from "@/lib/returnPresentation";
import {MemberCopyText as Copy} from "./MemberCenterCopyProvider";
import {ReturnDestinationCard} from "./ReturnRefundFields";
import styles from "./ReturnWorkflow.module.css";
type RequestView=ReturnWorkflowView["requests"][number];
const money=(amount:number)=>"NT$"+amount.toLocaleString("zh-TW");
const validTime=(value:string|null|undefined)=>!!value&&Number.isFinite(Date.parse(value));
function RefundFacts({request,completed,primary=false}:{request:RequestView;completed:boolean;primary?:boolean}){
 const refund=request.paymentRefund,saved=request.refundRequest,amount=completed?refund.amount:refund.quote.status==="resolved"?refund.quote.amount:null;
 return <dl className={styles.historyFacts}>
  <dt><Copy copyKey={primary?"member.returns.paymentThisRefund":completed?"member.returns.historyRefundAmount":"member.returns.historyExpectedRefund"}/></dt><dd className={primary?styles.memberRefundAmount:undefined}>{amount===null?<Copy copyKey="member.returns.refundReview"/>:money(amount)}</dd>
  {saved?<><dt><Copy copyKey="member.returns.paymentMethod"/></dt><dd><Copy copyKey={saved.method==="manual_cash"?"member.returns.paymentCash":saved.method==="manual_bank_transfer"?"member.returns.refundBank":"member.returns.refundReview"}/></dd></>:null}
  {primary?<><dt><Copy copyKey="member.returns.paymentProgress"/></dt><dd><Copy copyKey={completed?"member.returns.historyRefundCompleted":"member.returns.paymentAwaitingStudio"}/></dd>{completed&&validTime(refund.confirmedAt)?<><dt><Copy copyKey="member.returns.paymentCompletedTime"/></dt><dd>{returnTaipeiDate(refund.confirmedAt,true)}</dd></>:null}{refund.quote.status==="resolved"?<>{refund.quote.retainedHomeShipping>0?<><dt><Copy copyKey="member.returns.paymentShipping"/>（<Copy copyKey="member.returns.paymentNotRefunded"/>）</dt><dd>-{money(refund.quote.retainedHomeShipping)}</dd></>:null}{refund.quote.retainedCodFee>0?<><dt><Copy copyKey="member.returns.paymentCod"/>（<Copy copyKey="member.returns.paymentNotRefunded"/>）</dt><dd>-{money(refund.quote.retainedCodFee)}</dd></>:null}</>:null}</>:null}
  {saved?.method==="manual_bank_transfer"&&saved.bank?<><dt><Copy copyKey="member.returns.refundField_bank"/></dt><dd>{saved.bank.bank}</dd><dt><Copy copyKey="member.returns.refundField_account"/></dt><dd>{"********"+saved.bank.account.slice(-4)}</dd></>:null}
 </dl>;
}
export function MemberReturnPaymentStatus({request}:{request:RequestView}){
 const completed=request.paymentRefund.status==="completed",pending=request.paymentRefund.status==="pending";
 if(!completed&&!pending)return null;
 return <section className={styles.memberRefundStatus}><h3>{completed?<span aria-hidden="true">✓ </span>:null}<Copy copyKey={completed?"member.returns.historyRefundCompleted":"member.returns.refundPending"}/></h3><RefundFacts request={request} completed={completed} primary/>{completed?<MemberRefundProof request={request}/>:null}</section>;
}
/** Presentation of persisted return events and the persisted payment result; no synthetic dates. */
export default function MemberReturnTimeline({request,view}:{request:RequestView;view:ReturnWorkflowView}){
 const completed=request.paymentRefund.status==="completed",pending=request.paymentRefund.status==="pending";
 const keys:Record<string,string>={RETURN_REQUESTED:"historySubmitted",RETURN_PROCESSING_LOCKED:"historyReview",RETURN_APPROVED:"historyApproved",RETURN_REJECTED:"historyRejected",RETURN_WITHDRAWN:"historyWithdrawn"};
 const entries:Array<{type:RequestView["timeline"][number]["type"]|"refund_completed";occurredAt:string;reason:string;index:number}>=request.timeline.filter(event=>keys[event.type]).map((event,index)=>({...event,index}));
 if(completed)entries.push({type:"refund_completed",occurredAt:request.paymentRefund.confirmedAt??"",reason:"",index:entries.length});
 entries.sort((a,b)=>validTime(a.occurredAt)&&validTime(b.occurredAt)?Date.parse(a.occurredAt)-Date.parse(b.occurredAt)||a.index-b.index:a.index-b.index);
 const summary=<><Copy copyKey={request.status==="approved"?"member.returns.historyApproved":returnStatusCopyKey(request.status)}/>{completed||pending?<> · <Copy copyKey={completed?"member.returns.historyRefundCompleted":"member.returns.refundPending"}/></>:null}</>;
 return <details className={styles.details}><summary className={styles.historySummary}><Copy copyKey="member.returns.timelineDetails"/><span>{summary}</span></summary>
  <ol className={styles.timeline}>{entries.map((event,index)=><li key={index}>
   <h4><Copy copyKey={"member.returns."+(event.type==="refund_completed"?"historyRefundCompleted":keys[event.type])}/></h4>
   {validTime(event.occurredAt)?<time dateTime={event.occurredAt}>{returnTaipeiDate(event.occurredAt,true)}</time>:null}
   {event.type==="RETURN_REQUESTED"?<><ul className={styles.historyItems}>{request.lines.map(line=><li key={line.returnLineRef}>{view.lines.find(item=>item.returnLineRef===line.returnLineRef)?.name} × {line.quantity}</li>)}</ul>{request.refundRequest?<><p><Copy copyKey="member.returns.handoff"/>：<Copy copyKey={"member.returns.handoff_"+request.refundRequest.handoff}/></p><details className={styles.historyDestination}><summary><Copy copyKey="member.returns.historyDestination"/></summary><ReturnDestinationCard method={request.refundRequest.handoff} destination={request.refundRequest.destination}/></details></>:null}</>:null}
   {event.type==="RETURN_PROCESSING_LOCKED"?<p><Copy copyKey="member.returns.historyReviewBody"/></p>:null}
   {event.type==="RETURN_APPROVED"?<p><Copy copyKey="member.returns.historyApprovedQuantity" values={{quantity:(request.approvedLines??request.lines).reduce((sum,line)=>sum+line.quantity,0)}}/></p>:null}
   {event.type==="refund_completed"?<><RefundFacts request={request} completed/><MemberRefundProof request={request} compact/>{request.paymentRefund.notification?<aside className={styles.historyNotification}><strong><Copy copyKey="member.returns.historyNotification"/></strong><p><Copy copyKey={"member.returns."+({sent:"historyLineSent",failed:"historyLineFailed",disabled:"historyLineDisabled"}[request.paymentRefund.notification])}/></p></aside>:null}</>:null}
  </li>)}{pending?<li><h4><Copy copyKey="member.returns.refundPending"/></h4><RefundFacts request={request} completed={false}/></li>:null}</ol>
 </details>;
}
