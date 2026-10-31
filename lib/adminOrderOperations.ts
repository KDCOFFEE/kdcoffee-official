/** Read-only Admin queue projections. Stored order/conversation state is never changed. */
import type {StoredOrder} from './adminOrders';
import {orderStatusLabel} from './orderInventoryPolicy';
import {assessOrderInquiryState,getOrderMessages} from './orderConversation';

export type AdminOrderQueueRow = {
 orderNumber:string;customer:string;createdAt:string;delivery:string;statusLabel:string;
 status:string;total:number;actionable:boolean;pendingInquiry:boolean;
};
export type AdminInquiryQueueRow = AdminOrderQueueRow & {
 unresolved:number;message:string;customerMessageAt:string;lastReplyAt?:string;waitingSince:string;historyAt:string;
};
export function isActionableOrder(order:{status:string}){return order.status!=='completed'&&order.status!=='cancelled';}
export function projectAdminOrderQueue(orders:readonly StoredOrder[]):AdminOrderQueueRow[]{
 return orders.map(order=>({orderNumber:order.orderNumber,customer:order.customer?.name||'未填姓名',createdAt:order.createdAt,
 delivery:order.orderMode==='711_cod'?(order.store?.name||'7-ELEVEN 取貨付款'):order.orderMode==='home_delivery'?'宅配':order.orderMode==='studio_pickup'?'KD Coffee 工作室自取':'配送方式待確認',
 status:order.status,statusLabel:orderStatusLabel(order.status),total:Number(order.total??order.subtotal??0),actionable:isActionableOrder(order),pendingInquiry:assessOrderInquiryState(order).pending}));
}
export function projectAdminInquiryQueue(orders:readonly StoredOrder[]):AdminInquiryQueueRow[]{
 const rows=projectAdminOrderQueue(orders);
 return orders.flatMap((order,index)=>{
  const inquiry=assessOrderInquiryState(order),latest=inquiry.latestCustomerMessage;if(!latest)return [];
  // Existing assessment defines the resolution boundary. The final N customers in
  // chronological/position order are exactly its unresolved messages.
  const customers=getOrderMessages(order).map((message,index)=>({message,index})).filter(entry=>entry.message.authorType==='customer').sort((a,b)=>{
   const left=Date.parse(a.message.createdAt),right=Date.parse(b.message.createdAt);
   return Number.isFinite(left)&&Number.isFinite(right)&&left!==right?left-right:a.index-b.index;
  });
  const oldest=inquiry.pending?customers[customers.length-inquiry.unresolvedCustomerMessages]?.message:undefined;
  const resolvedAt=typeof order.orderConversationState?.resolvedAt==='string'?order.orderConversationState.resolvedAt:undefined;
  const historyAt=[resolvedAt,inquiry.latestAdminMessage?.createdAt,latest.createdAt].filter((value):value is string=>!!value).sort((a,b)=>Date.parse(b)-Date.parse(a))[0];
  return [{...rows[index],actionable:inquiry.pending,unresolved:inquiry.unresolvedCustomerMessages,message:latest.message.slice(0,120),customerMessageAt:latest.createdAt,lastReplyAt:inquiry.latestAdminMessage?.createdAt,waitingSince:oldest?.createdAt??latest.createdAt,historyAt}];
 });
}
