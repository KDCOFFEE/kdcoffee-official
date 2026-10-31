export const RETURN_HANDOFFS = ["seven_eleven", "courier", "in_person"] as const;
export type ReturnHandoff = typeof RETURN_HANDOFFS[number];
export type ReturnDestination = { enabled: boolean; storeNumber: string; storeName: string; address: string; recipient: string; phone: string; hours: string; instructions: string; mapUrl?:string };
export type ReturnRefundSettings = { destinations: Record<ReturnHandoff, ReturnDestination>; lineEnabled: boolean; proofEnabled: boolean };
const empty = (): ReturnDestination => ({ enabled: false, storeNumber: "", storeName: "", address: "", recipient: "", phone: "", hours: "", instructions: "" });
export const DEFAULT_RETURN_REFUND_SETTINGS: ReturnRefundSettings = { destinations: {seven_eleven:empty(),courier:empty(),in_person:{...empty(),mapUrl:"https://maps.app.goo.gl/LnWPuqmR2BfDW3UM8"}},lineEnabled:false,proofEnabled:true };
export function validateReturnRefundSettings(value: ReturnRefundSettings) {
 if (!value || typeof value.lineEnabled !== "boolean" || typeof value.proofEnabled !== "boolean") throw Error("退貨退款設定格式不正確");
 for (const key of RETURN_HANDOFFS) { const d=value.destinations?.[key]; if (!d || typeof d.enabled!=="boolean") throw Error("退貨方式設定不正確");
 for(const field of ["storeNumber","storeName","address","recipient","phone","hours","instructions"] as const) if(typeof d[field]!=="string"||d[field].length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(d[field]))throw Error("退貨資訊格式不正確");
 if(d.mapUrl!==undefined){if(typeof d.mapUrl!=="string"||d.mapUrl.length>2000)throw Error("地圖連結格式不正確");if(d.mapUrl){let url:URL;try{url=new URL(d.mapUrl);}catch{throw Error("地圖連結格式不正確");}if(url.protocol!=="https:")throw Error("地圖連結須使用 HTTPS");}}
 if(d.enabled && (!d.address.trim() || (key==="seven_eleven" && (!/^\d{6}$/.test(d.storeNumber)||!d.storeName.trim())) || (key==="courier" && (!d.recipient.trim()||!d.phone.trim()))))throw Error("請完成啟用方式的退貨地址與聯絡資料");
 }
}
export type RefundBank = { bank: string; holder: string; account: string; branch: string };
export type ReturnRefundRequest = { method: "manual_cash"|"manual_bank_transfer"|"manual_review_required"; routingPolicyVersion?:2; originalPayment: string; originalOrderMode?: string; rulesVersion: number; handoff: ReturnHandoff; destination: ReturnDestination; bank: RefundBank|null };
export function validateRefundBank(value: unknown): RefundBank {
 const v=value as RefundBank; if(!v||typeof v!=="object")throw Error("請填寫退款帳戶");
 for(const key of ["bank","holder","branch"] as const)if(typeof v[key]!=="string"||v[key].length>100||/[\u0000-\u001f]/u.test(v[key]))throw Error("退款帳戶格式不正確");
 if(!v.bank.trim()||!v.holder.trim()||typeof v.account!=="string"||!/^\d{5,24}$/.test(v.account))throw Error("退款帳戶格式不正確");
 return {bank:v.bank.trim(),holder:v.holder.trim(),branch:v.branch.trim(),account:v.account};
}
export function safeRefundRequest(value?:ReturnRefundRequest) {return value ? {...value, bank:value.bank?{bank:value.bank.bank,holder:value.bank.holder,branch:value.bank.branch,account:"********"+value.bank.account.slice(-4)}:null}:null;}

export function refundMethodForHandoff<T extends "manual_cash"|"manual_bank_transfer"|"manual_review_required">(original:T,handoff?:string):T|"manual_cash"{return original==="manual_review_required"?original:handoff==="in_person"?"manual_cash":original;}
export function resolvedReturnRefundSettings(value?:ReturnRefundSettings){if(!value)return undefined;const resolved=structuredClone(value);resolved.destinations.in_person.mapUrl??=DEFAULT_RETURN_REFUND_SETTINGS.destinations.in_person.mapUrl;return resolved;}
