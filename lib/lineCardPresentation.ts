import {getCanonicalPublicSiteOrigin} from './publicSiteOrigin';
import type {CardFamily,ResolvedNotificationCard} from './lineNotificationCards';
import type {LINE_CARD_CATALOG} from './lineNotificationCardCatalog';

/** Public, code-owned editorial artwork. No runtime URL or private attachment can enter this registry. */
export const LINE_CARD_HEADER_ASSETS = {
 ORDER:{file:'order.jpg',alt:'已確認的訂單單據與整齊備妥的咖啡包裝',meaning:'order confirmation',cues:['reviewed order slip','confirmation mark','coffee pouch']},
 FULFILLMENT:{file:'fulfillment.jpg',alt:'雙手正為咖啡訂單封箱，準備交寄',meaning:'packing and dispatch',cues:['shipping carton','packing tape','shipping label']},
 REMINDER:{file:'reminder.jpg',alt:'桌曆中以圈記標示的重要日期與規劃筆記',meaning:'upcoming deadline',cues:['calendar grid','marked date','planning notebook']},
 REWARD:{file:'reward.jpg',alt:'會員卡、回饋票券與感謝信封',meaning:'membership benefit',cues:['member card','vouchers','appreciation envelope']},
 RETURN:{file:'return.jpg',alt:'退回的咖啡包裹旁，審核單據與收據正被妥善整理',meaning:'return review and refund processing',cues:['review document','receipts','opened returned parcel']},
 CONVERSATION:{file:'conversation.jpg',alt:'工作室人員正在筆記本上準備客服回覆',meaning:'human customer support',cues:['response writing','laptop','open notebook']},
 ADMIN:{file:'admin.jpg',alt:'工作室人員正在整理待處理工作卡與訂單清單',meaning:'operational action required',cues:['active task card','task checklist','order cards']},
} as const;

export const LINE_CARD_FAMILY_ART = {
 ORDER:{...LINE_CARD_HEADER_ASSETS.ORDER,edition:'ORDER JOURNAL',accent:'#705038',wash:'#EEE5D8'},
 FULFILLMENT:{...LINE_CARD_HEADER_ASSETS.FULFILLMENT,edition:'ON ITS WAY',accent:'#756348',wash:'#EEE8DC'},
 REMINDER:{...LINE_CARD_HEADER_ASSETS.REMINDER,edition:'A QUIET REMINDER',accent:'#77745D',wash:'#ECEBDF'},
 REWARD:{...LINE_CARD_HEADER_ASSETS.REWARD,edition:'A LITTLE APPRECIATION',accent:'#84643E',wash:'#F1E9D9'},
 RETURN:{...LINE_CARD_HEADER_ASSETS.RETURN,edition:'HERE TO HELP',accent:'#5F705C',wash:'#E8ECE2'},
 CONVERSATION:{...LINE_CARD_HEADER_ASSETS.CONVERSATION,edition:'LET’S TALK COFFEE',accent:'#84715E',wash:'#EEE7DF'},
 ADMIN:{...LINE_CARD_HEADER_ASSETS.ADMIN,edition:'INSIDE THE STUDIO',accent:'#645F53',wash:'#E9E6DF'},
} as const satisfies Record<CardFamily,{file:string;alt:string;edition:string;accent:string;wash:string}>;

type CanonicalEventKey=typeof LINE_CARD_CATALOG[number]['eventKey'];
/** Future variants must first be added to the code-owned asset registry. Family defaults remain authoritative. */
export const LINE_CARD_EVENT_ART:Readonly<Partial<Record<CanonicalEventKey,keyof typeof LINE_CARD_HEADER_ASSETS>>> = {};

/** Shared presentation only: semantic fields, validation and fallback are untouched. */
export function composeLineCard(card:ResolvedNotificationCard){
 const family=LINE_CARD_FAMILY_ART[card.family];
 const variant=LINE_CARD_EVENT_ART[card.eventKey as CanonicalEventKey];
 const art=variant?LINE_CARD_HEADER_ASSETS[variant]:family;
 const imagePath='/images/line-cards/'+art.file;
 const creditExpiry=card.eventKey==='customer.reward.credit_expiring';
 const priorities=creditExpiry?['amount','creditAmount']:card.family==='RETURN'?['refundAmount','amount','orderNumber']:card.family==='REWARD'?['amount','rewardAmount','points','creditAmount','fulfillmentNumber']:card.family==='REMINDER'?['expiresAt','expiresOn','expiryDate','modificationDeadline','deliveryDate']:card.family==='FULFILLMENT'?['storeName','pickupDate','orderNumber']:['orderNumber','productName'];
 const primary=card.recipient==='admin'?undefined:priorities.map(key=>card.rows.find(row=>row.key===key)).find(Boolean);
 const adminReturn=card.eventKey==='admin.return.request_received';
 const highlight=primary?{label:primary.label,value:primary.value,key:primary.key}:{label:adminReturn?'目前進度':card.recipient==='admin'?'下一步':'為您安排',value:adminReturn?card.status.label:card.cta.label,key:null};
 const highlightSupporting=creditExpiry?card.rows.filter(row=>['expiresAt','expiresOn','expiryDate'].includes(row.key)):[];
 const details=card.rows.filter(row=>row.key!==primary?.key&&!highlightSupporting.some(item=>item.key===row.key));
 if(card.eventKey==='customer.return.refund_completed')details.sort((a,b)=>['refundMethod','completedAt','orderNumber'].indexOf(a.key)-['refundMethod','completedAt','orderNumber'].indexOf(b.key));
 const showHighlight=Boolean(primary)||card.recipient==='admin';
 const showStatus=!adminReturn&&!card.title.includes(card.status.label);
 return {family,art,imagePath,imageUrl:new URL(imagePath,getCanonicalPublicSiteOrigin()).href,highlight,highlightSupporting,showHighlight,showStatus,details};
}
