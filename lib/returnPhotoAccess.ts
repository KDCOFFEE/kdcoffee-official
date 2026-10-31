import "server-only";
import {readMembershipCommerceState} from "./membershipCommerce";
import {projectReturnSettlements} from "./returnSettlementLedger";
import {readOrder} from "./adminOrders";
/** Existing LINE notification images remain public. Return images are session-bound.
 * Read-only classification; never initializes state or exposes raw storage paths. */
export async function returnPhotoOrderNumbers(url:string):Promise<string[]|null> {
  const state=await readMembershipCommerceState(),orders=new Set<string>();
  for(const event of state.returnEvents??[])if(event.type==="RETURN_REQUESTED"&&event.confirmation?.supportingPhotos?.some(photo=>photo.url===url))orders.add(event.orderId);
  for(const effect of projectReturnSettlements(state))if(effect.effectType==="payment_refund"&&effect.status==="applied"&&effect.paymentResult?.proof.some(photo=>photo.url===url))orders.add(effect.orderId);
  return orders.size?[...orders]:null;
}
export async function memberOwnsReturnPhoto(orderNumbers:string[],memberId:string) {
  if(!orderNumbers.length)return false;
  for(const orderNumber of orderNumbers)if((await readOrder(orderNumber))?.member?.memberId!==memberId)return false;
  return true;
}
