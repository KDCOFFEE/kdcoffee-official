"use client";
import { useState } from "react";
import { refundMethodForHandoff, RETURN_HANDOFFS,type ReturnRefundSettings,type ReturnHandoff, type ReturnDestination } from "@/lib/returnRefundSettings";
import styles from "./ReturnWorkflow.module.css";
import RefundBankCombobox from "./RefundBankCombobox";
import { MemberCopyText, useMemberCopyKey } from "./MemberCenterCopyProvider";
export default function ReturnRefundFields({settings,method,disabled,errors={},onEdited}:{settings:ReturnRefundSettings;method:string;disabled:boolean;errors?:Record<string,string>;onEdited?:()=>void}){
 const copy=useMemberCopyKey();
 const [selected,setSelected]=useState<ReturnHandoff|"">("");const destination=selected?settings.destinations[selected]:null;const effectiveMethod=refundMethodForHandoff(method as "manual_cash"|"manual_bank_transfer"|"manual_review_required",selected);
 return <section><label><MemberCopyText copyKey="member.returns.handoff"/><select name="refundHandoff" aria-invalid={!!errors.refundHandoff} aria-describedby={errors.refundHandoff?"return-handoff-error":undefined} required disabled={disabled} value={selected} onChange={e=>setSelected(e.target.value as ReturnHandoff)}><option value="">—</option>{RETURN_HANDOFFS.filter(key=>settings.destinations[key].enabled).map(key=><option key={key} value={key}><MemberCopyText copyKey={"member.returns.handoff_"+key}/></option>)}</select>{errors.refundHandoff?<small id="return-handoff-error" className={styles.fieldError} role="alert">{errors.refundHandoff}</small>:null}</label>
 {destination&&selected?<ReturnDestinationCard method={selected} destination={destination}/>:null}{selected==="in_person"&&effectiveMethod==="manual_cash"?<p className={styles.notice}><MemberCopyText copyKey="member.returns.inPersonRefundNote"/></p>:null}
 {effectiveMethod==="manual_bank_transfer"?<fieldset className={styles.refundAccount+(["refund_bank","refund_holder","refund_account","refund_branch"].some(key=>errors[key])?" "+styles.invalidSection:"")}><legend><MemberCopyText copyKey="member.returns.refundAccount"/></legend><p><MemberCopyText copyKey="member.returns.refundAccountHelp"/></p>
 <RefundBankCombobox disabled={disabled} error={errors.refund_bank} label={copy("member.returns.refundField_bank")} placeholder={copy("member.returns.bankSearchPlaceholder")} onEdited={onEdited}/>
 <div className={styles.bankAccountGrid}>{["holder","account","branch"].map(key=><label key={key} className={key==="branch"?styles.bankBranch:undefined}><MemberCopyText copyKey={"member.returns.refundField_"+key}/><input placeholder={copy("member.returns.refundPlaceholder_"+key)} name={"refund_"+key} aria-invalid={!!errors["refund_"+key]} aria-describedby={errors["refund_"+key]?"return-"+key+"-error":undefined} required={key!=="branch"} disabled={disabled} maxLength={key==="account"?24:100} inputMode={key==="account"?"numeric":undefined} pattern={key==="account"?"[0-9]{5,24}":undefined} autoComplete="off"/>{errors["refund_"+key]?<small id={"return-"+key+"-error"} className={styles.fieldError} role="alert">{errors["refund_"+key]}</small>:null}</label>)}</div></fieldset>:null}</section>;
}

/** Presentation only: accepts configured live values or a saved request snapshot. */
export function ReturnDestinationCard({method,destination}:{method:ReturnHandoff;destination:ReturnDestination}){
 const storeName=destination.storeName.trim()&&!destination.storeName.includes("門市")?destination.storeName+"門市":destination.storeName;
 const rows=method==="seven_eleven"?[
  ["storeName",storeName],["storeNumber",destination.storeNumber],["storeAddress",destination.address]
 ]:method==="courier"?[
  ["recipient",destination.recipient],["deliveryAddress",destination.address],["phone",destination.phone]
 ]:[
  ["address",destination.address],["contact",destination.phone],["hours",destination.hours]
 ];
 return <section className={styles.returnDestination}>
  <h3><MemberCopyText copyKey={method==="seven_eleven"?"member.returns.destinationStoreTitle":"member.returns.handoff_"+method}/></h3>
  <dl className={styles.destinationRows}>{rows.filter(([,value])=>value.trim()).map(([key,value])=><div key={key}><dt><MemberCopyText copyKey={"member.returns.destination_"+key}/></dt><dd>{value}</dd></div>)}</dl>
  {method==="in_person"&&destination.mapUrl?.startsWith("https://")?<a href={destination.mapUrl} target="_blank" rel="noreferrer"><MemberCopyText copyKey="member.returns.workshopMap"/></a>:null}
  {destination.instructions.trim()?<div className={styles.destinationInstructions}><h4><MemberCopyText copyKey={method==="in_person"?"member.returns.destinationReturnNotes":"member.returns.destinationShippingNotes"}/></h4><p>{destination.instructions}</p></div>:null}
 </section>;
}
