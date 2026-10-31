import type {NotificationEvent} from './membershipCommerce';
import type {StoredOrder} from './adminOrders';
export const CUSTOMER_PUSH_CARD_KEYS=['customer.subscription.next_cycle','customer.subscription.modification_cutoff','customer.subscription.order_created','customer.subscription.shipped','customer.subscription.ready_for_pickup','customer.subscription.stock_blocked','customer.subscription.paused','customer.subscription.resumed','customer.subscription.terminated','customer.subscription.skipped','customer.reward.gift_milestone','customer.reward.credit_expiring','customer.order.confirmed','customer.order.shipped','customer.order.shipment_created','customer.order.completed','customer.order.ready_for_pickup.studio','customer.order.ready_for_pickup.711','customer.return.received','customer.return.approved','customer.return.rejected','customer.return.refund_completed'] as const;
export type CustomerPushCardKey=typeof CUSTOMER_PUSH_CARD_KEYS[number];
export type CustomerCardContext={eventKey:CustomerPushCardKey;data:Record<string,string|number>};
export function supportsCustomerFlex(key:string):key is CustomerPushCardKey{return (CUSTOMER_PUSH_CARD_KEYS as readonly string[]).includes(key);}
export function orderCardContext(order:StoredOrder,eventType:string):CustomerCardContext|undefined{
 const keys:Record<string,CustomerPushCardKey>={order_confirmed:'customer.order.confirmed',order_shipped:'customer.order.shipped',shipment_created:'customer.order.shipment_created',order_completed:'customer.order.completed',studio_ready_for_pickup:'customer.order.ready_for_pickup.studio',seven_eleven_ready_for_pickup:'customer.order.ready_for_pickup.711'};
 const eventKey=keys[eventType];if(!eventKey)return;
 const data:Record<string,string|number>={orderNumber:order.orderNumber};
 if(eventType==='studio_ready_for_pickup'){if(order.studioPickup?.preferredDate)data.pickupDate=order.studioPickup.preferredDate;if(order.studioPickup?.preferredTime)data.pickupTime=order.studioPickup.preferredTime;}
 if(['order_shipped','shipment_created'].includes(eventType)&&order.trackingNumber)data.trackingNumber=order.trackingNumber;
 if(eventType==='order_shipped'&&order.store?.name)data.storeName=order.store.name;
 return {eventKey,data};
}
export function returnCardContext(eventType:string,orderNumber:string,refund?:{amount:number;method:string;confirmedAt:string}):CustomerCardContext|undefined{
 const keys:Record<string,CustomerPushCardKey>={return_request_received:'customer.return.received',return_request_approved:'customer.return.approved',return_request_rejected:'customer.return.rejected',return_refund_completed:'customer.return.refund_completed'};
 const eventKey=keys[eventType];if(!eventKey||eventType==='return_refund_completed'&&!refund)return;
 return {eventKey,data:{orderNumber,...(refund?{refundAmount:refund.amount,refundMethod:refund.method==='manual_cash'?'現金退款':'銀行轉帳',completedAt:refund.confirmedAt}:{})}};
}

/** Existing queue context only; IDs/private evidence never copied into card values. */
export function membershipCardContext(notice:NotificationEvent):CustomerCardContext|undefined{
 const keys:Partial<Record<NotificationEvent['eventType'],CustomerPushCardKey>>={modification_window:'customer.subscription.next_cycle',deadline_tomorrow:'customer.subscription.modification_cutoff',order_created:'customer.subscription.order_created',shipped:'customer.subscription.shipped',ready_for_pickup:'customer.subscription.ready_for_pickup',stock_blocked:'customer.subscription.stock_blocked',subscription_paused:'customer.subscription.paused',subscription_resumed:'customer.subscription.resumed',subscription_terminated:'customer.subscription.terminated',cycle_skipped:'customer.subscription.skipped',gift_eligible:'customer.reward.gift_milestone',credit_expiring:'customer.reward.credit_expiring'};
 const eventKey=keys[notice.eventType];if(!eventKey)return;
 const data:Record<string,string|number>={};
 if(notice.eventType==='modification_window'||notice.eventType==='deadline_tomorrow')for(const key of ['plannedDate','modificationDeadline'])if(typeof notice.safeData[key]==='string')data[key]=notice.safeData[key];
 if(notice.eventType==='gift_eligible'&&typeof notice.safeData.fulfillmentNumber==='number')data.fulfillmentNumber=notice.safeData.fulfillmentNumber;
 // credit_expiring is produced only from effectiveCreditRemaining(state, creditEntry), with finalUsableDate.
 if(notice.eventType==='credit_expiring'){if(typeof notice.safeData.amount==='number')data.amount=notice.safeData.amount;if(typeof notice.safeData.expiresOn==='string')data.expiresOn=notice.safeData.expiresOn;}
 return {eventKey,data};
}
