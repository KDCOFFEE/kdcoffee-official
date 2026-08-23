import { PRODUCT_SECTION_REGISTRY, type ProductSectionKey } from "./productPageSections";

export const PRODUCT_PAGE_CONTENT_MAX_BYTES = 50_000;
export const PRODUCT_PAGE_CONTENT_MAX_PROOFS = 6;
export const PRODUCT_PAGE_CONTENT_MAX_FAQS = 10;

const SECTION_KEYS = new Set<string>(PRODUCT_SECTION_REGISTRY.map((section) => section.key));
const CHILD_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

type CopySection = {
  eyebrow?: string;
  heading?: string;
  description?: string;
};

export type ProductPageContent = {
  "product-hero"?: {
    suitabilityHeading?: string;
    suitabilityItems?: Array<{ id: string; text: string }>;
    storyEyebrow?: string;
    galleryEyebrow?: string;
    galleryHeading?: string;
  };
  "select-your-coffee"?: CopySection;
  "flavor-notes"?: CopySection;
  "coffee-profile"?: CopySection & {
    roastedBeanHeading?: string;
    roastedBeanCta?: string;
  };
  "clean-roasting"?: CopySection & {
    proofs?: Array<{ id: string; title: string; body: string; icon?: "air" | "heat" | "cupping" }>;
  };
  campaigns?: CopySection;
  "related-products"?: Pick<CopySection, "eyebrow" | "description"> & { cardCtaLabel?: string };
  "before-you-order"?: CopySection & {
    editorialFaqs?: Array<{ id: string; question: string; answer: string }>;
  };
};

export class ProductPageContentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductPageContentValidationError";
  }
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, maximum: number, label: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new ProductPageContentValidationError(`${label}格式不正確。`);
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (Array.from(normalized).length > maximum) throw new ProductPageContentValidationError(`${label}不可超過 ${maximum} 個字。`);
  if (/[<>]/u.test(normalized)) throw new ProductPageContentValidationError(`${label}不可包含 HTML 標記。`);
  if (Array.from(normalized).some((character) => {
    const point = character.codePointAt(0) ?? 0;
    return (point <= 31 && ![9, 10, 13].includes(point)) || point === 127;
  })) throw new ProductPageContentValidationError(`${label}不可包含控制字元。`);
  return normalized;
}

function childId(value: unknown, label: string) {
  const normalized = text(value, 64, `${label} ID`);
  if (!normalized || !CHILD_ID_PATTERN.test(normalized)) {
    throw new ProductPageContentValidationError(`${label} ID 必須使用小寫英數字與連字號。`);
  }
  return normalized;
}

function uniqueIds(items: Array<{ id: string }>, label: string) {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new ProductPageContentValidationError(`${label}不可包含重複 ID「${item.id}」。`);
    ids.add(item.id);
  }
}

function copySection(value: unknown, label: string): CopySection | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new ProductPageContentValidationError(`${label}格式不正確。`);
  const result: CopySection = {
    eyebrow: text(value.eyebrow, 60, `${label}英文小標`),
    heading: text(value.heading, 120, `${label}標題`),
    description: text(value.description, 400, `${label}說明`),
  };
  return compact(result);
}

function compact<T extends UnknownRecord>(value: T): T | undefined {
  const result = Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
  return Object.keys(result).length ? result : undefined;
}

function normalizeHero(value: unknown): ProductPageContent["product-hero"] {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new ProductPageContentValidationError("Product Hero 文案格式不正確。");
  let suitabilityItems: Array<{ id: string; text: string }> | undefined;
  if (value.suitabilityItems !== undefined) {
    if (!Array.isArray(value.suitabilityItems) || value.suitabilityItems.length > 6) {
      throw new ProductPageContentValidationError("適合對象最多只能設定 6 筆。");
    }
    suitabilityItems = value.suitabilityItems.map((item, index) => {
      if (!isRecord(item)) throw new ProductPageContentValidationError(`適合對象 ${index + 1} 格式不正確。`);
      const id = childId(item.id, `適合對象 ${index + 1}`);
      const itemText = text(item.text, 240, `適合對象 ${index + 1}內容`);
      if (!itemText) throw new ProductPageContentValidationError(`適合對象 ${index + 1}不可為空白。`);
      return { id, text: itemText };
    });
    uniqueIds(suitabilityItems, "適合對象");
  }
  return compact({
    suitabilityHeading: text(value.suitabilityHeading, 120, "適合對象標題"),
    suitabilityItems,
    storyEyebrow: text(value.storyEyebrow, 60, "作品故事英文小標"),
    galleryEyebrow: text(value.galleryEyebrow, 60, "Gallery 英文小標"),
    galleryHeading: text(value.galleryHeading, 120, "Gallery 標題"),
  });
}

function normalizeCleanRoasting(value: unknown): ProductPageContent["clean-roasting"] {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new ProductPageContentValidationError("CLEAN ROASTING 文案格式不正確。");
  let proofs: NonNullable<ProductPageContent["clean-roasting"]>["proofs"];
  if (value.proofs !== undefined) {
    if (!Array.isArray(value.proofs) || value.proofs.length > PRODUCT_PAGE_CONTENT_MAX_PROOFS) {
      throw new ProductPageContentValidationError(`CLEAN ROASTING 重點最多只能設定 ${PRODUCT_PAGE_CONTENT_MAX_PROOFS} 筆。`);
    }
    proofs = value.proofs.map((item, index) => {
      if (!isRecord(item)) throw new ProductPageContentValidationError(`CLEAN ROASTING 重點 ${index + 1} 格式不正確。`);
      const id = childId(item.id, `CLEAN ROASTING 重點 ${index + 1}`);
      const title = text(item.title, 120, `CLEAN ROASTING 重點 ${index + 1}標題`);
      const body = text(item.body, 1200, `CLEAN ROASTING 重點 ${index + 1}說明`);
      if (!title || !body) throw new ProductPageContentValidationError(`CLEAN ROASTING 重點 ${index + 1}標題與說明不可空白。`);
      const icon = item.icon === undefined ? undefined : String(item.icon);
      if (icon !== undefined && !["air", "heat", "cupping"].includes(icon)) {
        throw new ProductPageContentValidationError(`CLEAN ROASTING 重點 ${index + 1}圖示不正確。`);
      }
      return { id, title, body, ...(icon ? { icon: icon as "air" | "heat" | "cupping" } : {}) };
    });
    uniqueIds(proofs, "CLEAN ROASTING 重點");
  }
  return compact({ ...copySection(value, "CLEAN ROASTING"), proofs });
}

function normalizeBeforeOrder(value: unknown): ProductPageContent["before-you-order"] {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new ProductPageContentValidationError("BEFORE YOU ORDER 文案格式不正確。");
  let editorialFaqs: NonNullable<ProductPageContent["before-you-order"]>["editorialFaqs"];
  if (value.editorialFaqs !== undefined) {
    if (!Array.isArray(value.editorialFaqs) || value.editorialFaqs.length > PRODUCT_PAGE_CONTENT_MAX_FAQS) {
      throw new ProductPageContentValidationError(`商品 FAQ 最多只能設定 ${PRODUCT_PAGE_CONTENT_MAX_FAQS} 筆。`);
    }
    editorialFaqs = value.editorialFaqs.map((item, index) => {
      if (!isRecord(item)) throw new ProductPageContentValidationError(`商品 FAQ ${index + 1} 格式不正確。`);
      const id = childId(item.id, `商品 FAQ ${index + 1}`);
      const question = text(item.question, 240, `商品 FAQ ${index + 1}問題`);
      const answer = text(item.answer, 1200, `商品 FAQ ${index + 1}回答`);
      if (!question || !answer) throw new ProductPageContentValidationError(`商品 FAQ ${index + 1}問題與回答不可空白。`);
      return { id, question, answer };
    });
    uniqueIds(editorialFaqs, "商品 FAQ");
  }
  return compact({ ...copySection(value, "BEFORE YOU ORDER"), editorialFaqs });
}

export function normalizeProductPageContent(value: unknown): ProductPageContent {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) throw new ProductPageContentValidationError("商品頁文案格式不正確。");
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > PRODUCT_PAGE_CONTENT_MAX_BYTES) {
    throw new ProductPageContentValidationError("商品頁文案資料過大。");
  }

  const result: ProductPageContent = {};
  for (const key of Object.keys(value)) {
    if (!SECTION_KEYS.has(key)) continue;
    const sectionKey = key as ProductSectionKey;
    const rawSection = value[sectionKey];
    if (sectionKey === "product-hero") result[sectionKey] = normalizeHero(rawSection);
    else if (sectionKey === "clean-roasting") result[sectionKey] = normalizeCleanRoasting(rawSection);
    else if (sectionKey === "before-you-order") result[sectionKey] = normalizeBeforeOrder(rawSection);
    else if (sectionKey === "select-your-coffee") {
      if (!isRecord(rawSection)) throw new ProductPageContentValidationError("SELECT YOUR COFFEE 文案格式不正確。");
      result[sectionKey] = compact({
        eyebrow: text(rawSection.eyebrow, 60, "SELECT YOUR COFFEE 英文小標"),
        description: text(rawSection.description, 400, "SELECT YOUR COFFEE 說明"),
      });
    } else if (sectionKey === "coffee-profile") {
      if (!isRecord(rawSection)) throw new ProductPageContentValidationError("COFFEE PROFILE 文案格式不正確。");
      result[sectionKey] = compact({
        ...copySection(rawSection, "COFFEE PROFILE"),
        roastedBeanHeading: text(rawSection.roastedBeanHeading, 120, "烘焙豆入口標題"),
        roastedBeanCta: text(rawSection.roastedBeanCta, 120, "烘焙豆入口文字"),
      });
    } else if (sectionKey === "related-products") {
      if (!isRecord(rawSection)) throw new ProductPageContentValidationError("RELATED PRODUCTS 文案格式不正確。");
      result[sectionKey] = compact({
        eyebrow: text(rawSection.eyebrow, 60, "RELATED PRODUCTS 英文小標"),
        description: text(rawSection.description, 400, "RELATED PRODUCTS 說明"),
        cardCtaLabel: text(rawSection.cardCtaLabel, 120, "RELATED PRODUCTS 卡片按鈕"),
      });
    } else {
      result[sectionKey] = copySection(rawSection, PRODUCT_SECTION_REGISTRY.find((section) => section.key === sectionKey)?.label || sectionKey);
    }
    if (!result[sectionKey]) delete result[sectionKey];
  }
  return result;
}
