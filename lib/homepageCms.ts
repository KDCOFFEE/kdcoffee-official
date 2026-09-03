import type { MediaAsset } from "./media.ts";
import type { CmsLinkValue } from "./cmsLinks.ts";
// @ts-expect-error -- explicit extension keeps Node's type-stripping regression runner compatible.
import { isMediaAsset } from "./media.ts";
import type { VisualColorValue } from "./pageBuilderVisualStyle.ts";
// @ts-expect-error -- explicit extension keeps Node's type-stripping regression runner compatible.
import { resolveVisualColor } from "./pageBuilderVisualStyle.ts";
// @ts-expect-error -- explicit extension keeps Node's type-stripping regression runner compatible.
import { validateCmsLinkValue } from "./cmsLinks.ts";

export const HOMEPAGE_COLLECTION_LIMIT = 50;
export const HOMEPAGE_PRODUCT_LIMIT = 12;
export const HERO_TIMING_MAX_MS = 10_000;

export const HOMEPAGE_HERO_OVERLAY_PRESETS = ["current", "soft", "strong", "none"] as const;
export const HOMEPAGE_CARD_PRESENTATION_PRESETS = ["current", "minimal", "bordered"] as const;
export const HOMEPAGE_NAVIGATION_LIMIT = 8;

export const HOMEPAGE_SECTION_KEYS = ["home002", "home003", "home004", "home005", "home006", "home007", "home008", "home009", "home010"] as const;
export type HomepageSectionKey = (typeof HOMEPAGE_SECTION_KEYS)[number];
export type HomepageSectionOrderItem = { key: HomepageSectionKey; order: number };

export const DEFAULT_HOMEPAGE_SECTION_ORDER: HomepageSectionOrderItem[] = HOMEPAGE_SECTION_KEYS.map((key, order) => ({ key, order }));

export function resolveHomepageSectionOrder(value: unknown): HomepageSectionOrderItem[] {
  if (!Array.isArray(value)) return DEFAULT_HOMEPAGE_SECTION_ORDER.map((item) => ({ ...item }));
  const seen = new Set<HomepageSectionKey>();
  const resolved: HomepageSectionOrderItem[] = [];
  value.forEach((item, index) => {
    if (!isRecord(item) || typeof item.key !== "string" || !HOMEPAGE_SECTION_KEYS.includes(item.key as HomepageSectionKey)) return;
    const key = item.key as HomepageSectionKey;
    if (seen.has(key)) return;
    seen.add(key);
    resolved.push({ key, order: Number.isFinite(item.order) ? Number(item.order) : index });
  });
  HOMEPAGE_SECTION_KEYS.forEach((key) => { if (!seen.has(key)) resolved.push({ key, order: resolved.length }); });
  return resolved.sort((a, b) => a.order - b.order).map((item, order) => ({ ...item, order }));
}

export function homepageSectionOrderMap(value: unknown): Record<HomepageSectionKey, number> {
  return Object.fromEntries(resolveHomepageSectionOrder(value).map((item, order) => [item.key, order])) as Record<HomepageSectionKey, number>;
}

export type HomepageNavigationItem = {
  id: string;
  label: string;
  href: CmsLinkValue;
  enabled?: boolean;
  order?: number;
};

export const DEFAULT_HOMEPAGE_NAVIGATION: HomepageNavigationItem[] = [
  { id: "NAV-FIRST", label: "第一次怎麼選", href: "/#home003", enabled: true, order: 0 },
  { id: "NAV-MONTHLY", label: "本月推薦", href: "/#home004", enabled: true, order: 1 },
  { id: "NAV-WORKS", label: "全部咖啡", href: "/works", enabled: true, order: 2 },
  { id: "NAV-WHY-KD", label: "為什麼是 KD", href: "/#home002", enabled: true, order: 3 },
  { id: "NAV-GIFT", label: "耳掛與送禮", href: "/#home003", enabled: true, order: 4 },
];

export function resolveHomepageNavigation(value: unknown): HomepageNavigationItem[] {
  if (!Array.isArray(value)) return DEFAULT_HOMEPAGE_NAVIGATION.map((item) => ({ ...item }));
  return value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item, index) => ({
      id: typeof item.id === "string" && item.id.trim() ? item.id : `NAV-${index + 1}`,
      label: typeof item.label === "string" ? item.label : "",
      href: item.href as CmsLinkValue,
      enabled: item.enabled !== false,
      order: Number.isFinite(item.order) ? Number(item.order) : index,
    }))
    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
}


export type HomepageHeroOverlayPreset = (typeof HOMEPAGE_HERO_OVERLAY_PRESETS)[number];
export type HomepageCardPresentationPreset = (typeof HOMEPAGE_CARD_PRESENTATION_PRESETS)[number];

export type HomepageVisualConfig = {
  colors?: {
    pageBackground?: VisualColorValue;
    primaryText?: VisualColorValue;
    secondaryText?: VisualColorValue;
    accent?: VisualColorValue;
    lightSurface?: VisualColorValue;
    darkSurface?: VisualColorValue;
    onDark?: VisualColorValue;
    primaryButton?: VisualColorValue;
    primaryButtonText?: VisualColorValue;
    border?: VisualColorValue;
  };
  heroOverlayPreset?: HomepageHeroOverlayPreset;
  cardPresentationPreset?: HomepageCardPresentationPreset;
};

export type HomepageSeoConfig = {
  title?: string;
  description?: string;
  shareImage?: {
    media: MediaAsset;
    alt: string;
  };
};

/**
 * J.2B.2 is schema-only. These optional groups deliberately have no runtime
 * defaults or public bindings yet, so legacy homepage.json renders byte-for-byte
 * through the existing frontend path until a later Owner-approved integration.
 */
export type HomepageOwnerPresentationConfig = {
  visual?: HomepageVisualConfig;
  seo?: HomepageSeoConfig;
};

export const HOMEPAGE_MOTION_PRESETS = [
  "none",
  "fade",
  "fade-up",
  "slide-left",
  "slide-right",
  "scale-reveal",
  "editorial",
] as const;

export type HomepageMotionPreset = (typeof HOMEPAGE_MOTION_PRESETS)[number];
export type HomepageMotionSectionKey =
  | "campaignSection"
  | "home002"
  | "home003"
  | "home004"
  | "home005"
  | "home006"
  | "home007"
  | "home008"
  | "home009"
  | "home010";

export type HomepageSectionMotion = {
  enabled: boolean;
  preset: HomepageMotionPreset;
  delayMs: number;
  durationMs: number;
  distancePx: number;
  staggerMs: number;
};

export type ResolvedHomepageMotion = HomepageSectionMotion & {
  activePreset: HomepageMotionPreset;
  initialX: number;
  initialY: number;
  initialScale: number;
};

export const HOMEPAGE_SECTION_MOTION_DEFAULTS: Record<HomepageMotionSectionKey, HomepageSectionMotion> = {
  campaignSection: { enabled: true, preset: "fade-up", delayMs: 0, durationMs: 800, distancePx: 18, staggerMs: 100 },
  home002: { enabled: true, preset: "editorial", delayMs: 0, durationMs: 800, distancePx: 18, staggerMs: 100 },
  home003: { enabled: true, preset: "editorial", delayMs: 0, durationMs: 800, distancePx: 20, staggerMs: 100 },
  home004: { enabled: true, preset: "fade-up", delayMs: 0, durationMs: 800, distancePx: 18, staggerMs: 100 },
  home005: { enabled: true, preset: "editorial", delayMs: 0, durationMs: 900, distancePx: 18, staggerMs: 120 },
  home006: { enabled: true, preset: "slide-right", delayMs: 0, durationMs: 800, distancePx: 20, staggerMs: 100 },
  home007: { enabled: true, preset: "slide-left", delayMs: 0, durationMs: 800, distancePx: 20, staggerMs: 100 },
  home008: { enabled: true, preset: "scale-reveal", delayMs: 0, durationMs: 900, distancePx: 16, staggerMs: 120 },
  home009: { enabled: false, preset: "none", delayMs: 0, durationMs: 700, distancePx: 0, staggerMs: 100 },
  home010: { enabled: true, preset: "fade", delayMs: 0, durationMs: 700, distancePx: 0, staggerMs: 100 },
};

export type HeroTiming = {
  mediaDuration: number;
  eyebrowStart: number;
  headlineLine1Start: number;
  headlineLine2Start: number;
  leadStart: number;
  primaryCtaStart: number;
  secondaryCtaStart: number;
  trustStart: number;
};

export const PREMIUM_HERO_TIMING: HeroTiming = {
  mediaDuration: 1600,
  eyebrowStart: 1420,
  headlineLine1Start: 1740,
  headlineLine2Start: 1880,
  leadStart: 2110,
  primaryCtaStart: 2390,
  secondaryCtaStart: 2500,
  trustStart: 2600,
};

const TIMING_KEYS: Array<keyof HeroTiming> = [
  "mediaDuration",
  "eyebrowStart",
  "headlineLine1Start",
  "headlineLine2Start",
  "leadStart",
  "primaryCtaStart",
  "secondaryCtaStart",
  "trustStart",
];

const SEQUENCE_KEYS = TIMING_KEYS.slice(1) as Array<keyof HeroTiming>;

export type HomepageMediaReference = {
  id?: string;
  enabled?: boolean;
  primary?: boolean;
  order?: number;
  image?: string;
  media?: MediaAsset;
  alt?: string;
  title?: string;
  caption?: string;
};

type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function sectionIsEnabled(value: unknown) {
  return !isRecord(value) || value.enabled !== false;
}

export function orderedEnabledItems<T extends { enabled?: boolean; order?: number }>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is T => Boolean(item) && typeof item === "object")
    .filter((item) => item.enabled !== false)
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aOrder = Number.isFinite(a.item.order) ? Number(a.item.order) : a.index;
      const bOrder = Number.isFinite(b.item.order) ? Number(b.item.order) : b.index;
      return aOrder - bOrder || a.index - b.index;
    })
    .map(({ item }) => item);
}

export function primaryEnabledIndex<T extends { enabled?: boolean; primary?: boolean }>(items: T[]) {
  const primaryIndex = items.findIndex((item) => item.enabled !== false && item.primary === true);
  if (primaryIndex >= 0) return primaryIndex;
  return items.findIndex((item) => item.enabled !== false);
}

export function resolveHeroTiming(value: unknown): HeroTiming {
  const candidate = isRecord(value) ? value : {};
  const resolved = { ...PREMIUM_HERO_TIMING };
  for (const key of TIMING_KEYS) {
    const number = Number(candidate[key]);
    if (Number.isFinite(number) && number >= 0 && number <= HERO_TIMING_MAX_MS) {
      resolved[key] = Math.round(number);
    }
  }
  let previous = 0;
  for (const key of SEQUENCE_KEYS) {
    resolved[key] = Math.max(previous, resolved[key]);
    previous = resolved[key];
  }
  return resolved;
}

function isMotionPreset(value: unknown): value is HomepageMotionPreset {
  return typeof value === "string" && (HOMEPAGE_MOTION_PRESETS as readonly string[]).includes(value);
}

export function resolveSectionMotion(value: unknown, sectionKey: HomepageMotionSectionKey): HomepageSectionMotion {
  const fallback = HOMEPAGE_SECTION_MOTION_DEFAULTS[sectionKey];
  if (!isRecord(value)) return { ...fallback };
  const resolveNumber = (key: keyof HomepageSectionMotion, minimum: number, maximum: number) => {
    const number = Number(value[key]);
    return Number.isFinite(number) && number >= minimum && number <= maximum ? Math.round(number) : fallback[key] as number;
  };
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : fallback.enabled,
    preset: isMotionPreset(value.preset) ? value.preset : fallback.preset,
    delayMs: resolveNumber("delayMs", 0, 10_000),
    durationMs: resolveNumber("durationMs", 100, 5_000),
    distancePx: resolveNumber("distancePx", 0, 80),
    staggerMs: resolveNumber("staggerMs", 0, 2_000),
  };
}

export function resolveHomepageMotion(value: unknown, sectionKey: HomepageMotionSectionKey): ResolvedHomepageMotion {
  const motion = resolveSectionMotion(value, sectionKey);
  const activePreset = motion.enabled ? motion.preset : "none";
  let initialX = 0;
  let initialY = 0;
  let initialScale = 1;
  if (activePreset === "fade-up") initialY = motion.distancePx;
  if (activePreset === "slide-left") initialX = -motion.distancePx;
  if (activePreset === "slide-right") initialX = motion.distancePx;
  if (activePreset === "scale-reveal") initialScale = 0.97;
  if (activePreset === "editorial") initialY = Math.round(motion.distancePx * 0.7 * 100) / 100;
  return { ...motion, activePreset, initialX, initialY, initialScale };
}

export function homepageMotionCssVariables(motion: ResolvedHomepageMotion) {
  return {
    "--home-motion-delay": `${motion.delayMs}ms`,
    "--home-motion-duration": `${motion.durationMs}ms`,
    "--home-motion-distance": `${motion.distancePx}px`,
    "--home-motion-stagger": `${motion.staggerMs}ms`,
    "--home-motion-initial-x": `${motion.initialX}px`,
    "--home-motion-initial-y": `${motion.initialY}px`,
    "--home-motion-initial-scale": String(motion.initialScale),
  };
}

function validateSectionMotion(value: unknown, label: string) {
  if (value === undefined) return;
  if (!isRecord(value)) throw new Error(`${label}動畫設定格式不正確。`);
  if (typeof value.enabled !== "boolean") throw new Error(`${label}動畫開關格式不正確。`);
  if (!isMotionPreset(value.preset)) throw new Error(`${label}進場方式不支援。`);
  const ranges: Array<[keyof HomepageSectionMotion, number, number, string]> = [
    ["delayMs", 0, 10_000, "延遲"],
    ["durationMs", 100, 5_000, "動畫時間"],
    ["distancePx", 0, 80, "移動距離"],
    ["staggerMs", 0, 2_000, "項目間隔"],
  ];
  for (const [key, minimum, maximum, fieldLabel] of ranges) {
    const number = value[key];
    if (typeof number !== "number" || !Number.isFinite(number) || number < minimum || number > maximum || !Number.isInteger(number)) {
      throw new Error(`${label}${fieldLabel}設定超出安全範圍。`);
    }
    if ((key === "delayMs" || key === "durationMs" || key === "staggerMs") && number % 100 !== 0) {
      throw new Error(`${label}${fieldLabel}請以 0.1 秒調整。`);
    }
  }
}

function validateText(value: unknown, label: string, maximum: number, required = false) {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${label}不可空白。`);
    return;
  }
  if (typeof value !== "string") throw new Error(`${label}格式不正確。`);
  if (required && !value.trim()) throw new Error(`${label}不可空白。`);
  if (value.length > maximum) throw new Error(`${label}過長，請縮短後再儲存。`);
}

function validateBoolean(value: unknown, label: string) {
  if (value !== undefined && typeof value !== "boolean") throw new Error(`${label}格式不正確。`);
}

function validateHref(value: unknown, label: string) {
  validateCmsLinkValue(value, label);
}

function validateId(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{2,79}$/u.test(value)) {
    throw new Error(`${label}識別碼格式不正確。`);
  }
}

function validateMediaAsset(value: unknown, label: string) {
  if (!isRecord(value)) throw new Error(`${label}媒體格式不正確。`);
  if (value.type !== "image" && value.type !== "video" && value.type !== "youtube") {
    throw new Error(`${label}媒體類型不支援。`);
  }
  validateText(value.url, `${label}網址`, 2000, true);
}

function validateMediaReferences(value: unknown, label: string) {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw new Error(`${label}媒體清單格式不正確。`);
  if (value.length > HOMEPAGE_COLLECTION_LIMIT) throw new Error(`${label}最多可放 ${HOMEPAGE_COLLECTION_LIMIT} 個媒體。`);
  const ids = new Set<string>();
  let primaryCount = 0;
  value.forEach((entry, index) => {
    if (!isRecord(entry)) throw new Error(`${label}第 ${index + 1} 項格式不正確。`);
    validateId(entry.id, `${label}第 ${index + 1} 項`);
    if (ids.has(String(entry.id))) throw new Error(`${label}有重複項目，請移除後再儲存。`);
    ids.add(String(entry.id));
    validateBoolean(entry.enabled, `${label}第 ${index + 1} 項顯示設定`);
    validateBoolean(entry.primary, `${label}第 ${index + 1} 項主媒體設定`);
    if (entry.primary === true && entry.enabled !== false) primaryCount += 1;
    validateText(entry.alt, `${label}第 ${index + 1} 項替代文字`, 300);
    validateText(entry.title, `${label}第 ${index + 1} 項標題`, 200);
    validateText(entry.caption, `${label}第 ${index + 1} 項說明`, 500);
    if (entry.media !== undefined) validateMediaAsset(entry.media, `${label}第 ${index + 1} 項`);
    if (entry.image !== undefined) validateText(entry.image, `${label}第 ${index + 1} 項圖片`, 2000);
  });
  if (primaryCount > 1) throw new Error(`${label}只能有一個顯示中的主媒體。`);
}

function validateContentCollection(value: unknown, label: string) {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw new Error(`${label}清單格式不正確。`);
  if (value.length > HOMEPAGE_COLLECTION_LIMIT) throw new Error(`${label}最多可有 ${HOMEPAGE_COLLECTION_LIMIT} 項。`);
  const ids = new Set<string>();
  value.forEach((entry, index) => {
    if (!isRecord(entry)) throw new Error(`${label}第 ${index + 1} 項格式不正確。`);
    validateId(entry.id, `${label}第 ${index + 1} 項`);
    if (ids.has(String(entry.id))) throw new Error(`${label}有重複項目。`);
    ids.add(String(entry.id));
    validateBoolean(entry.enabled, `${label}第 ${index + 1} 項顯示設定`);
    validateBoolean(entry.ctaEnabled, `${label}第 ${index + 1} 項按鈕顯示設定`);
    validateText(entry.title, `${label}第 ${index + 1} 項標題`, 200);
    validateText(entry.text, `${label}第 ${index + 1} 項內文`, 2000);
    validateHref(entry.href, `${label}第 ${index + 1} 項連結`);
    validateMediaReferences(entry.mediaItems, `${label}第 ${index + 1} 項`);
  });
}

function isSafeHomepageMediaUrl(value: string) {
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("..")) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validateHomepageVisual(value: unknown) {
  if (value === undefined) return;
  if (!isRecord(value)) throw new Error("首頁視覺設定格式不正確。");
  const allowed = ["colors", "heroOverlayPreset", "cardPresentationPreset"];
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`首頁視覺設定包含不支援的欄位：${unknown}。`);

  if (value.colors !== undefined) {
    if (!isRecord(value.colors)) throw new Error("首頁色彩設定格式不正確。");
    const colorKeys = ["pageBackground", "primaryText", "secondaryText", "accent", "lightSurface", "darkSurface", "onDark", "primaryButton", "primaryButtonText", "border"] as const;
    const unknownColor = Object.keys(value.colors).find((key) => !colorKeys.includes(key as typeof colorKeys[number]));
    if (unknownColor) throw new Error(`首頁色彩設定包含不支援的欄位：${unknownColor}。`);
    for (const key of colorKeys) {
      const candidate = value.colors[key];
      if (candidate !== undefined && resolveVisualColor(candidate, "#000000") !== candidate) {
        throw new Error(`首頁 ${key} 顏色不安全。`);
      }
    }
  }
  if (value.heroOverlayPreset !== undefined && !(HOMEPAGE_HERO_OVERLAY_PRESETS as readonly unknown[]).includes(value.heroOverlayPreset)) {
    throw new Error("首頁 Hero 遮罩樣式不支援。");
  }
  if (value.cardPresentationPreset !== undefined && !(HOMEPAGE_CARD_PRESENTATION_PRESETS as readonly unknown[]).includes(value.cardPresentationPreset)) {
    throw new Error("首頁卡片樣式不支援。");
  }
}

function validateHomepageSeo(value: unknown) {
  if (value === undefined) return;
  if (!isRecord(value)) throw new Error("首頁 SEO 設定格式不正確。");
  const allowed = ["title", "description", "shareImage"];
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`首頁 SEO 設定包含不支援的欄位：${unknown}。`);
  validateText(value.title, "首頁 SEO 標題", 70);
  validateText(value.description, "首頁 SEO 說明", 180);
  if (value.shareImage !== undefined) {
    if (!isRecord(value.shareImage) || !isMediaAsset(value.shareImage.media) || value.shareImage.media.type !== "image" || !isSafeHomepageMediaUrl(value.shareImage.media.url)) {
      throw new Error("首頁 SEO 分享圖片必須是安全的圖片媒體。");
    }
    validateText(value.shareImage.alt, "首頁 SEO 分享圖片替代文字", 240, true);
  }
}

export function resolveHomepageOwnerPresentation(homepage: unknown): HomepageOwnerPresentationConfig {
  if (!isRecord(homepage)) return {};
  const result: HomepageOwnerPresentationConfig = {};
  if (isRecord(homepage.visual)) result.visual = structuredClone(homepage.visual) as HomepageVisualConfig;
  if (isRecord(homepage.seo)) result.seo = structuredClone(homepage.seo) as HomepageSeoConfig;
  return result;
}

function validateHomepageNavigation(value: unknown) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > HOMEPAGE_NAVIGATION_LIMIT) {
    throw new Error(`首頁導覽最多可有 ${HOMEPAGE_NAVIGATION_LIMIT} 項。`);
  }
  const ids = new Set<string>();
  value.forEach((item, index) => {
    if (!isRecord(item)) throw new Error(`第 ${index + 1} 個首頁導覽格式不正確。`);
    validateId(item.id, `第 ${index + 1} 個首頁導覽`);
    if (ids.has(String(item.id))) throw new Error("首頁導覽項目 ID 不可重複。");
    ids.add(String(item.id));
    validateBoolean(item.enabled, `第 ${index + 1} 個首頁導覽顯示設定`);
    validateText(item.label, `第 ${index + 1} 個首頁導覽名稱`, 40, true);
    validateHref(item.href, `第 ${index + 1} 個首頁導覽連結`);
    if (item.order !== undefined && (!Number.isInteger(item.order) || Number(item.order) < 0 || Number(item.order) >= HOMEPAGE_NAVIGATION_LIMIT)) {
      throw new Error(`第 ${index + 1} 個首頁導覽排序不正確。`);
    }
  });
}

export function validateHomepageCms(homepage: unknown) {
  if (!isRecord(homepage) || !isRecord(homepage.hero)) throw new Error("首頁資料格式不完整。");
  const hero = homepage.hero;
  validateHomepageVisual(homepage.visual);
  validateHomepageSeo(homepage.seo);
  validateHomepageNavigation(homepage.navigation);
  if (homepage.sectionOrder !== undefined) {
    if (!Array.isArray(homepage.sectionOrder) || homepage.sectionOrder.length !== HOMEPAGE_SECTION_KEYS.length) throw new Error("首頁區塊排序格式不正確。");
    const resolvedSectionOrder = resolveHomepageSectionOrder(homepage.sectionOrder);
    if (resolvedSectionOrder.length !== HOMEPAGE_SECTION_KEYS.length || new Set(resolvedSectionOrder.map((item) => item.key)).size !== HOMEPAGE_SECTION_KEYS.length) throw new Error("首頁區塊排序不可重複或缺少區塊。");
  }
  validateBoolean(hero.enabled, "主視覺顯示設定");
  validateBoolean(hero.motionEnabled, "主視覺電影式進場設定");
  validateBoolean(hero.primaryCtaEnabled, "主視覺主要按鈕顯示設定");
  validateBoolean(hero.secondaryCtaEnabled, "主視覺次要按鈕顯示設定");
  validateText(hero.eyebrow, "主視覺品牌小標", 200);
  validateText(hero.lead, "主視覺說明", 2000);
  validateText(hero.buttonLabel, "主視覺主要按鈕", 100);
  validateHref(hero.buttonHref, "主視覺主要按鈕連結");
  validateText(hero.secondaryLabel, "主視覺次要按鈕", 100);
  validateHref(hero.secondaryHref, "主視覺次要按鈕連結");
  if (hero.media !== undefined) validateMediaAsset(hero.media, "主視覺既有媒體");
  if (hero.desktopMedia !== undefined) validateMediaAsset(hero.desktopMedia, "主視覺桌機媒體");
  if (hero.mobileMedia !== undefined) validateMediaAsset(hero.mobileMedia, "主視覺手機媒體");
  if (hero.trustCues !== undefined) {
    if (!Array.isArray(hero.trustCues) || hero.trustCues.length > 8) throw new Error("主視覺信任資訊最多可有 8 項。");
    hero.trustCues.forEach((cue, index) => validateText(cue, `第 ${index + 1} 項信任資訊`, 120, true));
  }
  if (hero.timing !== undefined) {
    if (!isRecord(hero.timing)) throw new Error("主視覺進場時間格式不正確。");
    for (const key of TIMING_KEYS) {
      const number = hero.timing[key];
      const isPremiumExactValue = number === PREMIUM_HERO_TIMING[key];
      if (typeof number !== "number" || !Number.isFinite(number) || number < 0 || number > HERO_TIMING_MAX_MS || (number % 100 !== 0 && !isPremiumExactValue)) {
        throw new Error("主視覺進場時間必須介於 0.0 到 10.0 秒，並以 0.1 秒調整。");
      }
    }
    const resolved = resolveHeroTiming(hero.timing);
    for (const key of TIMING_KEYS) {
      if (resolved[key] !== hero.timing[key]) throw new Error("主視覺文字進場順序不正確，後面的內容不可早於前一項。");
    }
  }
  if (!Array.isArray(homepage.campaigns) || homepage.campaigns.length > HOMEPAGE_COLLECTION_LIMIT) {
    throw new Error(`首頁活動最多可有 ${HOMEPAGE_COLLECTION_LIMIT} 項。`);
  }
  homepage.campaigns.forEach((campaign, index) => {
    if (!isRecord(campaign)) throw new Error(`第 ${index + 1} 個活動格式不正確。`);
    validateId(campaign.id, `第 ${index + 1} 個活動`);
    validateBoolean(campaign.enabled, `第 ${index + 1} 個活動顯示設定`);
    validateBoolean(campaign.ctaEnabled, `第 ${index + 1} 個活動主要按鈕顯示設定`);
    validateBoolean(campaign.secondaryCtaEnabled, `第 ${index + 1} 個活動次要按鈕顯示設定`);
    validateText(campaign.title, `第 ${index + 1} 個活動標題`, 200, true);
    validateText(campaign.description, `第 ${index + 1} 個活動說明`, 2000);
    validateText(campaign.ctaLabel, `第 ${index + 1} 個活動按鈕`, 100);
    validateHref(campaign.ctaHref, `第 ${index + 1} 個活動連結`);
    validateHref(campaign.secondaryHref, `第 ${index + 1} 個活動次要連結`);
  });

  const sections: Array<[string, string, string]> = [
    ["home002", "cards", "品牌價值"],
    ["home003", "cards", "咖啡時刻"],
    ["home005", "steps", "咖啡製程"],
    ["home007", "cards", "咖啡藝術"],
  ];
  for (const [sectionKey, collectionKey, label] of sections) {
    const section = homepage[sectionKey];
    if (!isRecord(section)) continue;
    validateBoolean(section.enabled, `${label}區塊顯示設定`);
    validateText(section.title, `${label}標題`, 200);
    validateText(section.intro ?? section.text, `${label}說明`, 2000);
    validateContentCollection(section[collectionKey], label);
  }

  const home008 = homepage.home008;
  if (isRecord(home008)) {
    validateBoolean(home008.enabled, "工作室區塊顯示設定");
    validateText(home008.title, "工作室標題", 200);
    validateText(home008.text, "工作室說明", 2000);
    validateMediaReferences(home008.mediaItems ?? home008.images, "工作室");
  }
  const home006 = homepage.home006;
  if (isRecord(home006)) {
    validateBoolean(home006.ctaEnabled, "專屬烘焙按鈕顯示設定");
    validateText(home006.title, "專屬烘焙標題", 200);
    validateText(home006.text, "專屬烘焙說明", 2000);
    validateText(home006.button, "專屬烘焙按鈕", 100);
    validateHref(home006.href, "專屬烘焙連結");
    validateMediaReferences(home006.mediaItems, "專屬烘焙");
  }
  const home010 = homepage.home010;
  if (isRecord(home010)) {
    validateBoolean(home010.ctaEnabled, "最後購買引導按鈕顯示設定");
    validateText(home010.title, "最後購買引導標題", 200);
    validateText(home010.text, "最後購買引導說明", 2000);
    validateText(home010.button, "最後購買引導按鈕", 100);
    validateHref(home010.href, "最後購買引導連結");
  }
  const home009 = homepage.home009;
  if (isRecord(home009) && home009.items !== undefined) {
    if (!Array.isArray(home009.items) || home009.items.length > HOMEPAGE_COLLECTION_LIMIT) throw new Error("真實評價清單格式不正確。");
    home009.items.forEach((review, index) => {
      if (!isRecord(review)) throw new Error(`第 ${index + 1} 則評價格式不正確。`);
      validateId(review.id, `第 ${index + 1} 則評價`);
      validateText(review.name, `第 ${index + 1} 則評價姓名`, 120);
      validateText(review.source, `第 ${index + 1} 則評價來源`, 200);
      validateText(review.text, `第 ${index + 1} 則評價內容`, 2000);
    });
  }
  for (const key of ["home004", "home006", "home009", "home010"]) {
    const section = homepage[key];
    if (isRecord(section)) validateBoolean(section.enabled, `${key.toUpperCase()} 區塊顯示設定`);
  }
  const motionSections: Array<[HomepageMotionSectionKey, string]> = [
    ["campaignSection", "本月活動"], ["home002", "品牌價值"], ["home003", "咖啡時刻"],
    ["home004", "推薦作品"], ["home005", "咖啡製程"], ["home006", "專屬烘焙"],
    ["home007", "咖啡藝術"], ["home008", "真實工作室"], ["home009", "真實評價"],
    ["home010", "最後購買引導"],
  ];
  for (const [key, label] of motionSections) {
    const section = homepage[key];
    if (isRecord(section)) validateSectionMotion(section.motion, label);
  }
  const slugs = isRecord(homepage.home004) ? homepage.home004.productSlugs : undefined;
  if (slugs !== undefined && (!Array.isArray(slugs) || slugs.length > HOMEPAGE_PRODUCT_LIMIT)) {
    throw new Error(`首頁推薦作品最多可有 ${HOMEPAGE_PRODUCT_LIMIT} 項。`);
  }
  return true;
}
