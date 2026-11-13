import "server-only";
import { getAvailableCredit, readMembershipCommerceState } from "./membershipCommerce";
import { selectMemberCreditPassbook } from "./memberCreditPassbook";
import { readOrder } from "./adminOrders";
import { attachMemberCreditDetailProducts } from "./memberCreditEntryDetail";

export async function getMemberCreditPassbook(memberId: string, offset = 0, filePath?: string, cursor?: string) {
  const state = await readMembershipCommerceState(filePath);
  const cancelledNumbers = [...new Set(Object.values(state.creditReservations).filter(r => r.memberId === memberId && r.status === "released" && /^KD[0-9-]+$/.test(r.orderId)).map(r => r.orderId))];
  const cancellationOrders = new Map(await Promise.all(cancelledNumbers.map(async number => [number, await readOrder(number)] as const)));
  const completedCancellationOrders = new Set([...cancellationOrders].filter(([, order]) => order?.member?.memberId === memberId && order.status === "cancelled" && order.canonicalCancellation?.state === "completed").map(([number]) => number));
  const page = selectMemberCreditPassbook(state, memberId, offset, cursor, { completedCancellationOrders });
  const currentAvailableCredit = await getAvailableCredit(memberId, new Date(), filePath);
  const numbers = [...new Set(page.entries.flatMap((entry) => entry.detail?.orderNumber ? [entry.detail.orderNumber] : []))];
  const orders = new Map(await Promise.all(numbers.map(async (number) => [number, await readOrder(number)] as const)));
  return { ...page, currentAvailableCredit, entries: page.entries.map((entry) => entry.detail
    ? { ...entry, detail: attachMemberCreditDetailProducts(entry.detail, orders.get(entry.detail.orderNumber ?? "")) } : entry) };
}
