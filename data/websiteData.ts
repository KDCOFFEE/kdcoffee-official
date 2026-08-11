import websiteDataJson from "@/public/data/website-data.json";
import { promises as fs } from "fs";
import path from "path";

export type PurchaseOption = { id?: string; label: string; detail: string; price: number; stock?: number; enabled?: boolean; kind?: "beans"|"drip" };
export type CoffeeArtwork = {
  active?: boolean; slug: string; name: string; artist: string; subtitle: string; shortCopy?: string; mood: string;
  origin: string; process: string; roast: string; variety?: string; altitude?: string; flavors: string[]; tag?: string;
  featured?: boolean; cover?: string; poster?: string; visualTone: string; purchase: PurchaseOption[]; skus?: PurchaseOption[];
  assets?: Record<string, {path?:string; alt?:string; title?:string; caption?:string; fileName?:string}>;
  pageLayout?: {heroAsset?:string; productAsset?:string; listAsset?:string; galleryAssets?:string[]; showGallery?:boolean; showRelatedWorks?:boolean};
  displayFields?: Record<string, boolean>; status?: "active"|"sold_out"|"coming_soon"|"discontinued"|"hidden"; inMonthlyMenu?: boolean; showOnHomepage?: boolean; showWhenSoldOut?: boolean; purchasable?: boolean; stock?: number; sort?: number;
};
export type MonthlyCampaign = {
  enabled?: boolean; eyebrow: string; title: string; description: string; details: string[];
  ctaLabel: string; ctaHref: string; secondaryLabel: string; secondaryHref: string; note: string; image?: string;
};
export type WebsiteData = {
  version: number; updatedAt: string;
  campaign: MonthlyCampaign;
  menu: { monthLabel: string; title: string; intro: string; products: CoffeeArtwork[] };
};
const raw = websiteDataJson as WebsiteData;
export const websiteData = raw;
export const monthlyCampaign = raw.campaign;
export const monthlyMenu = { ...raw.menu, products: raw.menu.products.filter((p) => p.active !== false) };

export async function getLiveWebsiteData(): Promise<WebsiteData> {
  const filePath = path.join(process.cwd(), "public", "data", "website-data.json");
  return JSON.parse(await fs.readFile(filePath, "utf8")) as WebsiteData;
}
