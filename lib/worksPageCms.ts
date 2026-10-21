import type { CmsLinkValue } from "./cmsLinks.ts";
// @ts-expect-error -- runtime test scripts use Node's TypeScript stripping and require explicit extensions.
import { validateCmsLinkValue } from "./cmsLinks.ts";
import type { HomepageSectionMotion } from "./homepageCms.ts";
// @ts-expect-error -- runtime test scripts use Node's TypeScript stripping and require explicit extensions.
import { HOMEPAGE_MOTION_PRESETS } from "./homepageCms.ts";
import type { MediaAsset } from "./media.ts";
// @ts-expect-error -- runtime test scripts use Node's TypeScript stripping and require explicit extensions.
import { isMediaAsset } from "./media.ts";
import type { VisualColorValue } from "./pageBuilderVisualStyle.ts";
// @ts-expect-error -- runtime test scripts use Node's TypeScript stripping and require explicit extensions.
import { resolveVisualColor, visualColorHex } from "./pageBuilderVisualStyle.ts";

export const WORKS_PAGE_SCHEMA_VERSION = 1 as const;
export const WORKS_CONTENT_SOURCES = ["monthly-menu", "custom"] as const;
export const WORKS_HERO_OVERLAY_PRESETS = ["current-gradient", "soft", "strong", "none"] as const;
export const WORKS_CARD_PRESENTATION_PRESETS = ["current", "minimal", "bordered"] as const;
export const WORKS_CARD_HOVER_PRESETS = ["current-scale", "none"] as const;


export const WORKS_SOLD_OUT_MODES = ["text", "image"] as const;
export const WORKS_SOLD_OUT_POSITIONS = ["top", "center", "bottom"] as const;
export const WORKS_SOLD_OUT_DIM_MODES = ["none", "band", "full"] as const;
// Read compatibility only: old settings normalize to the new plain/band design.
const LEGACY_SOLD_OUT_OPTIONS = {
  style: ["center-badge", "bottom-strip", "top-left-badge"],
  dimLevel: ["none", "light", "medium"],
  dimArea: ["label-area", "top", "center", "bottom", "full", "none"],
  dimSize: ["small", "medium", "large"],
} as const;
export type WorksSoldOutPresentation = {
  mode: (typeof WORKS_SOLD_OUT_MODES)[number];
  text: string;
  imageAsset?: WorksPageMediaReference;
  textFontSize: number;
  textColor: string;
  textPosition: (typeof WORKS_SOLD_OUT_POSITIONS)[number];
  dimMode: (typeof WORKS_SOLD_OUT_DIM_MODES)[number];
  dimStrength: number;
  bandPosition: (typeof WORKS_SOLD_OUT_POSITIONS)[number];
  bandSize: number;
  imageSize?: number;
  bandFeather?: number;
};
export const DEFAULT_WORKS_SOLD_OUT_PRESENTATION: Readonly<WorksSoldOutPresentation> = {
  mode: "text", text: "暫時完售", textFontSize: 20, textColor: "#f5eee3",
  textPosition: "center", dimMode: "band", dimStrength: 35, bandPosition: "center", bandSize: 30,
};
export function isWorksSoldOutText(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const points = Array.from(value);
  return points.length > 0 && points.length <= 40 && /[^\p{White_Space}\p{Cf}]/u.test(value) &&
    !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value) &&
    points.every(point => { const cp = point.codePointAt(0)!; return cp < 0xd800 || cp > 0xdfff; });
}
function soldOutInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}
function soldOutImage(value: unknown): WorksPageMediaReference | undefined {
  const ref = resolveMediaReference(value, true);
  // Use the existing local asset pipeline; no arbitrary external embeds or paths.
  if (!ref || !/^\/uploads\/assets\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.(?:png|webp)$/i.test(ref.media.url) ||
      (ref.media.provider !== undefined && ref.media.provider !== "local")) return undefined;
  return ref;
}
export function resolveWorksSoldOutPresentation(value: unknown): WorksSoldOutPresentation {
  const raw = isRecord(value) ? value : {};
  const defaults = DEFAULT_WORKS_SOLD_OUT_PRESENTATION;
  const legacyPosition = raw.style === "top-left-badge" ? "top" : raw.style === "bottom-strip" ? "bottom" : defaults.textPosition;
  const legacyMode = raw.dimLevel === "none" || raw.dimArea === "none" ? "none" : raw.dimArea === "full" ? "full" : defaults.dimMode;
  const legacyBand = oneOf(raw.dimArea, WORKS_SOLD_OUT_POSITIONS, raw.dimArea === "label-area" ? legacyPosition : defaults.bandPosition);
  const imageAsset = soldOutImage(raw.imageAsset);
  return {
    mode: oneOf(raw.mode, WORKS_SOLD_OUT_MODES, defaults.mode),
    text: isWorksSoldOutText(raw.text) ? raw.text : defaults.text,
    ...(imageAsset ? { imageAsset } : {}),
    textFontSize: soldOutInteger(raw.textFontSize, 12, 48) ? raw.textFontSize : defaults.textFontSize,
    textColor: typeof raw.textColor === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.textColor) ? raw.textColor : defaults.textColor,
    textPosition: oneOf(raw.textPosition, WORKS_SOLD_OUT_POSITIONS, legacyPosition),
    dimMode: oneOf(raw.dimMode, WORKS_SOLD_OUT_DIM_MODES, legacyMode),
    dimStrength: soldOutInteger(raw.dimStrength, 0, 100) ? raw.dimStrength : raw.dimLevel === "medium" ? 50 : defaults.dimStrength,
    bandPosition: oneOf(raw.bandPosition, WORKS_SOLD_OUT_POSITIONS, legacyBand),
    bandSize: soldOutInteger(raw.bandSize, 10, 60) ? raw.bandSize : raw.dimSize === "small" ? 20 : raw.dimSize === "large" ? 50 : defaults.bandSize,
    ...(soldOutInteger(raw.imageSize, 20, 90) ? { imageSize: raw.imageSize } : {}),
    ...(soldOutInteger(raw.bandFeather, 0, 40) ? { bandFeather: raw.bandFeather } : {}),
  };
}
/** Strict SAVE boundary; malformed stored settings remain safely readable.
 * GET never migrates settings or writes resolved defaults into PageStore.
 */
export function validateWorksSoldOutPresentation(value: unknown): void {
  if (value === undefined) return;
  if (!isRecord(value)) throw new Error("作品缺貨顯示設定格式不正確。");
  assertOnlyKeys(value, ["mode", "text", "imageAsset", "textFontSize", "textColor", "textPosition",
    "dimMode", "dimStrength", "bandPosition", "bandSize", "imageSize", "bandFeather", ...Object.keys(LEGACY_SOLD_OUT_OPTIONS)], "作品缺貨顯示設定");
  if (value.text !== undefined && !isWorksSoldOutText(value.text))
    throw new Error("缺貨顯示文字須為 1–40 個有效字元，且不可換行。");
  for (const [key, options] of [
    ["mode", WORKS_SOLD_OUT_MODES], ["textPosition", WORKS_SOLD_OUT_POSITIONS],
    ["dimMode", WORKS_SOLD_OUT_DIM_MODES], ["bandPosition", WORKS_SOLD_OUT_POSITIONS],
    ...Object.entries(LEGACY_SOLD_OUT_OPTIONS),
  ] as Array<[string, readonly string[]]>) {
    if (value[key] !== undefined && !options.includes(value[key] as string))
      throw new Error("作品缺貨顯示選項不支援。");
  }
  for (const [key, min, max] of [["textFontSize", 12, 48], ["dimStrength", 0, 100], ["bandSize", 10, 60], ["imageSize", 20, 90], ["bandFeather", 0, 40]] as const)
    if (value[key] !== undefined && !soldOutInteger(value[key], min, max)) throw new Error("作品缺貨顯示數值超出範圍。");
  if (value.textColor !== undefined && (typeof value.textColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value.textColor)))
    throw new Error("缺貨文字顏色須為六碼 HEX 色碼。");
  if (value.imageAsset !== undefined) {
    validateMediaReference(value.imageAsset, "缺貨圖片", true);
    if (!soldOutImage(value.imageAsset)) throw new Error("缺貨圖片須使用現有圖片管線的 PNG / WebP 圖片。");
  }
}

/** Shared presentation vocabulary; soldOutPresentation remains its compatible
 * system-status storage slot. Marketing assignments stay exclusively Product.tag.
 */
export type WorksCardMarkerPresentation = WorksSoldOutPresentation;
export const WORKS_MARKETING_MARKER_TYPES = ["NEW", "RECOMMENDED", "CAMPAIGN", "LIMITED", "FEATURED", "CUSTOM"] as const;
export type WorksMarketingMarkerType = (typeof WORKS_MARKETING_MARKER_TYPES)[number];
export const WORKS_MARKETING_MARKER_LABELS: Record<WorksMarketingMarkerType, string> = {
  NEW: "新品", RECOMMENDED: "推薦", CAMPAIGN: "活動", LIMITED: "限量", FEATURED: "本月精選", CUSTOM: "自訂",
};
export type WorksCardMarkersConfig = {
  contractVersion: 1;
  marketing?: { presets?: Partial<Record<WorksMarketingMarkerType, Partial<WorksCardMarkerPresentation>>> };
};
export function resolveWorksMarketingPreset(config: unknown, type: WorksMarketingMarkerType): WorksCardMarkerPresentation {
  const defaults: WorksCardMarkerPresentation = {
    ...DEFAULT_WORKS_SOLD_OUT_PRESENTATION, text: WORKS_MARKETING_MARKER_LABELS[type],
    dimMode: "none", imageSize: 65, bandFeather: 15,
  };
  const root = isRecord(config) && config.contractVersion === 1 ? config : {};
  const marketing = isRecord(root.marketing) ? root.marketing : {};
  const presets = isRecord(marketing.presets) ? marketing.presets : {};
  const raw = isRecord(presets[type]) ? presets[type] : {};
  const safe: Record<string, unknown> = {};
  // Independent safe fallbacks; never promote arbitrary CSS/assignment fields.
  for (const [key, value] of Object.entries(raw)) {
    if (type === "CUSTOM" && key === "text") continue;
    try { validateWorksSoldOutPresentation({ [key]: value }); safe[key] = value; } catch { /* use that field's preset default */ }
  }
  return resolveWorksSoldOutPresentation({ ...defaults, ...safe });
}
export function validateWorksCardMarkers(value: unknown): void {
  if (value === undefined) return;
  if (!isRecord(value)) throw new Error("作品卡標示格式不正確。");
  assertOnlyKeys(value, ["contractVersion", "marketing"], "作品卡標示");
  if (value.contractVersion !== 1) throw new Error("作品卡標示版本不支援。");
  if (value.marketing === undefined) return;
  if (!isRecord(value.marketing)) throw new Error("行銷標示格式不正確。");
  // No second assignment table or Product mutation payload is accepted.
  assertOnlyKeys(value.marketing, ["presets"], "行銷標示");
  if (value.marketing.presets === undefined) return;
  if (!isRecord(value.marketing.presets)) throw new Error("行銷標示預設格式不正確。");
  assertOnlyKeys(value.marketing.presets, WORKS_MARKETING_MARKER_TYPES, "行銷標示預設");
  for (const [type, presentation] of Object.entries(value.marketing.presets)) {
    if (!isRecord(presentation)) throw new Error("行銷標示呈現格式不正確。");
    if (type === "CUSTOM" && Object.hasOwn(presentation, "text")) throw new Error("自訂標示文字沿用作品標籤。");
    validateWorksSoldOutPresentation(presentation);
  }
}

export type WorksContentSource = (typeof WORKS_CONTENT_SOURCES)[number];
export type WorksHeroOverlayPreset = (typeof WORKS_HERO_OVERLAY_PRESETS)[number];
export type WorksCardPresentationPreset = (typeof WORKS_CARD_PRESENTATION_PRESETS)[number];
export type WorksCardHoverPreset = (typeof WORKS_CARD_HOVER_PRESETS)[number];
export type WorksEntranceMotion = HomepageSectionMotion & { triggerOnViewport?: boolean };

export type WorksPageMediaReference = {
  media: MediaAsset;
  alt: string;
};

export type WorksPageCta = {
  enabled?: boolean;
  label?: string;
  link?: CmsLinkValue;
};

export type WorksPageCmsConfig = {
  schemaVersion: typeof WORKS_PAGE_SCHEMA_VERSION;
  soldOutPresentation?: Partial<WorksSoldOutPresentation>;
  cardMarkers?: WorksCardMarkersConfig;
  hero?: {
    enabled?: boolean;
    eyebrowSource?: WorksContentSource;
    customEyebrow?: string;
    headlineLines?: [string, string];
    descriptionSource?: WorksContentSource;
    customDescription?: string;
    primaryCta?: WorksPageCta;
    secondaryCta?: WorksPageCta;
    desktopMedia?: WorksPageMediaReference;
    mobileMedia?: WorksPageMediaReference;
    overlayPreset?: WorksHeroOverlayPreset;
  };
  catalog?: {
    introEnabled?: boolean;
    countPrefix?: string;
    countSuffix?: string;
    helperText?: string;
    emptyStateText?: string;
    presentation?: {
      showIndex?: boolean;
      showArtist?: boolean;
      showTag?: boolean;
      showFlavors?: boolean;
      showFacts?: boolean;
      showCommerceSummary?: boolean;
      cardPreset?: WorksCardPresentationPreset;
    };
  };
  colors?: {
    pageBackground?: VisualColorValue;
    heroBackground?: VisualColorValue;
    heroText?: VisualColorValue;
    heroSecondaryText?: VisualColorValue;
    accent?: VisualColorValue;
    primaryCtaBackground?: VisualColorValue;
    primaryCtaText?: VisualColorValue;
    catalogBackground?: VisualColorValue;
    catalogText?: VisualColorValue;
    cardSurface?: VisualColorValue;
    cardText?: VisualColorValue;
    border?: VisualColorValue;
  };
  motion?: {
    hero?: WorksEntranceMotion;
    heroMedia?: WorksEntranceMotion;
    catalogIntro?: WorksEntranceMotion;
    productGrid?: WorksEntranceMotion;
    cardHover?: {
      enabled?: boolean;
      preset?: WorksCardHoverPreset;
      durationMs?: number;
    };
  };
  seo?: {
    title?: string;
    description?: string;
    shareImage?: WorksPageMediaReference;
  };
};

export type ResolvedWorksPageCms = {
  schemaVersion: typeof WORKS_PAGE_SCHEMA_VERSION;
  soldOutPresentation: WorksSoldOutPresentation;
  hero: {
    enabled: boolean;
    eyebrowSource: WorksContentSource;
    eyebrow: string;
    customEyebrow: string;
    headlineLines: [string, string];
    descriptionSource: WorksContentSource;
    description: string;
    customDescription: string;
    primaryCta: { enabled: boolean; label: string; link: Exclude<CmsLinkValue, undefined> };
    secondaryCta: { enabled: boolean; label: string; link: Exclude<CmsLinkValue, undefined> };
    desktopMedia?: WorksPageMediaReference;
    mobileMedia?: WorksPageMediaReference;
    overlayPreset: WorksHeroOverlayPreset;
  };
  catalog: {
    introEnabled: boolean;
    countPrefix: string;
    countSuffix: string;
    helperText: string;
    emptyStateText: string;
    presentation: {
      showIndex: boolean;
      showArtist: boolean;
      showTag: boolean;
      showFlavors: boolean;
      showFacts: boolean;
      showCommerceSummary: boolean;
      cardPreset: WorksCardPresentationPreset;
    };
  };
  colors: Required<NonNullable<WorksPageCmsConfig["colors"]>>;
  motion: {
    hero: Required<WorksEntranceMotion>;
    heroMedia: Required<WorksEntranceMotion>;
    catalogIntro: Required<WorksEntranceMotion>;
    productGrid: Required<WorksEntranceMotion>;
    cardHover: {
      enabled: boolean;
      preset: WorksCardHoverPreset;
      durationMs: number;
    };
  };
  seo: {
    title: string;
    description: string;
    shareImage?: WorksPageMediaReference;
  };
};

const NO_ENTRANCE_MOTION: HomepageSectionMotion = {
  enabled: false,
  preset: "none",
  delayMs: 0,
  durationMs: 500,
  distancePx: 0,
  staggerMs: 0,
};

export const DEFAULT_WORKS_PAGE_CMS_CONFIG: Readonly<WorksPageCmsConfig> = {
  schemaVersion: WORKS_PAGE_SCHEMA_VERSION,
  soldOutPresentation: { ...DEFAULT_WORKS_SOLD_OUT_PRESENTATION },
  hero: {
    enabled: true,
    eyebrowSource: "monthly-menu",
    customEyebrow: "",
    headlineLines: ["不用先懂咖啡，", "先從你喜歡的味道開始。"],
    descriptionSource: "monthly-menu",
    customDescription: "",
    primaryCta: { enabled: true, label: "查看全部作品", link: "#catalog" },
    secondaryCta: { enabled: true, label: "不知道怎麼選？看入門推薦", link: "/#beginner" },
    overlayPreset: "current-gradient",
  },
  catalog: {
    introEnabled: true,
    countPrefix: "本月共",
    countSuffix: "件作品",
    helperText: "每張卡片都直接顯示風味、價格與供應狀態。",
    emptyStateText: "",
    presentation: {
      showIndex: true,
      showArtist: true,
      showTag: true,
      showFlavors: true,
      showFacts: true,
      showCommerceSummary: true,
      cardPreset: "current",
    },
  },
  colors: {
    pageBackground: "#15110f",
    heroBackground: "#15110f",
    heroText: "#f7f2ea",
    heroSecondaryText: "#afa198",
    accent: "#c7a56b",
    primaryCtaBackground: "#f1e5d3",
    primaryCtaText: "#211a14",
    catalogBackground: "#f4efe7",
    catalogText: "#776a60",
    cardSurface: "#ffffff",
    cardText: "#241a15",
    border: "#eae8e7",
  },
  motion: {
    hero: NO_ENTRANCE_MOTION,
    heroMedia: { ...NO_ENTRANCE_MOTION, enabled: false },
    catalogIntro: NO_ENTRANCE_MOTION,
    productGrid: NO_ENTRANCE_MOTION,
    cardHover: { enabled: true, preset: "current-scale", durationMs: 500 },
  },
  seo: {
    title: "本月咖啡作品｜KD Coffee 咖啡藝術工坊",
    description: "查看 KD Coffee 本月咖啡作品、風味、價格與購買規格。第一次喝精品咖啡，也能快速找到適合自己的味道。",
  },
};

type JsonRecord = Record<string, unknown>;
type DynamicWorksValues = { monthLabel: string; intro: string };

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function oneOf<T extends readonly string[]>(value: unknown, values: T, fallback: T[number]): T[number] {
  return typeof value === "string" && values.includes(value) ? value as T[number] : fallback;
}

function text(value: unknown, fallback: string, maximum: number) {
  return typeof value === "string" && value.length <= maximum ? value : fallback;
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function numberInRange(value: unknown, fallback: number, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? Math.round(value)
    : fallback;
}

function safeLink(value: unknown, fallback: Exclude<CmsLinkValue, undefined>): Exclude<CmsLinkValue, undefined> {
  try {
    validateCmsLinkValue(value, "Works 按鈕");
    return value === undefined ? fallback : structuredClone(value as Exclude<CmsLinkValue, undefined>);
  } catch {
    return fallback;
  }
}

function isSafeMediaUrl(value: string) {
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("..")) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function resolveMediaReference(value: unknown, shareImage = false): WorksPageMediaReference | undefined {
  if (!isRecord(value) || !isMediaAsset(value.media) || !isSafeMediaUrl(value.media.url)) return undefined;
  if (shareImage && value.media.type !== "image") return undefined;
  if (typeof value.alt !== "string" || value.alt.length > 240) return undefined;
  if (value.media.type === "image" && !value.alt.trim()) return undefined;
  return { media: { ...value.media }, alt: value.alt };
}

/**
 * Admin draft preview deliberately accepts an unfinished alt value so a newly
 * selected asset can be seen before Save. Publish-time validation remains
 * strict and still requires alt text for images.
 */
export function resolveWorksPagePreviewMedia(
  hero: Pick<NonNullable<WorksPageCmsConfig["hero"]>, "desktopMedia" | "mobileMedia"> | undefined,
  device: "desktop" | "mobile",
): WorksPageMediaReference | undefined {
  const candidate = device === "mobile"
    ? hero?.mobileMedia || hero?.desktopMedia
    : hero?.desktopMedia;
  if (!candidate || !isMediaAsset(candidate.media) || !isSafeMediaUrl(candidate.media.url)) return undefined;
  const alt = typeof candidate.alt === "string" && candidate.alt.length <= 240 ? candidate.alt : "";
  return { media: { ...candidate.media }, alt };
}

function resolveMotion(value: unknown, triggerOnViewport = false): Required<WorksEntranceMotion> {
  const fallback = NO_ENTRANCE_MOTION;
  if (!isRecord(value)) return { ...fallback, triggerOnViewport };
  return {
    enabled: bool(value.enabled, fallback.enabled),
    preset: oneOf(value.preset, HOMEPAGE_MOTION_PRESETS, fallback.preset),
    delayMs: numberInRange(value.delayMs, fallback.delayMs, 0, 10_000),
    durationMs: numberInRange(value.durationMs, fallback.durationMs, 100, 5_000),
    distancePx: numberInRange(value.distancePx, fallback.distancePx, 0, 80),
    staggerMs: numberInRange(value.staggerMs, fallback.staggerMs, 0, 2_000),
    triggerOnViewport: bool(value.triggerOnViewport, triggerOnViewport),
  };
}

export function resolveWorksPageCms(config: unknown, live: DynamicWorksValues): ResolvedWorksPageCms {
  const root = isRecord(config) && config.schemaVersion === WORKS_PAGE_SCHEMA_VERSION ? config : {};
  const hero = isRecord(root.hero) ? root.hero : {};
  const catalog = isRecord(root.catalog) ? root.catalog : {};
  const presentation = isRecord(catalog.presentation) ? catalog.presentation : {};
  const colors = isRecord(root.colors) ? root.colors : {};
  const motion = isRecord(root.motion) ? root.motion : {};
  const cardHover = isRecord(motion.cardHover) ? motion.cardHover : {};
  const seo = isRecord(root.seo) ? root.seo : {};
  const defaultHero = DEFAULT_WORKS_PAGE_CMS_CONFIG.hero!;
  const defaultCatalog = DEFAULT_WORKS_PAGE_CMS_CONFIG.catalog!;
  const defaultPresentation = defaultCatalog.presentation!;
  const defaultColors = DEFAULT_WORKS_PAGE_CMS_CONFIG.colors!;
  const defaultMotion = DEFAULT_WORKS_PAGE_CMS_CONFIG.motion!;
  const defaultSeo = DEFAULT_WORKS_PAGE_CMS_CONFIG.seo!;
  const eyebrowSource = oneOf(hero.eyebrowSource, WORKS_CONTENT_SOURCES, defaultHero.eyebrowSource!);
  const descriptionSource = oneOf(hero.descriptionSource, WORKS_CONTENT_SOURCES, defaultHero.descriptionSource!);
  const customEyebrow = text(hero.customEyebrow, defaultHero.customEyebrow!, 120);
  const customDescription = text(hero.customDescription, defaultHero.customDescription!, 1200);
  const headlineLines = Array.isArray(hero.headlineLines) && hero.headlineLines.length === 2
    ? [text(hero.headlineLines[0], defaultHero.headlineLines![0], 180), text(hero.headlineLines[1], defaultHero.headlineLines![1], 180)] as [string, string]
    : [...defaultHero.headlineLines!] as [string, string];
  const resolveCta = (value: unknown, fallback: WorksPageCta): ResolvedWorksPageCms["hero"]["primaryCta"] => {
    const candidate = isRecord(value) ? value : {};
    return {
      enabled: bool(candidate.enabled, fallback.enabled!),
      label: text(candidate.label, fallback.label!, 80),
      link: safeLink(candidate.link, fallback.link ?? null),
    };
  };
  const resolveColor = (key: keyof NonNullable<WorksPageCmsConfig["colors"]>) =>
    resolveVisualColor(colors[key], defaultColors[key]!);

  return {
    schemaVersion: WORKS_PAGE_SCHEMA_VERSION,
    soldOutPresentation: resolveWorksSoldOutPresentation(root.soldOutPresentation),
    hero: {
      enabled: bool(hero.enabled, defaultHero.enabled!),
      eyebrowSource,
      eyebrow: eyebrowSource === "custom" ? customEyebrow : live.monthLabel,
      customEyebrow,
      headlineLines,
      descriptionSource,
      description: descriptionSource === "custom" ? customDescription : live.intro,
      customDescription,
      primaryCta: resolveCta(hero.primaryCta, defaultHero.primaryCta!),
      secondaryCta: resolveCta(hero.secondaryCta, defaultHero.secondaryCta!),
      desktopMedia: resolveMediaReference(hero.desktopMedia),
      mobileMedia: resolveMediaReference(hero.mobileMedia),
      overlayPreset: oneOf(hero.overlayPreset, WORKS_HERO_OVERLAY_PRESETS, defaultHero.overlayPreset!),
    },
    catalog: {
      introEnabled: bool(catalog.introEnabled, defaultCatalog.introEnabled!),
      countPrefix: text(catalog.countPrefix, defaultCatalog.countPrefix!, 80),
      countSuffix: text(catalog.countSuffix, defaultCatalog.countSuffix!, 80),
      helperText: text(catalog.helperText, defaultCatalog.helperText!, 500),
      emptyStateText: text(catalog.emptyStateText, defaultCatalog.emptyStateText!, 500),
      presentation: {
        showIndex: bool(presentation.showIndex, defaultPresentation.showIndex!),
        showArtist: bool(presentation.showArtist, defaultPresentation.showArtist!),
        showTag: bool(presentation.showTag, defaultPresentation.showTag!),
        showFlavors: bool(presentation.showFlavors, defaultPresentation.showFlavors!),
        showFacts: bool(presentation.showFacts, defaultPresentation.showFacts!),
        showCommerceSummary: bool(presentation.showCommerceSummary, defaultPresentation.showCommerceSummary!),
        cardPreset: oneOf(presentation.cardPreset, WORKS_CARD_PRESENTATION_PRESETS, defaultPresentation.cardPreset!),
      },
    },
    colors: {
      pageBackground: resolveColor("pageBackground"),
      heroBackground: resolveColor("heroBackground"),
      heroText: resolveColor("heroText"),
      heroSecondaryText: resolveColor("heroSecondaryText"),
      accent: resolveColor("accent"),
      primaryCtaBackground: resolveColor("primaryCtaBackground"),
      primaryCtaText: resolveColor("primaryCtaText"),
      catalogBackground: resolveColor("catalogBackground"),
      catalogText: resolveColor("catalogText"),
      cardSurface: resolveColor("cardSurface"),
      cardText: resolveColor("cardText"),
      border: resolveColor("border"),
    },
    motion: {
      hero: resolveMotion(motion.hero, false),
      heroMedia: resolveMotion(motion.heroMedia, false),
      catalogIntro: resolveMotion(motion.catalogIntro, true),
      productGrid: resolveMotion(motion.productGrid, true),
      cardHover: {
        enabled: bool(cardHover.enabled, defaultMotion.cardHover!.enabled!),
        preset: oneOf(cardHover.preset, WORKS_CARD_HOVER_PRESETS, defaultMotion.cardHover!.preset!),
        durationMs: numberInRange(cardHover.durationMs, defaultMotion.cardHover!.durationMs!, 100, 2_000),
      },
    },
    seo: {
      title: text(seo.title, defaultSeo.title!, 70),
      description: text(seo.description, defaultSeo.description!, 180),
      shareImage: resolveMediaReference(seo.shareImage, true),
    },
  };
}

/**
 * The public Works page consumes only these server-resolved, validated color
 * tokens. Keeping the bindings here makes the saved-config → public-style
 * path directly testable without accepting raw CSS from page data.
 */
export function resolveWorksPublicColorBindings(colors: ResolvedWorksPageCms["colors"]) {
  const variables = {
    "--works-page-background": visualColorHex(colors.pageBackground),
    "--works-hero-background": visualColorHex(colors.heroBackground),
    "--works-hero-text": visualColorHex(colors.heroText),
    "--works-hero-secondary-text": visualColorHex(colors.heroSecondaryText),
    "--works-accent": visualColorHex(colors.accent),
    "--works-primary-cta-background": visualColorHex(colors.primaryCtaBackground),
    "--works-primary-cta-text": visualColorHex(colors.primaryCtaText),
    "--works-catalog-background": visualColorHex(colors.catalogBackground),
    "--works-catalog-text": visualColorHex(colors.catalogText),
    "--works-card-surface": visualColorHex(colors.cardSurface),
    "--works-card-text": visualColorHex(colors.cardText),
    "--works-border": visualColorHex(colors.border),
  };
  return {
    root: { ...variables, backgroundColor: "var(--works-page-background)" },
    hero: { backgroundColor: "var(--works-hero-background)" },
    eyebrow: { color: "var(--works-accent)" },
    heroHeading: { color: "var(--works-hero-text)" },
    heroDescription: { color: "var(--works-hero-secondary-text)" },
    primaryCta: { backgroundColor: "var(--works-primary-cta-background)", color: "var(--works-primary-cta-text)" },
    catalog: { backgroundColor: "var(--works-catalog-background)", color: "var(--works-catalog-text)" },
    catalogHead: { color: "var(--works-catalog-text)", borderColor: "var(--works-border)" },
    card: { backgroundColor: "var(--works-card-surface)", color: "var(--works-card-text)", borderColor: "var(--works-border)" },
    cardText: { color: "var(--works-card-text)" },
    border: { borderColor: "var(--works-border)" },
    cardCta: { backgroundColor: "var(--works-primary-cta-background)", color: "var(--works-primary-cta-text)" },
    emptyState: { borderColor: "var(--works-border)", color: "var(--works-catalog-text)" },
  };
}

const PUBLIC_MOTION_CLASSES: Record<HomepageSectionMotion["preset"], string> = {
  none: "",
  fade: "works-motion works-motion-fade",
  "fade-up": "works-motion works-motion-fade-up",
  "slide-left": "works-motion works-motion-slide-left",
  "slide-right": "works-motion works-motion-slide-right",
  "scale-reveal": "works-motion works-motion-scale-reveal",
  editorial: "works-motion works-motion-editorial",
};

/** Public-only bindings for the already validated Works motion vocabulary. */
export function resolveWorksPublicMotionBindings(motion: ResolvedWorksPageCms["motion"]) {
  const entrance = (value: HomepageSectionMotion) => ({
    className: value.enabled ? PUBLIC_MOTION_CLASSES[value.preset] : "",
    style: value.enabled ? {
      "--works-motion-duration": `${value.durationMs}ms`,
      "--works-motion-delay": `${value.delayMs}ms`,
      "--works-motion-distance": `${value.distancePx}px`,
    } : undefined,
  });
  const grid = entrance(motion.productGrid);
  return {
    hero: entrance(motion.hero),
    heroMedia: entrance(motion.heroMedia),
    catalogIntro: entrance(motion.catalogIntro),
    productGrid: {
      ...grid,
      cardStyle(index: number) {
        if (!grid.style) return undefined;
        return { ...grid.style, animationDelay: `${motion.productGrid.delayMs + index * motion.productGrid.staggerMs}ms` };
      },
    },
    cardHover: motion.cardHover.enabled && motion.cardHover.preset === "current-scale"
      ? { className: "works-card-hover-current-scale", style: { "--works-card-hover-duration": `${motion.cardHover.durationMs}ms` } }
      : { className: "works-card-hover-none", style: undefined },
  };
}

function assertOnlyKeys(value: JsonRecord, allowed: readonly string[], label: string) {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`${label}包含不支援的欄位：${unknown}。`);
}

function validateOptionalText(value: unknown, label: string, maximum: number, required = false) {
  if (value === undefined) return;
  if (typeof value !== "string" || value.length > maximum || (required && !value.trim())) throw new Error(`${label}格式不正確。`);
}

function validateOptionalBoolean(value: unknown, label: string) {
  if (value !== undefined && typeof value !== "boolean") throw new Error(`${label}格式不正確。`);
}

function validateCta(value: unknown, label: string) {
  if (value === undefined) return;
  if (!isRecord(value)) throw new Error(`${label}格式不正確。`);
  assertOnlyKeys(value, ["enabled", "label", "link"], label);
  validateOptionalBoolean(value.enabled, `${label}顯示設定`);
  validateOptionalText(value.label, `${label}文字`, 80, true);
  if (value.link !== undefined) validateCmsLinkValue(value.link, label);
}

function validateMediaReference(value: unknown, label: string, shareImage = false) {
  if (value === undefined) return;
  if (!isRecord(value)) throw new Error(`${label}格式不正確。`);
  assertOnlyKeys(value, ["media", "alt"], label);
  if (!isMediaAsset(value.media) || !isSafeMediaUrl(value.media.url)) throw new Error(`${label}媒體格式或網址不安全。`);
  if (shareImage && value.media.type !== "image") throw new Error(`${label}必須是圖片。`);
  validateOptionalText(value.alt, `${label}替代文字`, 240, value.media.type === "image");
}

function validateMotion(value: unknown, label: string) {
  if (value === undefined) return;
  if (!isRecord(value)) throw new Error(`${label}格式不正確。`);
  assertOnlyKeys(value, ["enabled", "preset", "delayMs", "durationMs", "distancePx", "staggerMs", "triggerOnViewport"], label);
  validateOptionalBoolean(value.enabled, `${label}顯示設定`);
  validateOptionalBoolean(value.triggerOnViewport, `${label}滑入播放設定`);
  if (value.preset !== undefined && !(HOMEPAGE_MOTION_PRESETS as readonly unknown[]).includes(value.preset)) throw new Error(`${label}進場方式不支援。`);
  const ranges: Array<[string, number, number]> = [["delayMs", 0, 10_000], ["durationMs", 100, 5_000], ["distancePx", 0, 80], ["staggerMs", 0, 2_000]];
  for (const [key, minimum, maximum] of ranges) {
    const candidate = value[key];
    if (candidate !== undefined && (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate < minimum || candidate > maximum)) throw new Error(`${label}數值超出安全範圍。`);
  }
}

// Structural/read validation deliberately tolerates malformed soldOutPresentation.
// Every global Works save additionally calls validateWorksSoldOutPresentation.
export function validateWorksPageCms(value: unknown): value is WorksPageCmsConfig {
  if (!isRecord(value)) throw new Error("Works 頁面設定格式不正確。");
  assertOnlyKeys(value, ["schemaVersion", "hero", "catalog", "colors", "motion", "seo", "soldOutPresentation", "cardMarkers"], "Works 頁面設定");
  if (value.schemaVersion !== WORKS_PAGE_SCHEMA_VERSION) throw new Error("Works 頁面設定版本不支援。");

  if (value.hero !== undefined) {
    if (!isRecord(value.hero)) throw new Error("Works Hero 設定格式不正確。");
    const hero = value.hero;
    assertOnlyKeys(hero, ["enabled", "eyebrowSource", "customEyebrow", "headlineLines", "descriptionSource", "customDescription", "primaryCta", "secondaryCta", "desktopMedia", "mobileMedia", "overlayPreset"], "Works Hero 設定");
    validateOptionalBoolean(hero.enabled, "Works Hero 顯示設定");
    if (hero.eyebrowSource !== undefined && !(WORKS_CONTENT_SOURCES as readonly unknown[]).includes(hero.eyebrowSource)) throw new Error("Works Hero 小標來源不支援。");
    if (hero.descriptionSource !== undefined && !(WORKS_CONTENT_SOURCES as readonly unknown[]).includes(hero.descriptionSource)) throw new Error("Works Hero 說明來源不支援。");
    validateOptionalText(hero.customEyebrow, "Works Hero 自訂小標", 120);
    validateOptionalText(hero.customDescription, "Works Hero 自訂說明", 1200);
    if (hero.headlineLines !== undefined && (!Array.isArray(hero.headlineLines) || hero.headlineLines.length !== 2 || hero.headlineLines.some((line) => typeof line !== "string" || !line.trim() || line.length > 180))) throw new Error("Works Hero 標題必須是兩行有效文字。");
    validateCta(hero.primaryCta, "Works Hero 主要按鈕");
    validateCta(hero.secondaryCta, "Works Hero 次要按鈕");
    validateMediaReference(hero.desktopMedia, "Works Hero 桌機媒體");
    validateMediaReference(hero.mobileMedia, "Works Hero 手機媒體");
    if (hero.overlayPreset !== undefined && !(WORKS_HERO_OVERLAY_PRESETS as readonly unknown[]).includes(hero.overlayPreset)) throw new Error("Works Hero 遮罩樣式不支援。");
  }

  if (value.catalog !== undefined) {
    if (!isRecord(value.catalog)) throw new Error("Works 作品列表設定格式不正確。");
    const catalog = value.catalog;
    assertOnlyKeys(catalog, ["introEnabled", "countPrefix", "countSuffix", "helperText", "emptyStateText", "presentation"], "Works 作品列表設定");
    validateOptionalBoolean(catalog.introEnabled, "Works 作品列表說明顯示設定");
    validateOptionalText(catalog.countPrefix, "Works 作品數量前綴", 80);
    validateOptionalText(catalog.countSuffix, "Works 作品數量後綴", 80);
    validateOptionalText(catalog.helperText, "Works 作品列表說明", 500);
    validateOptionalText(catalog.emptyStateText, "Works 空白狀態說明", 500);
    if (catalog.presentation !== undefined) {
      if (!isRecord(catalog.presentation)) throw new Error("Works 商品卡顯示設定格式不正確。");
      const presentation = catalog.presentation;
      assertOnlyKeys(presentation, ["showIndex", "showArtist", "showTag", "showFlavors", "showFacts", "showCommerceSummary", "cardPreset"], "Works 商品卡顯示設定");
      for (const key of ["showIndex", "showArtist", "showTag", "showFlavors", "showFacts", "showCommerceSummary"]) validateOptionalBoolean(presentation[key], `Works 商品卡 ${key}`);
      if (presentation.cardPreset !== undefined && !(WORKS_CARD_PRESENTATION_PRESETS as readonly unknown[]).includes(presentation.cardPreset)) throw new Error("Works 商品卡樣式不支援。");
    }
  }

  if (value.colors !== undefined) {
    if (!isRecord(value.colors)) throw new Error("Works 色彩設定格式不正確。");
    const colorKeys = ["pageBackground", "heroBackground", "heroText", "heroSecondaryText", "accent", "primaryCtaBackground", "primaryCtaText", "catalogBackground", "catalogText", "cardSurface", "cardText", "border"] as const;
    assertOnlyKeys(value.colors, colorKeys, "Works 色彩設定");
    for (const key of colorKeys) if (value.colors[key] !== undefined && resolveVisualColor(value.colors[key], "#000000") !== value.colors[key]) throw new Error(`Works ${key} 顏色不安全。`);
  }

  if (value.motion !== undefined) {
    if (!isRecord(value.motion)) throw new Error("Works 動畫設定格式不正確。");
    const motion = value.motion;
    assertOnlyKeys(motion, ["hero", "heroMedia", "catalogIntro", "productGrid", "cardHover"], "Works 動畫設定");
    validateMotion(motion.hero, "Works Hero 動畫");
    validateMotion(motion.heroMedia, "Works Hero 媒體動畫");
    validateMotion(motion.catalogIntro, "Works 列表說明動畫");
    validateMotion(motion.productGrid, "Works 商品網格動畫");
    if (motion.cardHover !== undefined) {
      if (!isRecord(motion.cardHover)) throw new Error("Works 商品卡 hover 設定格式不正確。");
      assertOnlyKeys(motion.cardHover, ["enabled", "preset", "durationMs"], "Works 商品卡 hover 設定");
      validateOptionalBoolean(motion.cardHover.enabled, "Works 商品卡 hover 開關");
      if (motion.cardHover.preset !== undefined && !(WORKS_CARD_HOVER_PRESETS as readonly unknown[]).includes(motion.cardHover.preset)) throw new Error("Works 商品卡 hover 樣式不支援。");
      const duration = motion.cardHover.durationMs;
      if (duration !== undefined && (typeof duration !== "number" || !Number.isFinite(duration) || duration < 100 || duration > 2_000)) throw new Error("Works 商品卡 hover 時間超出安全範圍。");
    }
  }

  if (value.seo !== undefined) {
    if (!isRecord(value.seo)) throw new Error("Works SEO 設定格式不正確。");
    assertOnlyKeys(value.seo, ["title", "description", "shareImage"], "Works SEO 設定");
    validateOptionalText(value.seo.title, "Works SEO 標題", 70);
    validateOptionalText(value.seo.description, "Works SEO 說明", 180);
    validateMediaReference(value.seo.shareImage, "Works SEO 分享圖片", true);
  }
  return true;
}
