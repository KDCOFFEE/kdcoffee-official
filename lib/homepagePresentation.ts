import type { HomepageSectionMotion } from "./homepageCms.ts";
import type { VisualAlignmentPreset, VisualColorValue, VisualWeightPreset } from "./pageBuilderVisualStyle.ts";

/** CMS Presentation only; legacy layout/media boundaries remain independent.
 * Keep app/globals.css H3.4B media query synchronized via the runtime tests. */
export const HOMEPAGE_PRESENTATION_MOBILE_MAX_PX = 600 as const;

export const HOMEPAGE_PRESENTATION_SECTION_KEYS = ["hero", "campaignSection", "home002", "home003", "home004", "home005", "home006", "home007", "home008", "home009", "home010"] as const;
export const HOMEPAGE_TEXT_SLOTS = ["eyebrow", "title", "intro", "body", "closing", "cta", "cardTitle", "cardBody", "metadata"] as const;
export const HOMEPAGE_PRESENTATION_PRESETS = ["legacy", "compact", "comfortable", "editorial"] as const;
export const HOMEPAGE_BACKGROUND_MODES = ["legacy", "none", "color"] as const;

export type HomepagePresentationKey = (typeof HOMEPAGE_PRESENTATION_SECTION_KEYS)[number];
export type HomepageTextSlot = (typeof HOMEPAGE_TEXT_SLOTS)[number];
export type HomepagePresentationPreset = (typeof HOMEPAGE_PRESENTATION_PRESETS)[number];
export type HomepagePresentationViewport = "desktop" | "mobile";

export type HomepageTextPresentation = {
  fontSizePx?: number;
  fontWeight?: VisualWeightPreset;
  color?: VisualColorValue;
  lineHeight?: number;
  letterSpacingEm?: number;
  alignment?: VisualAlignmentPreset;
  maxWidthCh?: number;
};

export type HomepagePresentationPatch = {
  text?: Partial<Record<HomepageTextSlot, HomepageTextPresentation>>;
  layout?: {
    contentMaxWidthPx?: number;
    paddingTopPx?: number;
    paddingBottomPx?: number;
  };
  background?: {
    mode?: (typeof HOMEPAGE_BACKGROUND_MODES)[number];
    color?: VisualColorValue;
  };
  visible?: boolean;
  animation?: Partial<HomepageSectionMotion>;
};

export type HomepageSectionPresentation = {
  preset?: HomepagePresentationPreset;
  base?: HomepagePresentationPatch;
  mobile?: {
    overrideEnabled: boolean;
    overrides?: HomepagePresentationPatch;
  };
};

export type HomepagePresentationV3 = {
  schemaVersion: 3;
  sections?: Partial<Record<HomepagePresentationKey, HomepageSectionPresentation>>;
};

/** Only explicit CMS data; preset is metadata, not expanded style defaults.
 * visible is presentation-only: a future renderer must ALSO honor section.enabled.
 */
export type ResolvedHomepageSectionPresentation = HomepagePresentationPatch & {
  preset?: HomepagePresentationPreset;
};

// Font size spans the existing Page Builder role bounds (10-120px).
// Layout/reading bounds are Homepage limits around the current 1200px content,
// 34ch mobile lead and 52-150px section spacing; they do not generate defaults.
// Motion bounds/100ms steps match validateSectionMotion in homepageCms.ts.
export const HOMEPAGE_PRESENTATION_NUMBER_RULES = {
  fontSizePx: { min: 10, max: 120, step: 1 },
  lineHeight: { min: 1, max: 2.5 },
  letterSpacingEm: { min: -0.1, max: 0.3 },
  maxWidthCh: { min: 10, max: 120, step: 1 },
  contentMaxWidthPx: { min: 240, max: 1920, step: 1 },
  paddingTopPx: { min: 0, max: 240, step: 1 },
  paddingBottomPx: { min: 0, max: 240, step: 1 },
  delayMs: { min: 0, max: 10000, step: 100 },
  durationMs: { min: 100, max: 5000, step: 100 },
  distancePx: { min: 0, max: 80, step: 1 },
  staggerMs: { min: 0, max: 2000, step: 100 },
} as const;

// These are flat, validated leaf objects, never arbitrary recursive CMS objects.
function mergeLeaves<T extends object>(base: T | undefined, overrides: T | undefined): T | undefined {
  const entries = [base, overrides].flatMap((value) => value === undefined
    ? [] : Object.entries(value).filter(([, leaf]) => leaf !== undefined));
  return entries.length ? Object.fromEntries(entries) as T : undefined;
}

/** Resolve validated presentation data without viewport detection, input writes,
 * CSS defaults, preset expansion, or legacy animation normalization.
 */
export function resolveHomepageSectionPresentation(
  presentation: HomepagePresentationV3 | undefined,
  sectionKey: HomepagePresentationKey,
  viewport: HomepagePresentationViewport,
): ResolvedHomepageSectionPresentation {
  const section = presentation?.sections?.[sectionKey];
  if (section === undefined) return {};
  const base = section.base;
  const overrides = viewport === "mobile" && section.mobile?.overrideEnabled === true
    ? section.mobile.overrides : undefined;
  const resolved: ResolvedHomepageSectionPresentation = {};
  if (section.preset !== undefined) resolved.preset = section.preset;
  const text: NonNullable<HomepagePresentationPatch["text"]> = {};
  for (const slot of HOMEPAGE_TEXT_SLOTS) {
    const leaves = mergeLeaves(base?.text?.[slot], overrides?.text?.[slot]);
    if (leaves !== undefined) text[slot] = leaves;
  }
  if (Object.keys(text).length) resolved.text = text;
  const layout = mergeLeaves(base?.layout, overrides?.layout);
  if (layout !== undefined) resolved.layout = layout;
  const background = mergeLeaves(base?.background, overrides?.background);
  if (background !== undefined) resolved.background = background;
  const animation = mergeLeaves(base?.animation, overrides?.animation);
  if (animation !== undefined) resolved.animation = animation;
  const visible = overrides?.visible !== undefined ? overrides.visible : base?.visible;
  if (visible !== undefined) resolved.visible = visible;
  return resolved;
}

// H3.3A: actual semantic targets in HomepageV3 / MonthlyCampaign.
// A global schema slot is not automatically a supported target in every section.
export const HOMEPAGE_SECTION_CAPABILITIES = {
  hero: ["eyebrow", "title", "intro", "cta", "metadata"],
  campaignSection: ["eyebrow", "title", "intro", "body", "cardTitle", "cardBody", "cta", "metadata"],
  home002: ["title", "intro", "cardTitle", "cardBody", "closing", "metadata"],
  home003: ["title", "intro", "eyebrow", "cardTitle", "cardBody", "cta"],
  home004: ["title", "intro", "cardTitle", "cardBody", "cta"],
  home005: ["title", "intro", "cardTitle", "cardBody", "metadata"],
  home006: ["title", "body", "cta", "metadata"],
  home007: ["title", "body", "cardTitle", "cardBody"],
  home008: ["title", "body"],
  home009: ["title", "intro", "cardBody", "metadata"],
  home010: ["title", "body", "cta"],
} as const satisfies Record<HomepagePresentationKey, readonly HomepageTextSlot[]>;
