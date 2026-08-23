import websiteDataJson from "@/public/data/website-data.json";
import { promises as fs } from "fs";
import { getWebsiteDataFile } from "@/lib/storagePaths";
import type { MediaAsset } from "@/lib/media";
import type { MonthlyMenuBackground } from "@/lib/monthlyMenuBackground";
import type { ProductSectionPlacement } from "@/lib/productPageSections";
import type { ProductPageAnimations } from "@/lib/productPageAnimations";
import type { CleanRoastingMediaConfig } from "@/lib/cleanRoastingMedia";
import type { ProductPageContent } from "@/lib/productPageContentValidation";

/**
 * 商品購買規格
 * 例如：半磅豆、耳掛等。
 */
export type PurchaseOption = {
  id?: string;
  label: string;
  detail: string;
  price: number;
  stock?: number;
  enabled?: boolean;
  kind?: "beans" | "drip";
};

/**
 * 咖啡作品 / 商品資料結構
 *
 * 這裡只定義資料格式，
 * 不負責修改商品、SKU、價格或庫存邏輯。
 */
export type CoffeeArtwork = {
  active?: boolean;
  slug: string;
  name: string;
  nameEn?: string;
  artist: string;
  subtitle: string;
  shortCopy?: string;
  mood: string;

  origin: string;
  process: string;
  roast: string;
  variety?: string;
  altitude?: string;

  flavors: string[];
  tag?: string;

  featured?: boolean;
  cover?: string;
  poster?: string;
  visualTone: string;

  purchase: PurchaseOption[];
  skus?: PurchaseOption[];

  assets?: Record<
    string,
    {
      path?: string;
      media?: MediaAsset;
      alt?: string;
      title?: string;
      caption?: string;
      fileName?: string;
    } | undefined
  >;

  /** Optional product-media feature; absent products remain disabled. */
  showRoastedBeanPhoto?: boolean;

  pageLayout?: {
    heroAsset?: string;
    productAsset?: string;
    listAsset?: string;
    galleryAssets?: string[];
    showGallery?: boolean;
    showRelatedWorks?: boolean;
  };

  relatedProducts?: {
    enabled?: boolean;
    title?: string;
    productIds: string[];
    placement?: ProductSectionPlacement;
    order?: number;
  };

  campaignDisplay?: {
    enabled?: boolean;
    campaignIds: string[];
    placement?: ProductSectionPlacement;
    order?: number;
  };

  productPageAnimations?: ProductPageAnimations;
  cleanRoastingMedia?: CleanRoastingMediaConfig;
  productPageContent?: ProductPageContent;

  displayFields?: Record<string, boolean>;

  status?:
    | "active"
    | "sold_out"
    | "coming_soon"
    | "discontinued"
    | "hidden";

  inMonthlyMenu?: boolean;
  showOnHomepage?: boolean;
  showWhenSoldOut?: boolean;
  purchasable?: boolean;

  stock?: number;
  sort?: number;
};

/**
 * 每月活動 / 首頁活動資料
 */
export type MonthlyCampaign = {
  enabled?: boolean;
  eyebrow: string;
  title: string;
  description: string;
  details: string[];

  ctaLabel: string;
  ctaHref: string;

  secondaryLabel: string;
  secondaryHref: string;

  note: string;
  image?: string;
};

/**
 * website-data.json 的完整資料格式
 */
export type WebsiteData = {
  version: number;
  updatedAt: string;

  campaign: MonthlyCampaign;

  menu: {
    monthKey?: string;
    monthLabel: string;
    title: string;
    intro: string;
    products: CoffeeArtwork[];
    background?: Partial<MonthlyMenuBackground>;
  };
};

/**
 * 這份靜態 import 保留原本網站既有行為。
 *
 * Windows 本機開發時，
 * 仍然會從專案內的：
 *
 * public/data/website-data.json
 *
 * 取得原始網站資料。
 *
 * 這裡目前不改動，避免影響既有網站 rendering 邏輯。
 */
const raw = websiteDataJson as WebsiteData;

export const websiteData = raw;

export const monthlyCampaign = raw.campaign;

export const monthlyMenu = {
  ...raw.menu,

  // 原本既有邏輯：
  // active === false 的產品不顯示在 monthlyMenu。
  products: raw.menu.products.filter((p) => p.active !== false),
};

/**
 * 取得「目前實際使用中的」website-data.json。
 *
 * 【本機 Windows】
 * 如果沒有設定 KD_DATA_DIR：
 *
 * getWebsiteDataFile()
 * 會回到原本專案內：
 *
 * public/data/website-data.json
 *
 *
 * 【Railway Production】
 * 未來設定：
 *
 * KD_DATA_DIR=/data
 *
 * 之後 getWebsiteDataFile()
 * 就會改成讀取 Persistent Volume 裡的資料。
 *
 *
 * 這樣商品資料、庫存異動、後台商品修改，
 * 才不會因 Railway Redeploy 而重新回到 repository 舊資料。
 */
export async function getLiveWebsiteData(): Promise<WebsiteData> {
  const filePath = getWebsiteDataFile();

  return JSON.parse(
    await fs.readFile(filePath, "utf8"),
  ) as WebsiteData;
}
