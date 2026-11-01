import type {FulfillmentEmailEventType,LogisticsTrackingRecord} from './fulfillmentTypes';
export const INTERNAL_PUSH_CARD_KEYS=['admin.return.request_received','admin.order.inquiry_received','admin.order.atm_transfer_claim','admin.order.status_updated','admin.fulfillment.shipment_created','admin.fulfillment.shipped','admin.fulfillment.arrived','admin.fulfillment.picked_up'] as const;
export type InternalPushCardKey=typeof INTERNAL_PUSH_CARD_KEYS[number];
export type InternalCardContext={eventKey:InternalPushCardKey;data:Record<string,string|number>};
export function supportsInternalFlex(key:string):key is InternalPushCardKey{return (INTERNAL_PUSH_CARD_KEYS as readonly string[]).includes(key);}
export function internalOrderCardContext(eventKey:Extract<InternalPushCardKey,`admin.order.${string}`>,orderNumber:string,values:{amount?:number;status?:string;transferredAt?:string}={}):InternalCardContext{
 const data:Record<string,string|number>={orderNumber};
 if(eventKey==='admin.order.atm_transfer_claim'){if(values.amount!==undefined)data.amount=values.amount;if(values.transferredAt)data.transferredAt=values.transferredAt;}
 if(eventKey==='admin.order.status_updated'&&values.status)data.status=values.status;
 return {eventKey,data};
}
export function internalReturnCardContext(orderNumber:string,quantity:number,requestedAt:string):InternalCardContext{return {eventKey:'admin.return.request_received',data:{orderNumber,quantity,requestedAt}};}
export function logisticsCardContext(state:FulfillmentEmailEventType,record:LogisticsTrackingRecord,occurredAt:string):InternalCardContext{
 const keys={order_created:'admin.fulfillment.shipment_created',shipped:'admin.fulfillment.shipped',arrived_at_pickup_store:'admin.fulfillment.arrived',completed:'admin.fulfillment.picked_up'} as const;
 // Do not forward email recipient/contact, raw notes, shipment identifiers or item free text.
 const data:Record<string,string|number>={occurredAt};if(record.summary?.total!==undefined)data.total=record.summary.total;
 return {eventKey:keys[state],data};
}
