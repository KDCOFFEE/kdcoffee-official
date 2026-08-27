import type { MediaAsset } from "./media.ts";
// @ts-expect-error -- see above.
import { isMediaAsset } from "./media.ts";
import type { CmsLinkValue, PublishedCmsPage } from "./cmsLinks.ts";
// @ts-expect-error -- see above.
import { validateCmsLinkValue } from "./cmsLinks.ts";
import type { HomepageSectionMotion } from "./homepageCms.ts";
// @ts-expect-error -- see above.
import { HOMEPAGE_MOTION_PRESETS } from "./homepageCms.ts";
import type { HeroPlaybackMode, PageBuilderBlockVisualStyle, WebsiteVisualStyle } from "./pageBuilderVisualStyle.ts";
// @ts-expect-error -- see above.
import { HERO_PLAYBACK_MODES, validateBlockVisualStyle, validateWebsiteVisualStyle } from "./pageBuilderVisualStyle.ts";

export const PAGE_SECTION_TYPES = ["hero", "text", "mediaText", "gallery", "products", "features", "cta"] as const;
export type PageSectionType = (typeof PAGE_SECTION_TYPES)[number];
export type PageStatus = "draft" | "published" | "unpublished";
export type CtaStylePreset = "primary" | "secondary" | "text";
export const PAGE_PRESENTATION_PRESETS = [
  "hero-cinematic", "hero-editorial", "hero-campaign", "hero-minimal", "hero-media-first",
  "story-left", "story-right", "story-stacked", "story-immersive", "story-offset",
  "gallery-grid", "gallery-feature", "gallery-rail", "gallery-filmstrip", "gallery-editorial",
  "products-featured", "products-rail", "products-campaign", "products-compact",
  "features-numbered", "features-statement", "features-three", "features-luxury",
  "cta-editorial", "cta-dark", "cta-compact", "cta-campaign",
  "text-editorial", "text-statement",
] as const;
export type PagePresentationPreset = (typeof PAGE_PRESENTATION_PRESETS)[number];
export const PAGE_MOBILE_MEDIA_LAYOUTS = ["text-first","media-first","media-full","compact"] as const;
export type PageMobileMediaLayout = (typeof PAGE_MOBILE_MEDIA_LAYOUTS)[number];

export type PageBuilderCta = { id: string; enabled: boolean; label: string; stylePreset: CtaStylePreset; link: CmsLinkValue };
export type PageBuilderMedia = { id: string; enabled: boolean; media: MediaAsset; alt: string; title?: string };
export type PageBuilderItem = { id: string; enabled: boolean; title: string; body: string; media?: MediaAsset };
export type PageBuilderProduct = { id: string; enabled: boolean; productSlug: string };

export type PageBuilderSection = {
  id: string;
  type: PageSectionType;
  enabled: boolean;
  eyebrow: string;
  title: string;
  headlineLine2?: string;
  body: string;
  theme: "warm" | "dark" | "media";
  layout: "media-left" | "media-right" | "media-top" | "grid" | "filmstrip";
  /** Additive presentation choice. Older pages resolve through safe premium defaults. */
  presentation?: PagePresentationPreset;
  /** Independent controlled mobile composition for Media + Text. */
  mobileMediaLayout?: PageMobileMediaLayout;
  /** Optional for backward compatibility. Existing Hero videos resolve to click-to-play. */
  playbackMode?: HeroPlaybackMode;
  /** Optional controlled overrides. Absence means inherit the website visual style. */
  visualStyle?: PageBuilderBlockVisualStyle;
  ctas: PageBuilderCta[];
  media: PageBuilderMedia[];
  items: PageBuilderItem[];
  products: PageBuilderProduct[];
  motion: HomepageSectionMotion;
};

export type PageDraft = { title: string; seoTitle: string; seoDescription: string; sections: PageBuilderSection[] };
export type PageRecord = {
  id: string;
  slug: string;
  type: "campaign";
  status: PageStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  draft: PageDraft;
  publishedSnapshot?: PageDraft;
};
export type PageStore = { version: number; updatedAt: string; visualStyle?: WebsiteVisualStyle; pages: PageRecord[] };

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{5,80}$/u;
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])?$/u;
const RESERVED_SLUGS = new Set(["admin", "api", "member", "cart", "works", "uploads", "images", "monthly-menu"]);
const CTA_STYLES = new Set<CtaStylePreset>(["primary", "secondary", "text"]);

export const DEFAULT_PAGE_MOTION: HomepageSectionMotion = { enabled: true, preset: "fade-up", delayMs: 0, durationMs: 800, distancePx: 18, staggerMs: 100 };

export function newBuilderId(prefix: string) {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

export function createSection(type: PageSectionType): PageBuilderSection {
  const defaults: Partial<Record<PageSectionType, PagePresentationPreset>> = { hero: "hero-cinematic", text: "text-editorial", mediaText: "story-left", gallery: "gallery-feature", products: "products-featured", features: "features-numbered", cta: "cta-dark" };
  return { id: newBuilderId("section"), type, enabled: true, eyebrow: "", title: "", body: "", theme: type === "hero" ? "dark" : "warm", layout: type === "gallery" ? "filmstrip" : "media-left", presentation: defaults[type], playbackMode: type === "hero" ? "click-to-play" : undefined, ctas: [], media: [], items: [], products: [], motion: { ...DEFAULT_PAGE_MOTION } };
}

export function resolveSectionPresentation(section: Pick<PageBuilderSection, "type" | "layout" | "presentation" | "media" | "theme">): PagePresentationPreset {
  if (section.presentation && (PAGE_PRESENTATION_PRESETS as readonly string[]).includes(section.presentation)) return section.presentation;
  if (section.type === "hero") return section.media?.some((item) => item.enabled !== false) ? "hero-cinematic" : "hero-minimal";
  if (section.type === "mediaText") return section.layout === "media-right" ? "story-right" : section.layout === "media-top" ? "story-stacked" : "story-left";
  if (section.type === "gallery") return section.layout === "grid" ? "gallery-grid" : "gallery-rail";
  if (section.type === "products") return "products-featured";
  if (section.type === "features") return "features-numbered";
  if (section.type === "cta") return section.theme === "dark" ? "cta-dark" : "cta-editorial";
  return "text-editorial";
}

export function resolveMobileMediaLayout(section: Pick<PageBuilderSection,"type"|"mobileMediaLayout">): PageMobileMediaLayout {
  if(section.type!=="mediaText")return "text-first";
  return section.mobileMediaLayout&&(PAGE_MOBILE_MEDIA_LAYOUTS as readonly string[]).includes(section.mobileMediaLayout)?section.mobileMediaLayout:"text-first";
}

function createSlug(now: Date, existing: Set<string>) {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = `story-${date}-${globalThis.crypto.randomUUID().slice(0, 6)}`;
    if (!existing.has(slug)) return slug;
  }
  return `story-${crypto.randomUUID()}`;
}

export function createPage(title: string, pages: PageRecord[], now = new Date()): PageRecord {
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.length > 120) throw new Error("頁面名稱必須是 1–120 個字元。");
  const iso = now.toISOString();
  return { id: newBuilderId("page"), slug: createSlug(now, new Set(pages.map((page) => page.slug))), type: "campaign", status: "draft", createdAt: iso, updatedAt: iso, draft: { title: cleanTitle, seoTitle: "", seoDescription: "", sections: [] } };
}

function assertString(value: unknown, label: string, max: number, required = false) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new Error(`${label}格式不正確。`);
}
function assertId(value: unknown, label: string) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new Error(`${label}格式不正確。`);
}
function assertUniqueIds(values: Array<{ id: string }>, label: string) {
  const ids = new Set<string>();
  for (const value of values) { assertId(value.id, `${label}識別資料`); if (ids.has(value.id)) throw new Error(`${label}識別資料重複。`); ids.add(value.id); }
}
function validateMotion(value: HomepageSectionMotion, label: string) {
  if (!value || typeof value !== "object" || typeof value.enabled !== "boolean" || !(HOMEPAGE_MOTION_PRESETS as readonly string[]).includes(value.preset)) throw new Error(`${label}動畫設定不正確。`);
  const ranges: Array<[keyof HomepageSectionMotion, number, number]> = [["delayMs",0,10000],["durationMs",100,10000],["distancePx",0,160],["staggerMs",0,2000]];
  for (const [key,min,max] of ranges) if (!Number.isFinite(value[key]) || Number(value[key]) < min || Number(value[key]) > max) throw new Error(`${label}動畫時間或距離超出安全範圍。`);
}

export function validatePageDraft(value: PageDraft, productSlugs?: Set<string>, allowUnknownSections = false) {
  if (!value || typeof value !== "object" || !Array.isArray(value.sections)) throw new Error("頁面草稿格式不完整。");
  assertString(value.title, "頁面名稱", 120, true); assertString(value.seoTitle, "SEO 標題", 70); assertString(value.seoDescription, "SEO 說明", 180);
  if (value.sections.length > 50) throw new Error("每頁最多 50 個區塊。");
  assertUniqueIds(value.sections, "區塊");
  for (const [sectionIndex, section] of value.sections.entries()) {
    const label = `第 ${sectionIndex + 1} 個區塊`;
    if (!(PAGE_SECTION_TYPES as readonly string[]).includes(section.type)) { if (allowUnknownSections) continue; throw new Error(`${label}類型不受支援。`); }
    if (typeof section.enabled !== "boolean") throw new Error(`${label}顯示狀態不正確。`);
    if (section.presentation !== undefined && !(PAGE_PRESENTATION_PRESETS as readonly string[]).includes(section.presentation)) throw new Error(`${label}版型設定不正確。`);
    if (section.mobileMediaLayout !== undefined && !(PAGE_MOBILE_MEDIA_LAYOUTS as readonly string[]).includes(section.mobileMediaLayout)) throw new Error(`${label}手機圖文版型設定不正確。`);
    if (section.playbackMode !== undefined && !(HERO_PLAYBACK_MODES as readonly string[]).includes(section.playbackMode)) throw new Error(`${label}影片播放方式不正確。`);
    validateBlockVisualStyle(section.visualStyle);
    assertString(section.eyebrow, `${label}小標`, 100); assertString(section.title, `${label}標題`, 180); assertString(section.headlineLine2 || "", `${label}第二行標題`, 180); assertString(section.body, `${label}內容`, 5000);
    if (!Array.isArray(section.ctas) || section.ctas.length > 4) throw new Error(`${label}最多 4 個按鈕。`);
    assertUniqueIds(section.ctas, `${label}按鈕`);
    for (const [index, cta] of section.ctas.entries()) { if (typeof cta.enabled !== "boolean" || !CTA_STYLES.has(cta.stylePreset)) throw new Error(`${label}按鈕設定不正確。`); assertString(cta.label, `${label}第 ${index + 1} 個按鈕文字`, 80, true); validateCmsLinkValue(cta.link, `${label}第 ${index + 1} 個按鈕`); }
    if (!Array.isArray(section.media) || section.media.length > 30) throw new Error(`${label}最多 30 個媒體。`);
    assertUniqueIds(section.media, `${label}媒體`);
    for (const item of section.media) { if (typeof item.enabled !== "boolean" || !isMediaAsset(item.media)) throw new Error(`${label}媒體格式不正確。`); assertString(item.alt, `${label}媒體替代文字`, 240); assertString(item.title || "", `${label}媒體標題`, 180); }
    if (!Array.isArray(section.items) || section.items.length > 30) throw new Error(`${label}最多 30 個項目。`);
    assertUniqueIds(section.items, `${label}項目`);
    for (const item of section.items) { if (typeof item.enabled !== "boolean") throw new Error(`${label}項目顯示狀態不正確。`); assertString(item.title, `${label}項目標題`, 180, true); assertString(item.body, `${label}項目內容`, 1000); if (item.media && !isMediaAsset(item.media)) throw new Error(`${label}項目媒體格式不正確。`); }
    if (!Array.isArray(section.products) || section.products.length > 6) throw new Error(`${label}最多 6 個商品。`);
    assertUniqueIds(section.products, `${label}商品`);
    for (const item of section.products) { if (typeof item.enabled !== "boolean" || typeof item.productSlug !== "string" || !item.productSlug) throw new Error(`${label}商品設定不正確。`); if (productSlugs && !productSlugs.has(item.productSlug)) throw new Error(`${label}引用了不存在的商品。`); }
    validateMotion(section.motion, label);
  }
}

export function validatePageStore(store: PageStore) {
  if (!store || typeof store !== "object" || !Number.isInteger(store.version) || !Array.isArray(store.pages)) throw new Error("頁面資料庫格式不正確。");
  if (store.visualStyle !== undefined) validateWebsiteVisualStyle(store.visualStyle);
  assertUniqueIds(store.pages, "頁面");
  const slugs = new Set<string>();
  for (const page of store.pages) {
    if (!SLUG_PATTERN.test(page.slug) || RESERVED_SLUGS.has(page.slug) || slugs.has(page.slug)) throw new Error("頁面網址設定不安全或重複。");
    slugs.add(page.slug);
    if (!["draft","published","unpublished"].includes(page.status)) throw new Error("頁面狀態不正確。");
    validatePageDraft(page.draft, undefined, true); if (page.publishedSnapshot) validatePageDraft(page.publishedSnapshot, undefined, true);
  }
}

export function publishedPageRegistry(store: PageStore): PublishedCmsPage[] {
  return store.pages.map((page) => ({ id: page.id, title: page.draft.title, href: `/pages/${page.slug}`, published: page.status === "published" && Boolean(page.publishedSnapshot) }));
}

function renewNestedIds(section: PageBuilderSection): PageBuilderSection {
  return { ...structuredClone(section), id: newBuilderId("section"), ctas: section.ctas.map((item) => ({ ...structuredClone(item), id: newBuilderId("cta") })), media: section.media.map((item) => ({ ...structuredClone(item), id: newBuilderId("media") })), items: section.items.map((item) => ({ ...structuredClone(item), id: newBuilderId("item") })), products: section.products.map((item) => ({ ...structuredClone(item), id: newBuilderId("product") })) };
}
export function duplicateSection(section: PageBuilderSection) { return renewNestedIds(section); }
export function duplicatePage(source: PageRecord, pages: PageRecord[], now = new Date()) {
  const page = createPage(`${source.draft.title}（複製）`, pages, now);
  page.draft = { ...structuredClone(source.draft), title: page.draft.title, sections: source.draft.sections.map(renewNestedIds) };
  return page;
}

export function pageReferenceCount(value: unknown, pageId: string): number {
  if (Array.isArray(value)) { let total = 0; for (const item of value) total += pageReferenceCount(item, pageId); return total; }
  if (!value || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  let total = record.type === "page" && record.target === pageId ? 1 : 0;
  for (const item of Object.values(record)) total += pageReferenceCount(item, pageId);
  return total;
}
