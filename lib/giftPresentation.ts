import type { Metadata } from "next";
import type { StoreCatalog } from "./storeTypes";
import { selectPublicStoreIndex, findPublicStoreProductBySlug } from "./storePublicSelectors";
import type { PublicStoreProductCard } from "./storePublicSelectors";

export const GIFT_CATEGORIES = [
  { slug: "drip-gift", selectorLabel: "耳掛咖啡", name: "耳掛咖啡禮盒", description: "簡單、方便，也最容易分享。", suitable: "初次送禮、拜訪、節慶、辦公室分享。", action: "看耳掛禮盒", english: "DRIP COFFEE" },
  { slug: "bean-gift", selectorLabel: "咖啡豆", name: "咖啡豆禮盒", description: "留給真正喜歡自己沖一杯咖啡的人。", suitable: "手沖愛好者、咖啡玩家、熟悉咖啡的朋友。", action: "看咖啡豆禮盒", english: "COFFEE BEANS" },
  { slug: "coffee-gear-gift", selectorLabel: "咖啡 × 手沖", name: "咖啡 × 手沖禮盒", groupName: "咖啡綜合與器具禮盒", description: "不只是一包咖啡，而是一套完整的品飲體驗。", suitable: "新手入門、喜歡儀式感、重要送禮。", action: "看綜合與器具禮盒", english: "COFFEE & BREWING" },
  { slug: "custom-gift", selectorLabel: "客製禮盒", name: "客製化禮盒", description: "依預算、數量與場合，重新組成專屬心意。", suitable: "企業送禮、活動、節慶、大量訂購。", action: "詢問客製禮盒", english: "MADE FOR YOU" },
] as const;

// Editorial labels only. SKU identity never changes Store pricing or eligibility.
const POSITIONING: Readonly<Record<string, string>> = {
  "GIFT-DRIP10-2": "輕巧送禮", "GIFT-DRIP10-5": "風味探索", "GIFT-DRIP20-4": "人氣推薦",
  "GIFT-DRIP20-5": "多風味體驗", "GIFT-DRIP24-4": "典藏送禮", "GIFT-BEAN2": "經典雙入",
  "GIFT-BEAN2-PREMIUM": "精品精選", "GIFT-BEAN1-DRIP10-2": "豆與耳掛",
  "GIFT-BEAN1-DRIP10-5": "探索組合", "GIFT-BEAN-BREW": "手沖入門",
};
export type GiftCard = { product: PublicStoreProductCard; label?: string; summary: string; pvValue: number };
export type GiftCatalog = ReturnType<typeof selectPublicGiftCatalog>;

export function selectPublicGiftCatalog(catalog: StoreCatalog, pointDisplayName = "") {
  // The canonical Store graph owns publication, parent/category and ordering.
  const first = selectPublicStoreIndex(catalog, { sectionSlug: "gift" });
  const cards = [...first.products.items];
  for (let page = 2; page <= first.products.totalPages; page++) {
    cards.push(...selectPublicStoreIndex(catalog, { sectionSlug: "gift", page }).products.items);
  }
  const sourceBySlug = new Map(catalog.products.map(product => [product.slug, product]));
  const gifts: GiftCard[] = cards.filter(card => sourceBySlug.get(card.slug)?.productType === "gift").map(product => {
    const source = sourceBySlug.get(product.slug)!;
    const detail = findPublicStoreProductBySlug(catalog, product.slug)!;
    const plannedContents = detail.description.split("內容規劃：")[1]?.trim().split(/\r?\n\s*\r?\n/u)[0];
    const summary = detail.specifications.length
      ? detail.specifications.slice(0, 3).map(item => item.value).join(" · ")
      : (plannedContents?.split(/\r?\n/u).slice(0, 3).join(" · ") || "");
    return { product, label: POSITIONING[source.sku], summary, pvValue: source.pvValue };
  });
  const custom = gifts.find(gift => sourceBySlug.get(gift.product.slug)?.sku === "GIFT-CUSTOM");
  const hero = custom?.product.heroMedia?.type === "image" ? custom.product.heroMedia
    : gifts.find(gift => gift.product.category?.slug === "coffee-gear-gift" && gift.product.heroMedia?.type === "image")?.product.heroMedia
      ?? gifts.find(gift => gift.product.heroMedia?.type === "image")?.product.heroMedia;
  return {
    groups: GIFT_CATEGORIES.map(category => ({ ...category, gifts: gifts.filter(gift => gift.product.category?.slug === category.slug) })),
    total: gifts.filter(gift => gift.product.category?.slug !== "custom-gift").length,
    pointDisplayName,
    hero,
    custom: custom?.product,
  };
}

export function giftPageMetadata(indexable: boolean): Metadata {
  const title = "送禮專區｜精品咖啡禮盒｜KD Coffee";
  const description = "探索 KD Coffee 精品咖啡禮盒，從耳掛咖啡、咖啡豆到手沖組合與客製送禮，為日常問候、節慶與重要時刻挑選一份剛剛好的咖啡禮。";
  return {
    title: { absolute: title }, description,
    alternates: { canonical: "/gifts" }, robots: { index: indexable, follow: true },
    openGraph: { title, description, url: "/gifts", siteName: "KD Coffee", locale: "zh_TW", type: "website" },
    twitter: { card: "summary", title, description },
  };
}
