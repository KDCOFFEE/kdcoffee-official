import {
  PRODUCT_CUSTOM_FEATURE_ID_PATTERN,
  PRODUCT_CUSTOM_FEATURE_ICONS,
  PRODUCT_CUSTOM_FEATURE_LAYOUTS,
  PRODUCT_CUSTOM_FEATURE_MAX_ITEMS,
  PRODUCT_CUSTOM_SECTION_ID_PATTERN,
  PRODUCT_CUSTOM_SECTION_MAX_BYTES,
  PRODUCT_CUSTOM_SECTION_MAX_COUNT,
  PRODUCT_CUSTOM_TEXT_LAYOUTS,
  type ProductCustomFeatureIcon,
  type ProductCustomFeatureItem,
  type ProductCustomSection,
} from "./productCustomSections";
import { normalizeProductSectionAnimation, type ProductSectionAnimationConfig } from "./productPageAnimations";
import { isProductSectionPlacement } from "./productPageSections";

type UnknownRecord = Record<string, unknown>;

export class ProductCustomSectionsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductCustomSectionsValidationError";
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeText(value: unknown, maximum: number, label: string, required = false) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ProductCustomSectionsValidationError(`${label}不可空白。`);
    return undefined;
  }
  if (typeof value !== "string") throw new ProductCustomSectionsValidationError(`${label}格式不正確。`);
  const normalized = value.trim();
  if (!normalized) {
    if (required) throw new ProductCustomSectionsValidationError(`${label}不可空白。`);
    return undefined;
  }
  if (Array.from(normalized).length > maximum) throw new ProductCustomSectionsValidationError(`${label}不可超過 ${maximum} 個字。`);
  if (/[<>]/u.test(normalized)) throw new ProductCustomSectionsValidationError(`${label}不可包含 HTML 標記。`);
  if (Array.from(normalized).some((character) => {
    const point = character.codePointAt(0) ?? 0;
    return (point <= 31 && ![9, 10, 13].includes(point)) || point === 127;
  })) throw new ProductCustomSectionsValidationError(`${label}不可包含控制字元。`);
  return normalized;
}

function stableId(value: unknown, pattern: RegExp, label: string) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new ProductCustomSectionsValidationError(`${label}格式不正確。`);
  }
  return value;
}

function normalizedAnimation(value: unknown): ProductSectionAnimationConfig | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new ProductCustomSectionsValidationError("自訂 Section 動畫格式不正確。");
  const animation = normalizeProductSectionAnimation(value);
  return {
    enabled: animation.enabled,
    trigger: animation.trigger,
    effect: animation.effect,
    durationMs: animation.durationMs,
    delayMs: animation.delayMs,
    threshold: animation.threshold,
    once: animation.once,
  };
}

function normalizedBase(value: UnknownRecord, index: number) {
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
    throw new ProductCustomSectionsValidationError(`自訂 Section ${index + 1}顯示狀態格式不正確。`);
  }
  if (!isProductSectionPlacement(value.placement)) {
    throw new ProductCustomSectionsValidationError(`自訂 Section ${index + 1}版位不正確。`);
  }
  if (typeof value.order !== "number" || !Number.isInteger(value.order) || value.order < 0 || value.order > 1000) {
    throw new ProductCustomSectionsValidationError(`自訂 Section ${index + 1}排序必須是 0–1000 的整數。`);
  }
  return {
    id: stableId(value.id, PRODUCT_CUSTOM_SECTION_ID_PATTERN, `自訂 Section ${index + 1} ID`),
    adminName: safeText(value.adminName, 80, `自訂 Section ${index + 1}後台名稱`, true) as string,
    enabled: value.enabled !== false,
    placement: value.placement,
    order: value.order,
    ...(value.animation === undefined ? {} : { animation: normalizedAnimation(value.animation) }),
  };
}

function normalizedFeatures(value: UnknownRecord, sectionIndex: number): ProductCustomFeatureItem[] {
  if (!Array.isArray(value.items) || value.items.length > PRODUCT_CUSTOM_FEATURE_MAX_ITEMS) {
    throw new ProductCustomSectionsValidationError(`特色重點最多只能設定 ${PRODUCT_CUSTOM_FEATURE_MAX_ITEMS} 筆。`);
  }
  const items = value.items.map((rawItem, itemIndex) => {
    if (!isRecord(rawItem)) throw new ProductCustomSectionsValidationError(`特色重點 ${itemIndex + 1}格式不正確。`);
    const icon = rawItem.icon === undefined ? undefined : String(rawItem.icon);
    if (icon !== undefined && !PRODUCT_CUSTOM_FEATURE_ICONS.includes(icon as ProductCustomFeatureIcon)) {
      throw new ProductCustomSectionsValidationError(`特色重點 ${itemIndex + 1}圖示不正確。`);
    }
    return {
      id: stableId(rawItem.id, PRODUCT_CUSTOM_FEATURE_ID_PATTERN, `特色重點 ${itemIndex + 1} ID`),
      title: safeText(rawItem.title, 120, `特色重點 ${itemIndex + 1}標題`, true) as string,
      body: safeText(rawItem.body, 1200, `特色重點 ${itemIndex + 1}內容`, true) as string,
      ...(icon ? { icon: icon as ProductCustomFeatureIcon } : {}),
    };
  });
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new ProductCustomSectionsValidationError(`自訂 Section ${sectionIndex + 1}不可包含重複的特色重點 ID。`);
  }
  return items;
}

export function normalizeProductCustomSections(value: unknown): ProductCustomSection[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ProductCustomSectionsValidationError("自訂 Section 資料格式不正確。");
  if (value.length > PRODUCT_CUSTOM_SECTION_MAX_COUNT) {
    throw new ProductCustomSectionsValidationError(`每個商品最多只能設定 ${PRODUCT_CUSTOM_SECTION_MAX_COUNT} 個自訂 Section。`);
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > PRODUCT_CUSTOM_SECTION_MAX_BYTES) {
    throw new ProductCustomSectionsValidationError("自訂 Section 資料過大。");
  }

  const sections = value.map((rawSection, index): ProductCustomSection => {
    if (!isRecord(rawSection)) throw new ProductCustomSectionsValidationError(`自訂 Section ${index + 1}格式不正確。`);
    const base = normalizedBase(rawSection, index);
    if (!isRecord(rawSection.content)) throw new ProductCustomSectionsValidationError(`自訂 Section ${index + 1}文案格式不正確。`);

    if (rawSection.type === "text") {
      if (!PRODUCT_CUSTOM_TEXT_LAYOUTS.includes(rawSection.layout as (typeof PRODUCT_CUSTOM_TEXT_LAYOUTS)[number])) {
        throw new ProductCustomSectionsValidationError(`純文案 Section ${index + 1}版型不正確。`);
      }
      const content = {
        eyebrow: safeText(rawSection.content.eyebrow, 60, `純文案 Section ${index + 1}英文小標`),
        heading: safeText(rawSection.content.heading, 120, `純文案 Section ${index + 1}標題`),
        body: safeText(rawSection.content.body, 2000, `純文案 Section ${index + 1}內容`),
      };
      if (base.enabled && !content.eyebrow && !content.heading && !content.body) {
        throw new ProductCustomSectionsValidationError(`純文案 Section ${index + 1}啟用時不可完全空白。`);
      }
      return {
        ...base,
        type: "text",
        layout: rawSection.layout as (typeof PRODUCT_CUSTOM_TEXT_LAYOUTS)[number],
        content: Object.fromEntries(Object.entries(content).filter(([, item]) => item !== undefined)),
      };
    }

    if (rawSection.type === "features") {
      if (!PRODUCT_CUSTOM_FEATURE_LAYOUTS.includes(rawSection.layout as (typeof PRODUCT_CUSTOM_FEATURE_LAYOUTS)[number])) {
        throw new ProductCustomSectionsValidationError(`特色重點 Section ${index + 1}版型不正確。`);
      }
      const items = normalizedFeatures(rawSection.content, index);
      if (base.enabled && !items.length) throw new ProductCustomSectionsValidationError(`特色重點 Section ${index + 1}啟用時至少需要一筆重點。`);
      const copy = {
        eyebrow: safeText(rawSection.content.eyebrow, 60, `特色重點 Section ${index + 1}英文小標`),
        heading: safeText(rawSection.content.heading, 120, `特色重點 Section ${index + 1}標題`),
        description: safeText(rawSection.content.description, 400, `特色重點 Section ${index + 1}說明`),
      };
      return {
        ...base,
        type: "features",
        layout: rawSection.layout as (typeof PRODUCT_CUSTOM_FEATURE_LAYOUTS)[number],
        content: { ...Object.fromEntries(Object.entries(copy).filter(([, item]) => item !== undefined)), items },
      };
    }

    throw new ProductCustomSectionsValidationError(`自訂 Section ${index + 1}類型不正確。`);
  });

  if (new Set(sections.map((section) => section.id)).size !== sections.length) {
    throw new ProductCustomSectionsValidationError("自訂 Section 不可包含重複 ID。");
  }
  return sections;
}

export function resolveProductCustomSections(value: unknown) {
  try {
    return normalizeProductCustomSections(value);
  } catch {
    return [];
  }
}
