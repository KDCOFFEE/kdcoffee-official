import "server-only";
import { readMembershipCommerceState } from "./membershipCommerce";
import { selectMemberCreditPassbook } from "./memberCreditPassbook";
import { readOrder } from "./adminOrders";
import { attachMemberCreditDetailProducts } from "./memberCreditEntryDetail";

export async function getMemberCreditPassbook(memberId: string, offset = 0, filePath?: string, cursor?: string) {
  const page = selectMemberCreditPassbook(await readMembershipCommerceState(filePath), memberId, offset, cursor);
  const numbers = [...new Set(page.entries.flatMap((entry) => entry.detail?.orderNumber ? [entry.detail.orderNumber] : []))];
  const orders = new Map(await Promise.all(numbers.map(async (number) => [number, await readOrder(number)] as const)));
  return { ...page, entries: page.entries.map((entry) => entry.detail
    ? { ...entry, detail: attachMemberCreditDetailProducts(entry.detail, orders.get(entry.detail.orderNumber ?? "")) } : entry) };
}
