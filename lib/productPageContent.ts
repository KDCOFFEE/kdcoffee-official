/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  normalizeProductPageContent,
  type ProductPageContent,
} from "./productPageContentValidation";

type ProductLike = Record<string, any>;

export const LEGACY_CLEAN_ROASTING_PROOFS = [
  { id: "fluid-bed", icon: "air" as const, title: "流床式熱風烘焙", body: "讓咖啡豆均勻翻動，呈現乾淨清楚的風味。" },
  { id: "thermal-imaging", icon: "heat" as const, title: "紅外線熱顯像", body: "精準控溫。" },
  { id: "cupping", icon: "cupping" as const, title: "杯測確認", body: "透過實際品飲確認香氣、甜感與整體平衡。" },
] as const;

export const LOCKED_PURCHASE_FAQS = [
  { id: "acidity", question: "這款會不會很酸？", answer: "精品咖啡的果酸更接近水果或果茶的明亮感，不是尖銳的酸敗味。仍不確定時，可在訂單備註平常喜歡的口感。" },
  { id: "grinding", question: "咖啡豆可以幫我磨粉嗎？", answer: "可以。請在訂單備註填寫手沖、咖啡機或其他沖煮方式，我們會在確認訂單時核對研磨需求。" },
  { id: "fulfillment", question: "付款與取貨怎麼進行？", answer: "可選擇 7-ELEVEN 取貨付款，或預約至 KD Coffee 工作室自取。送單後我們會確認庫存與取貨資料。" },
] as const;

function nonEmpty(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function storedContent(product: ProductLike): ProductPageContent {
  try {
    return normalizeProductPageContent(product.productPageContent);
  } catch {
    return {};
  }
}

export function resolveProductPageContent(product: ProductLike) {
  const content = storedContent(product);
  const hero = content["product-hero"] || {};
  const purchase = content["select-your-coffee"] || {};
  const flavor = content["flavor-notes"] || {};
  const profile = content["coffee-profile"] || {};
  const roasting = content["clean-roasting"] || {};
  const campaigns = content.campaigns || {};
  const related = content["related-products"] || {};
  const beforeOrder = content["before-you-order"] || {};
  const flavors = Array.isArray(product.flavors) ? product.flavors.filter((item: unknown) => typeof item === "string" && item.trim()) : [];
  const storyLead = nonEmpty(product.mood) || nonEmpty(product.shortCopy) || nonEmpty(product.subtitle) || "一杯乾淨、清楚，而且容易親近的精品咖啡。";
  const shortCopy = nonEmpty(product.shortCopy);
  const legacySuitable = nonEmpty(product.tag)?.includes("入門")
    ? "第一次喝精品咖啡的人"
    : flavors.length
      ? `喜歡${flavors.slice(0, 2).join("、")}風味的人`
      : "想探索不同風味的人";
  const hasManagedRoastingMedia = Boolean(product.cleanRoastingMedia && typeof product.cleanRoastingMedia === "object");

  return {
    raw: content,
    "product-hero": {
      title: nonEmpty(product.name) || "咖啡作品",
      englishTitle: nonEmpty(product.nameEn) || "",
      artist: nonEmpty(product.artist) || "KD COFFEE",
      lead: shortCopy || nonEmpty(product.subtitle) || "",
      tag: nonEmpty(product.tag) || "",
      suitabilityHeading: hero.suitabilityHeading || "適合這樣的你",
      suitabilityItems: hero.suitabilityItems?.length
        ? hero.suitabilityItems
        : [{ id: "product-fit", text: legacySuitable }, { id: "clean-cup", text: "想喝乾淨、清楚、不焦苦的咖啡" }],
      storyEyebrow: hero.storyEyebrow || "THE ARTWORK",
      storyLead,
      storySupportingCopy: shortCopy && shortCopy !== storyLead ? shortCopy : "",
      galleryEyebrow: hero.galleryEyebrow || "PRODUCT DETAILS",
      galleryHeading: hero.galleryHeading || "包裝與作品細節",
    },
    "select-your-coffee": {
      eyebrow: purchase.eyebrow || "SELECT YOUR COFFEE",
      heading: purchase.heading || "",
      description: purchase.description || "",
      trustItems: [
        { id: "clean-roast", title: "自製熱風烘焙", body: "風味乾淨，降低焦苦與雜味" },
        { id: "fresh-batch", title: "小量新鮮製作", body: "依實際供應安排烘焙與包裝" },
        { id: "pickup", title: "7-ELEVEN 取貨付款", body: "收到商品再付款，第一次購買更安心" },
      ],
    },
    "flavor-notes": {
      eyebrow: flavor.eyebrow || "FLAVOR NOTES",
      heading: flavor.heading || "風味筆記",
      description: flavor.description || "",
      flavors,
    },
    "coffee-profile": {
      eyebrow: profile.eyebrow || "COFFEE PROFILE",
      heading: profile.heading || "咖啡資料",
      description: profile.description || "",
      roastedBeanHeading: profile.roastedBeanHeading || "看見這支咖啡烘焙後的樣子",
      roastedBeanCta: profile.roastedBeanCta || "VIEW ROASTED BEANS",
    },
    "clean-roasting": {
      eyebrow: roasting.eyebrow || "CLEAN ROASTING",
      heading: roasting.heading || "乾淨的烘焙",
      description: roasting.description || (hasManagedRoastingMedia ? "" : LEGACY_CLEAN_ROASTING_PROOFS[0].body),
      proofs: roasting.proofs?.length ? roasting.proofs : LEGACY_CLEAN_ROASTING_PROOFS.map((proof) => ({ ...proof })),
    },
    campaigns: {
      eyebrow: campaigns.eyebrow || "LATEST ACTIVITY",
      heading: campaigns.heading || "最新活動",
      description: campaigns.description || "",
    },
    "related-products": {
      eyebrow: related.eyebrow || "YOU MAY ALSO LIKE",
      heading: nonEmpty(product.relatedProducts?.title) || "也可以比較這三款",
      description: related.description || "",
      cardCtaLabel: related.cardCtaLabel || "查看與購買 →",
    },
    "before-you-order": {
      eyebrow: beforeOrder.eyebrow || "BEFORE YOU ORDER",
      heading: beforeOrder.heading || (product.slug === "giotto-awakening" ? "第一次選咖啡，我們陪你慢慢選。" : "第一次購買也不用擔心"),
      description: beforeOrder.description || (product.slug === "giotto-awakening" ? "不用先懂產區、處理法或烘焙度，從你喜歡的味道開始就好。" : ""),
      editorialFaqs: beforeOrder.editorialFaqs || [],
      lockedFaqs: LOCKED_PURCHASE_FAQS.map((faq) => ({ ...faq })),
    },
  };
}

export type ResolvedProductPageContent = ReturnType<typeof resolveProductPageContent>;
