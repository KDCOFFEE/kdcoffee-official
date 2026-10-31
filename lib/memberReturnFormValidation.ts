type Line={returnLineRef:string;remainingReturnableQuantity:number};
export function validateReturnForm(lines:Line[],read:(name:string)=>unknown,options:{handoff?:boolean;bank?:boolean}={}){
 const errors:Record<string,string>={};let total=0;
 for(const line of lines){const raw=String(read(line.returnLineRef)??(line.remainingReturnableQuantity===0?"0":""));const q=Number(raw);if(!raw.trim()||!Number.isSafeInteger(q)||q<0||q>line.remainingReturnableQuantity)errors[line.returnLineRef]="validationQuantityRange";else total+=q;}
 if(total<=0&&!Object.keys(errors).length&&lines.length)errors[(lines.find(l=>l.remainingReturnableQuantity>0)??lines[0]).returnLineRef]="validationQuantity";
 if(!lines.length)errors.quantity="validationQuantity";
 if(options.handoff&&!String(read("refundHandoff")??"").trim())errors.refundHandoff="validationHandoff";
 if(options.bank&&read("refundHandoff")!=="in_person"){for(const [name,key]of [["refund_bank","validationBank"],["refund_holder","validationHolder"],["refund_account","validationAccount"]])if(!String(read(name)??"").trim())errors[name]=key;
 const account=String(read("refund_account")??"");if(account.trim()&&!/^\d{5,24}$/.test(account))errors.refund_account="validationAccountFormat";
 for(const name of ["refund_bank","refund_holder","refund_branch"])if(String(read(name)??"").length>100||/[\u0000-\u001f]/u.test(String(read(name)??"")))errors[name]="validationBankFormat";
 }
 const reason=String(read("reason")??"").trim();if(!reason||reason.length>200)errors.reason="validationReason";
 for(const name of ["itemsComplete","unopened","quantityAcknowledged"])if(read(name)!=="on")errors[name]="validationAcknowledgement";
 return {errors,total};
}
export function submittedReturnQuantity(lines:Array<{returnLineRef:string;quantity:number}>,preview?:Array<{returnLineRef:string;quantity:number}>){
 if(!lines.length||lines.some(l=>!Number.isSafeInteger(l.quantity)||l.quantity<=0)||new Set(lines.map(l=>l.returnLineRef)).size!==lines.length)throw Error("Invalid return quantities");
 if(preview&&(preview.length!==lines.length||lines.some(l=>!preview.some(p=>p.returnLineRef===l.returnLineRef&&p.quantity===l.quantity))))throw Error("Return preview quantities changed");
 return lines.reduce((sum,l)=>sum+l.quantity,0);
}
export function focusReturnFormError(form:HTMLFormElement,name:string){const preset=form.elements.namedItem("reasonPreset"),custom=form.elements.namedItem("reasonCustom");const reasonControl=custom instanceof HTMLElement&&preset&&"value"in preset&&preset.value==="其他"?"reasonCustom":"reasonPreset";const target=form.elements.namedItem(name==="reason"?reasonControl:name);if(target instanceof HTMLElement){target.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"center"});target.focus({preventScroll:true});}}
