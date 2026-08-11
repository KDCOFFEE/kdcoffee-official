import { getLiveWebsiteData } from "@/data/websiteData";
import { priceOrderFromWebsiteData, type RequestedItem } from "@/lib/orderPricing";

export async function priceOrder(items: RequestedItem[]) {
  const live = await getLiveWebsiteData();
  return priceOrderFromWebsiteData(live, items).priced;
}

export function makeOrderNumber() {
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const y = tw.getUTCFullYear();
  const m = String(tw.getUTCMonth() + 1).padStart(2, "0");
  const d = String(tw.getUTCDate()).padStart(2, "0");
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `KD${y}${m}${d}-${suffix}`;
}
