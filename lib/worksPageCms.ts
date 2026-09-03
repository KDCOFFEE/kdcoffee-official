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

export function validateWorksPageCms(value: unknown): value is WorksPageCmsConfig {
  if (!isRecord(value)) throw new Error("Works 頁面設定格式不正確。");
  assertOnlyKeys(value, ["schemaVersion", "hero", "catalog", "colors", "motion", "seo"], "Works 頁面設定");
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
