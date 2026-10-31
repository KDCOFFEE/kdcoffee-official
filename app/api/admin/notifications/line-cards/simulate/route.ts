import {createMembershipNotificationTemplate} from '@/lib/memberNotificationAutomation';
import type {NotificationEvent} from '@/lib/membershipCommerce';
import {createCustomerNotificationTemplate} from '@/lib/customerNotifications';
import type {StoredOrder} from '@/lib/adminOrders';
import {readAdminSession} from '@/lib/adminAuth';
import {supportsCustomerFlex} from '@/lib/customerLineCardEvents';
import {prepareCustomerLinePresentation} from '@/lib/customerLinePresentation';
import {LINE_CARD_CATALOG} from '@/lib/lineNotificationCardCatalog';
/** Synthetic data only. This route never imports a transport or reads recipients/tokens/orders. */
export async function GET(request:Request){
 const session=await readAdminSession();if(!session)return Response.json({error:'請先登入。'},{status:401});if(session.role!=='owner'||session.legacy)return Response.json({error:'Owner only'},{status:403});
 const key=new URL(request.url).searchParams.get('eventKey')??'';if(!supportsCustomerFlex(key))return Response.json({error:'此事件目前維持文字訊息。'},{status:400});
 const def=LINE_CARD_CATALOG.find(item=>item.eventKey===key)!;
 const types:Record<string,string>={'customer.order.confirmed':'order_confirmed','customer.order.shipped':'order_shipped','customer.order.shipment_created':'shipment_created','customer.order.completed':'order_completed','customer.order.ready_for_pickup.studio':'studio_ready_for_pickup','customer.order.ready_for_pickup.711':'seven_eleven_ready_for_pickup'};
 const sampleOrder:StoredOrder={createdAt:'2026-10-31T00:00:00.000Z',orderNumber:'KD20261031-1234',status:key==='customer.order.confirmed'?'confirmed':key==='customer.order.completed'?'completed':key==='customer.order.shipment_created'?'shipment_created':key==='customer.order.shipped'?'shipped':'ready_for_pickup',orderMode:key.endsWith('.studio')?'studio_pickup':'711_cod',trackingNumber:'TEST123456789',store:{name:'7-ELEVEN 範例門市'},studioPickup:{preferredDate:'2026-11-03',preferredTime:'14:00–16:00'}};
 const noticeTypes:Record<string,NotificationEvent['eventType']>={'customer.subscription.next_cycle':'modification_window','customer.subscription.modification_cutoff':'deadline_tomorrow','customer.subscription.order_created':'order_created','customer.subscription.shipped':'shipped','customer.subscription.ready_for_pickup':'ready_for_pickup','customer.subscription.stock_blocked':'stock_blocked','customer.subscription.paused':'subscription_paused','customer.subscription.resumed':'subscription_resumed','customer.subscription.terminated':'subscription_terminated','customer.subscription.skipped':'cycle_skipped','customer.reward.gift_milestone':'gift_eligible','customer.reward.credit_expiring':'credit_expiring','customer.return.received':'return_request_received','customer.return.approved':'return_request_approved','customer.return.rejected':'return_request_rejected','customer.return.refund_completed':'return_refund_completed'};
 const sampleNotice:NotificationEvent={notificationId:'synthetic-preview',channels:[],status:'pending',sourceEvent:'synthetic-preview',createdAt:'2026-10-31T00:00:00.000Z',eventType:noticeTypes[key],safeData:{...def.previewSample,orderNumber:'KD20261031-1234',...(key==='customer.return.refund_completed'?{amount:500,method:'manual_bank_transfer'}:{})}};
 const originalText=types[key]?createCustomerNotificationTemplate(sampleOrder).text:(await createMembershipNotificationTemplate(sampleNotice)).text;
 const result=await prepareCustomerLinePresentation(originalText,{eventKey:key,data:{...def.previewSample}});
 return Response.json({...result,eventKey:key,originalText},{headers:{'Cache-Control':'no-store'}});
}
