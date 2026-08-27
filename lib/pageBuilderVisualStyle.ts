import type { CSSProperties } from "react";

export const VISUAL_FONT_PRESETS = ["elegant", "modern", "premium", "clean"] as const;
export const VISUAL_SCALE_PRESETS = ["small", "medium", "large", "xlarge"] as const;
export const VISUAL_WEIGHT_PRESETS = ["light", "regular", "semibold", "bold"] as const;
export const VISUAL_TRACKING_PRESETS = ["tight", "normal", "wide"] as const;
export const VISUAL_LINE_HEIGHT_PRESETS = ["compact", "normal", "relaxed"] as const;
export const VISUAL_ALIGNMENT_PRESETS = ["left", "center", "right"] as const;
export const VISUAL_WRAP_MODES = ["auto", "single", "two-lines", "manual"] as const;
export const VISUAL_TEXT_WIDTHS = ["narrow", "standard", "wide", "full"] as const;
export const HERO_PLAYBACK_MODES = ["click-to-play", "autoplay-loop"] as const;
export const VISUAL_COLOR_PRESETS = ["ink", "coffee", "warm-gray", "ivory", "gold", "white"] as const;

export type VisualFontPreset = (typeof VISUAL_FONT_PRESETS)[number];
export type VisualScalePreset = (typeof VISUAL_SCALE_PRESETS)[number];
export type VisualWeightPreset = (typeof VISUAL_WEIGHT_PRESETS)[number];
export type VisualTrackingPreset = (typeof VISUAL_TRACKING_PRESETS)[number];
export type VisualLineHeightPreset = (typeof VISUAL_LINE_HEIGHT_PRESETS)[number];
export type VisualAlignmentPreset = (typeof VISUAL_ALIGNMENT_PRESETS)[number];
export type VisualWrapMode = (typeof VISUAL_WRAP_MODES)[number];
export type VisualTextWidth = (typeof VISUAL_TEXT_WIDTHS)[number];
export type HeroPlaybackMode = (typeof HERO_PLAYBACK_MODES)[number];
export type VisualColorPreset = (typeof VISUAL_COLOR_PRESETS)[number];
export type VisualColorValue = VisualColorPreset | `#${string}`;

export type WebsiteVisualStyle = {
  version: 1;
  headingFont: VisualFontPreset;
  bodyFont: VisualFontPreset;
  englishHeadingFont: VisualFontPreset;
  headingScale: VisualScalePreset;
  secondaryHeadingScale: VisualScalePreset;
  bodyScale: VisualScalePreset;
  eyebrowScale: VisualScalePreset;
  headingWeight: VisualWeightPreset;
  letterSpacing: VisualTrackingPreset;
  lineHeight: VisualLineHeightPreset;
  autoResponsive: boolean;
  desktopHeadingScale: VisualScalePreset;
  mobileHeadingScale: VisualScalePreset;
  headingDesktopPx: number;
  headingMobilePx: number;
  secondaryHeadingDesktopPx: number;
  secondaryHeadingMobilePx: number;
  bodyDesktopPx: number;
  bodyMobilePx: number;
  eyebrowDesktopPx: number;
  eyebrowMobilePx: number;
  headingWrap: VisualWrapMode;
  headingWidth: VisualTextWidth;
  secondaryHeadingWrap: VisualWrapMode;
  secondaryHeadingWidth: VisualTextWidth;
  alignment: VisualAlignmentPreset;
  colors: {
    primaryText: VisualColorValue;
    secondaryText: VisualColorValue;
    accent: VisualColorValue;
    lightSurface: VisualColorValue;
    darkSurface: VisualColorValue;
    onDark: VisualColorValue;
    primaryButton: VisualColorValue;
    primaryButtonText: VisualColorValue;
    secondaryButton: VisualColorValue;
  };
};

export type PageBuilderBlockVisualStyle = Partial<Pick<WebsiteVisualStyle,
  "headingFont" | "bodyFont" | "headingScale" | "secondaryHeadingScale" | "bodyScale" |
  "headingWeight" | "letterSpacing" | "lineHeight"
>> & {
  alignment?: VisualAlignmentPreset;
  headingDesktopPx?: number;
  headingMobilePx?: number;
  bodyDesktopPx?: number;
  bodyMobilePx?: number;
  headingWrap?: VisualWrapMode;
  headingWidth?: VisualTextWidth;
  headingColor?: VisualColorValue;
  bodyColor?: VisualColorValue;
  accentColor?: VisualColorValue;
  primaryButton?: VisualColorValue;
  primaryButtonText?: VisualColorValue;
};

export const DEFAULT_WEBSITE_VISUAL_STYLE: WebsiteVisualStyle = {
  version: 1,
  headingFont: "elegant",
  bodyFont: "modern",
  englishHeadingFont: "premium",
  headingScale: "large",
  secondaryHeadingScale: "large",
  bodyScale: "medium",
  eyebrowScale: "medium",
  headingWeight: "regular",
  letterSpacing: "normal",
  lineHeight: "normal",
  autoResponsive: true,
  desktopHeadingScale: "large",
  mobileHeadingScale: "medium",
  headingDesktopPx: 76,
  headingMobilePx: 42,
  secondaryHeadingDesktopPx: 52,
  secondaryHeadingMobilePx: 34,
  bodyDesktopPx: 16,
  bodyMobilePx: 16,
  eyebrowDesktopPx: 12,
  eyebrowMobilePx: 11,
  headingWrap: "auto",
  headingWidth: "wide",
  secondaryHeadingWrap: "auto",
  secondaryHeadingWidth: "standard",
  alignment: "left",
  colors: {
    primaryText: "ink",
    secondaryText: "warm-gray",
    accent: "gold",
    lightSurface: "ivory",
    darkSurface: "coffee",
    onDark: "white",
    primaryButton: "ink",
    primaryButtonText: "white",
    secondaryButton: "gold",
  },
};

export const VISUAL_COLOR_HEX: Record<VisualColorPreset, string> = {
  ink: "#2b211b",
  coffee: "#1c1714",
  "warm-gray": "#6f6259",
  ivory: "#f6f0e7",
  gold: "#b7905a",
  white: "#fff8ef",
};

const fontStacks: Record<VisualFontPreset, string> = {
  elegant: '"Noto Serif TC","PMingLiU",serif',
  modern: '"Noto Sans TC","Microsoft JhengHei",sans-serif',
  premium: 'Georgia,"Noto Serif TC","PMingLiU",serif',
  clean: 'Arial,"Noto Sans TC","Microsoft JhengHei",sans-serif',
};
const h1Scale: Record<VisualScalePreset, string> = { small: "clamp(2.8rem,5vw,4.7rem)", medium: "clamp(3.3rem,6.4vw,6rem)", large: "clamp(3.8rem,7.6vw,7.4rem)", xlarge: "clamp(4.2rem,9vw,8.8rem)" };
const h2Scale: Record<VisualScalePreset, string> = { small: "clamp(2rem,3.5vw,3.4rem)", medium: "clamp(2.35rem,4.5vw,4.3rem)", large: "clamp(2.75rem,5.4vw,5.2rem)", xlarge: "clamp(3.1rem,6.2vw,6.1rem)" };
const bodyScale: Record<VisualScalePreset, string> = { small: ".9rem", medium: "1rem", large: "1.1rem", xlarge: "1.2rem" };
const eyebrowScale: Record<VisualScalePreset, string> = { small: ".62rem", medium: ".7rem", large: ".78rem", xlarge: ".86rem" };
const weight: Record<VisualWeightPreset, number> = { light: 400, regular: 500, semibold: 600, bold: 700 };
const tracking: Record<VisualTrackingPreset, string> = { tight: "-.035em", normal: "-.015em", wide: ".035em" };
const lineHeight: Record<VisualLineHeightPreset, number> = { compact: 1.55, normal: 1.78, relaxed: 2 };
const headingLineHeight: Record<VisualLineHeightPreset, number> = { compact: 1.02, normal: 1.08, relaxed: 1.18 };
const textWidth: Record<VisualTextWidth,string> = { narrow: "52%", standard: "70%", wide: "86%", full: "100%" };
const contentJustify: Record<VisualAlignmentPreset,string> = { left: "flex-start", center: "center", right: "flex-end" };

export const TYPOGRAPHY_SIZE_RANGES = {
  heading: { desktop: [28,120], mobile: [24,64] },
  secondaryHeading: { desktop: [24,72], mobile: [22,48] },
  body: { desktop: [14,28], mobile: [14,24] },
  eyebrow: { desktop: [10,24], mobile: [10,20] },
} as const;
export const TYPOGRAPHY_SIZE_PRESETS = {
  heading: { small: [48,30], medium: [64,36], large: [76,42], xlarge: [96,54] },
  secondaryHeading: { small: [32,26], medium: [42,30], large: [52,34], xlarge: [64,42] },
  body: { small: [14,14], medium: [16,16], large: [18,18], xlarge: [21,20] },
  eyebrow: { small: [10,10], medium: [12,11], large: [15,13], xlarge: [18,16] },
} as const;
export type TypographyRole = keyof typeof TYPOGRAPHY_SIZE_RANGES;
export function clampTypographySize(role:TypographyRole,device:"desktop"|"mobile",value:unknown) {
  const [min,max]=TYPOGRAPHY_SIZE_RANGES[role][device];
  const numeric=typeof value==="number"&&Number.isFinite(value)?Math.round(value):min;
  return Math.min(max,Math.max(min,numeric));
}
export function typographyPresetFor(role:TypographyRole,desktop:number,mobile:number):VisualScalePreset|"custom" {
  const match=Object.entries(TYPOGRAPHY_SIZE_PRESETS[role]).find(([,pair])=>pair[0]===desktop&&pair[1]===mobile);
  return match ? match[0] as VisualScalePreset : "custom";
}

function oneOf<T extends readonly string[]>(value: unknown, values: T, fallback: T[number]): T[number] {
  return typeof value === "string" && values.includes(value) ? value as T[number] : fallback;
}
export function resolveVisualColor(value: unknown, fallback: VisualColorValue): VisualColorValue {
  if (typeof value === "string" && (VISUAL_COLOR_PRESETS as readonly string[]).includes(value)) return value as VisualColorPreset;
  if (typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value)) return value.toLowerCase() as `#${string}`;
  return fallback;
}
export function visualColorHex(value: VisualColorValue) { return value.startsWith("#") ? value : VISUAL_COLOR_HEX[value as VisualColorPreset]; }

export function resolveWebsiteVisualStyle(value?: Partial<WebsiteVisualStyle> | null): WebsiteVisualStyle {
  const fallback = DEFAULT_WEBSITE_VISUAL_STYLE;
  const colors = value?.colors || fallback.colors;
  const headingScaleValue=oneOf(value?.headingScale,VISUAL_SCALE_PRESETS,fallback.headingScale);
  const desktopHeadingScaleValue=value?.autoResponsive===false?oneOf(value?.desktopHeadingScale,VISUAL_SCALE_PRESETS,fallback.desktopHeadingScale):headingScaleValue;
  const mobileHeadingScaleValue=value?.autoResponsive===false?oneOf(value?.mobileHeadingScale,VISUAL_SCALE_PRESETS,fallback.mobileHeadingScale):headingScaleValue;
  const secondaryHeadingScaleValue=oneOf(value?.secondaryHeadingScale,VISUAL_SCALE_PRESETS,fallback.secondaryHeadingScale);
  const bodyScaleValue=oneOf(value?.bodyScale,VISUAL_SCALE_PRESETS,fallback.bodyScale);
  const eyebrowScaleValue=oneOf(value?.eyebrowScale,VISUAL_SCALE_PRESETS,fallback.eyebrowScale);
  return {
    version: 1,
    headingFont: oneOf(value?.headingFont, VISUAL_FONT_PRESETS, fallback.headingFont),
    bodyFont: oneOf(value?.bodyFont, VISUAL_FONT_PRESETS, fallback.bodyFont),
    englishHeadingFont: oneOf(value?.englishHeadingFont, VISUAL_FONT_PRESETS, fallback.englishHeadingFont),
    headingScale: headingScaleValue,
    secondaryHeadingScale: secondaryHeadingScaleValue,
    bodyScale: bodyScaleValue,
    eyebrowScale: eyebrowScaleValue,
    headingWeight: oneOf(value?.headingWeight, VISUAL_WEIGHT_PRESETS, fallback.headingWeight),
    letterSpacing: oneOf(value?.letterSpacing, VISUAL_TRACKING_PRESETS, fallback.letterSpacing),
    lineHeight: oneOf(value?.lineHeight, VISUAL_LINE_HEIGHT_PRESETS, fallback.lineHeight),
    autoResponsive: value?.autoResponsive !== false,
    desktopHeadingScale: oneOf(value?.desktopHeadingScale, VISUAL_SCALE_PRESETS, fallback.desktopHeadingScale),
    mobileHeadingScale: oneOf(value?.mobileHeadingScale, VISUAL_SCALE_PRESETS, fallback.mobileHeadingScale),
    headingDesktopPx: clampTypographySize("heading","desktop",value?.headingDesktopPx ?? TYPOGRAPHY_SIZE_PRESETS.heading[desktopHeadingScaleValue][0]),
    headingMobilePx: clampTypographySize("heading","mobile",value?.headingMobilePx ?? TYPOGRAPHY_SIZE_PRESETS.heading[mobileHeadingScaleValue][1]),
    secondaryHeadingDesktopPx: clampTypographySize("secondaryHeading","desktop",value?.secondaryHeadingDesktopPx ?? TYPOGRAPHY_SIZE_PRESETS.secondaryHeading[secondaryHeadingScaleValue][0]),
    secondaryHeadingMobilePx: clampTypographySize("secondaryHeading","mobile",value?.secondaryHeadingMobilePx ?? TYPOGRAPHY_SIZE_PRESETS.secondaryHeading[secondaryHeadingScaleValue][1]),
    bodyDesktopPx: clampTypographySize("body","desktop",value?.bodyDesktopPx ?? TYPOGRAPHY_SIZE_PRESETS.body[bodyScaleValue][0]),
    bodyMobilePx: clampTypographySize("body","mobile",value?.bodyMobilePx ?? TYPOGRAPHY_SIZE_PRESETS.body[bodyScaleValue][1]),
    eyebrowDesktopPx: clampTypographySize("eyebrow","desktop",value?.eyebrowDesktopPx ?? TYPOGRAPHY_SIZE_PRESETS.eyebrow[eyebrowScaleValue][0]),
    eyebrowMobilePx: clampTypographySize("eyebrow","mobile",value?.eyebrowMobilePx ?? TYPOGRAPHY_SIZE_PRESETS.eyebrow[eyebrowScaleValue][1]),
    headingWrap: oneOf(value?.headingWrap,VISUAL_WRAP_MODES,fallback.headingWrap),
    headingWidth: oneOf(value?.headingWidth,VISUAL_TEXT_WIDTHS,fallback.headingWidth),
    secondaryHeadingWrap: oneOf(value?.secondaryHeadingWrap,VISUAL_WRAP_MODES,fallback.secondaryHeadingWrap),
    secondaryHeadingWidth: oneOf(value?.secondaryHeadingWidth,VISUAL_TEXT_WIDTHS,fallback.secondaryHeadingWidth),
    alignment: oneOf(value?.alignment,VISUAL_ALIGNMENT_PRESETS,fallback.alignment),
    colors: {
      primaryText: resolveVisualColor(colors.primaryText, fallback.colors.primaryText),
      secondaryText: resolveVisualColor(colors.secondaryText, fallback.colors.secondaryText),
      accent: resolveVisualColor(colors.accent, fallback.colors.accent),
      lightSurface: resolveVisualColor(colors.lightSurface, fallback.colors.lightSurface),
      darkSurface: resolveVisualColor(colors.darkSurface, fallback.colors.darkSurface),
      onDark: resolveVisualColor(colors.onDark, fallback.colors.onDark),
      primaryButton: resolveVisualColor(colors.primaryButton, fallback.colors.primaryButton),
      primaryButtonText: resolveVisualColor(colors.primaryButtonText, fallback.colors.primaryButtonText),
      secondaryButton: resolveVisualColor(colors.secondaryButton, fallback.colors.secondaryButton),
    },
  };
}

export function resolveBlockVisualStyle(value?: PageBuilderBlockVisualStyle | null): PageBuilderBlockVisualStyle | undefined {
  if (!value || typeof value !== "object") return undefined;
  const resolved: PageBuilderBlockVisualStyle = {};
  if (value.headingFont) resolved.headingFont = oneOf(value.headingFont, VISUAL_FONT_PRESETS, "elegant");
  if (value.bodyFont) resolved.bodyFont = oneOf(value.bodyFont, VISUAL_FONT_PRESETS, "modern");
  if (value.headingScale) resolved.headingScale = oneOf(value.headingScale, VISUAL_SCALE_PRESETS, "large");
  if (value.secondaryHeadingScale) resolved.secondaryHeadingScale = oneOf(value.secondaryHeadingScale, VISUAL_SCALE_PRESETS, "large");
  if (value.bodyScale) resolved.bodyScale = oneOf(value.bodyScale, VISUAL_SCALE_PRESETS, "medium");
  if (value.headingWeight) resolved.headingWeight = oneOf(value.headingWeight, VISUAL_WEIGHT_PRESETS, "regular");
  if (value.letterSpacing) resolved.letterSpacing = oneOf(value.letterSpacing, VISUAL_TRACKING_PRESETS, "normal");
  if (value.lineHeight) resolved.lineHeight = oneOf(value.lineHeight, VISUAL_LINE_HEIGHT_PRESETS, "normal");
  if (value.alignment) resolved.alignment = oneOf(value.alignment, VISUAL_ALIGNMENT_PRESETS, "left");
  if (value.headingDesktopPx !== undefined) resolved.headingDesktopPx = clampTypographySize("secondaryHeading","desktop",value.headingDesktopPx);
  if (value.headingMobilePx !== undefined) resolved.headingMobilePx = clampTypographySize("secondaryHeading","mobile",value.headingMobilePx);
  if (value.bodyDesktopPx !== undefined) resolved.bodyDesktopPx = clampTypographySize("body","desktop",value.bodyDesktopPx);
  if (value.bodyMobilePx !== undefined) resolved.bodyMobilePx = clampTypographySize("body","mobile",value.bodyMobilePx);
  if (value.headingWrap) resolved.headingWrap = oneOf(value.headingWrap,VISUAL_WRAP_MODES,"auto");
  if (value.headingWidth) resolved.headingWidth = oneOf(value.headingWidth,VISUAL_TEXT_WIDTHS,"standard");
  if (value.headingColor) resolved.headingColor = resolveVisualColor(value.headingColor, "ink");
  if (value.bodyColor) resolved.bodyColor = resolveVisualColor(value.bodyColor, "warm-gray");
  if (value.accentColor) resolved.accentColor = resolveVisualColor(value.accentColor, "gold");
  if (value.primaryButton) resolved.primaryButton = resolveVisualColor(value.primaryButton, "ink");
  if (value.primaryButtonText) resolved.primaryButtonText = resolveVisualColor(value.primaryButtonText, "white");
  return resolved;
}

export function resolveHeroPlaybackMode(value?: unknown): HeroPlaybackMode {
  return value === "autoplay-loop" ? "autoplay-loop" : "click-to-play";
}

export function validateWebsiteVisualStyle(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("網站視覺設定格式不正確。");
  const input=value as Record<string,unknown>;
  const allowed=new Set(["version","headingFont","bodyFont","englishHeadingFont","headingScale","secondaryHeadingScale","bodyScale","eyebrowScale","headingWeight","letterSpacing","lineHeight","autoResponsive","desktopHeadingScale","mobileHeadingScale","headingDesktopPx","headingMobilePx","secondaryHeadingDesktopPx","secondaryHeadingMobilePx","bodyDesktopPx","bodyMobilePx","eyebrowDesktopPx","eyebrowMobilePx","headingWrap","headingWidth","secondaryHeadingWrap","secondaryHeadingWidth","alignment","colors"]);
  for(const key of Object.keys(input))if(!allowed.has(key))throw new Error("網站視覺設定含有不支援的項目。");
  if (input.version !== 1) throw new Error("網站視覺設定版本不受支援。");
  const checkChoice=(key:string,choices:readonly string[])=>{if(typeof input[key]!=="string"||!choices.includes(input[key] as string))throw new Error("網站視覺設定含有不支援的選項。");};
  checkChoice("headingFont",VISUAL_FONT_PRESETS);checkChoice("bodyFont",VISUAL_FONT_PRESETS);checkChoice("englishHeadingFont",VISUAL_FONT_PRESETS);
  checkChoice("headingScale",VISUAL_SCALE_PRESETS);checkChoice("secondaryHeadingScale",VISUAL_SCALE_PRESETS);checkChoice("bodyScale",VISUAL_SCALE_PRESETS);checkChoice("eyebrowScale",VISUAL_SCALE_PRESETS);checkChoice("desktopHeadingScale",VISUAL_SCALE_PRESETS);checkChoice("mobileHeadingScale",VISUAL_SCALE_PRESETS);
  checkChoice("headingWeight",VISUAL_WEIGHT_PRESETS);checkChoice("letterSpacing",VISUAL_TRACKING_PRESETS);checkChoice("lineHeight",VISUAL_LINE_HEIGHT_PRESETS);
  for(const [key,role,device] of [["headingDesktopPx","heading","desktop"],["headingMobilePx","heading","mobile"],["secondaryHeadingDesktopPx","secondaryHeading","desktop"],["secondaryHeadingMobilePx","secondaryHeading","mobile"],["bodyDesktopPx","body","desktop"],["bodyMobilePx","body","mobile"],["eyebrowDesktopPx","eyebrow","desktop"],["eyebrowMobilePx","eyebrow","mobile"]] as const)if(input[key]!==undefined&&clampTypographySize(role,device,input[key])!==input[key])throw new Error("文字大小超出安全範圍。");
  if(input.headingWrap!==undefined&&!(VISUAL_WRAP_MODES as readonly unknown[]).includes(input.headingWrap))throw new Error("標題換行設定不正確。");
  if(input.secondaryHeadingWrap!==undefined&&!(VISUAL_WRAP_MODES as readonly unknown[]).includes(input.secondaryHeadingWrap))throw new Error("區塊標題換行設定不正確。");
  if(input.headingWidth!==undefined&&!(VISUAL_TEXT_WIDTHS as readonly unknown[]).includes(input.headingWidth))throw new Error("標題寬度設定不正確。");
  if(input.secondaryHeadingWidth!==undefined&&!(VISUAL_TEXT_WIDTHS as readonly unknown[]).includes(input.secondaryHeadingWidth))throw new Error("區塊標題寬度設定不正確。");
  if(input.alignment!==undefined&&!(VISUAL_ALIGNMENT_PRESETS as readonly unknown[]).includes(input.alignment))throw new Error("文字對齊設定不正確。");
  if(typeof input.autoResponsive!=="boolean")throw new Error("網站視覺設定含有不支援的選項。");
  if(!input.colors||typeof input.colors!=="object"||Array.isArray(input.colors))throw new Error("網站顏色設定格式不正確。");
  const colors=input.colors as Record<string,unknown>;const colorKeys=["primaryText","secondaryText","accent","lightSurface","darkSurface","onDark","primaryButton","primaryButtonText","secondaryButton"];
  if(Object.keys(colors).some(key=>!colorKeys.includes(key))||colorKeys.some(key=>resolveVisualColor(colors[key],"#000000")!==colors[key]))throw new Error("網站顏色設定含有不支援的選項。");
  const resolved = resolveWebsiteVisualStyle(input as Partial<WebsiteVisualStyle>);
  return resolved;
}

export function validateBlockVisualStyle(value: unknown) {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("區塊文字與色彩設定格式不正確。");
  const allowed = new Set(["headingFont","bodyFont","headingScale","secondaryHeadingScale","bodyScale","headingWeight","letterSpacing","lineHeight","alignment","headingDesktopPx","headingMobilePx","bodyDesktopPx","bodyMobilePx","headingWrap","headingWidth","headingColor","bodyColor","accentColor","primaryButton","primaryButtonText"]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error("區塊文字與色彩設定含有不支援的項目。");
  const input=value as Record<string,unknown>;
  const valid=(key:string,choices:readonly string[])=>input[key]===undefined||(typeof input[key]==="string"&&choices.includes(input[key] as string));
  if(!valid("headingFont",VISUAL_FONT_PRESETS)||!valid("bodyFont",VISUAL_FONT_PRESETS)||!valid("headingScale",VISUAL_SCALE_PRESETS)||!valid("secondaryHeadingScale",VISUAL_SCALE_PRESETS)||!valid("bodyScale",VISUAL_SCALE_PRESETS)||!valid("headingWeight",VISUAL_WEIGHT_PRESETS)||!valid("letterSpacing",VISUAL_TRACKING_PRESETS)||!valid("lineHeight",VISUAL_LINE_HEIGHT_PRESETS)||!valid("alignment",VISUAL_ALIGNMENT_PRESETS))throw new Error("區塊文字與色彩設定含有不支援的選項。");
  for(const [key,role,device] of [["headingDesktopPx","secondaryHeading","desktop"],["headingMobilePx","secondaryHeading","mobile"],["bodyDesktopPx","body","desktop"],["bodyMobilePx","body","mobile"]] as const)if(input[key]!==undefined&&clampTypographySize(role,device,input[key])!==input[key])throw new Error("區塊文字大小超出安全範圍。");
  if(!valid("headingWrap",VISUAL_WRAP_MODES)||!valid("headingWidth",VISUAL_TEXT_WIDTHS))throw new Error("區塊標題排版設定不正確。");
  for(const key of ["headingColor","bodyColor","accentColor","primaryButton","primaryButtonText"])if(input[key]!==undefined&&resolveVisualColor(input[key],"#000000")!==input[key])throw new Error("區塊顏色設定含有不支援的選項。");
}

export function websiteVisualStyleVariables(value?: Partial<WebsiteVisualStyle> | null): CSSProperties {
  const style = resolveWebsiteVisualStyle(value);
  return {
    "--pb-heading-font": fontStacks[style.headingFont],
    "--pb-body-font": fontStacks[style.bodyFont],
    "--pb-english-font": fontStacks[style.englishHeadingFont],
    "--pb-h1-size": h1Scale[style.headingScale],
    "--pb-h1-size-desktop": `${style.headingDesktopPx}px`,
    "--pb-h1-size-mobile": `${style.headingMobilePx}px`,
    "--pb-h2-size": h2Scale[style.secondaryHeadingScale],
    "--pb-h2-size-desktop": `${style.secondaryHeadingDesktopPx}px`,
    "--pb-h2-size-mobile": `${style.secondaryHeadingMobilePx}px`,
    "--pb-body-size": bodyScale[style.bodyScale],
    "--pb-body-size-desktop": `${style.bodyDesktopPx}px`,
    "--pb-body-size-mobile": `${style.bodyMobilePx}px`,
    "--pb-eyebrow-size": eyebrowScale[style.eyebrowScale],
    "--pb-eyebrow-size-desktop": `${style.eyebrowDesktopPx}px`,
    "--pb-eyebrow-size-mobile": `${style.eyebrowMobilePx}px`,
    "--pb-heading-max-width": textWidth[style.headingWidth],
    "--pb-secondary-heading-max-width": textWidth[style.secondaryHeadingWidth],
    "--pb-text-align": style.alignment,
    "--pb-content-justify": contentJustify[style.alignment],
    "--pb-heading-weight": weight[style.headingWeight],
    "--pb-heading-tracking": tracking[style.letterSpacing],
    "--pb-heading-line-height": headingLineHeight[style.lineHeight],
    "--pb-body-line-height": lineHeight[style.lineHeight],
    "--pb-h1-color": visualColorHex(style.colors.onDark),
    "--pb-h2-color": visualColorHex(style.colors.primaryText),
    "--pb-body-color": visualColorHex(style.colors.secondaryText),
    "--pb-eyebrow-color": visualColorHex(style.colors.accent),
    "--pb-ink": visualColorHex(style.colors.primaryText),
    "--pb-muted": visualColorHex(style.colors.secondaryText),
    "--pb-gold": visualColorHex(style.colors.accent),
    "--pb-paper": visualColorHex(style.colors.lightSurface),
    "--pb-dark": visualColorHex(style.colors.darkSurface),
    "--pb-on-dark": visualColorHex(style.colors.onDark),
    "--pb-primary-button": visualColorHex(style.colors.primaryButton),
    "--pb-primary-button-text": visualColorHex(style.colors.primaryButtonText),
    "--pb-secondary-button": visualColorHex(style.colors.secondaryButton),
  } as CSSProperties;
}

export function blockVisualStyleVariables(value?: PageBuilderBlockVisualStyle | null): CSSProperties {
  const style = resolveBlockVisualStyle(value);
  if (!style) return {};
  const vars: Record<string, string | number> = {};
  if (style.headingFont) vars["--pb-heading-font"] = fontStacks[style.headingFont];
  if (style.bodyFont) vars["--pb-body-font"] = fontStacks[style.bodyFont];
  if (style.headingScale) vars["--pb-h1-size"] = h1Scale[style.headingScale];
  if (style.secondaryHeadingScale) vars["--pb-h2-size"] = h2Scale[style.secondaryHeadingScale];
  if (style.bodyScale) vars["--pb-body-size"] = bodyScale[style.bodyScale];
  if (style.headingDesktopPx) { vars["--pb-h1-size-desktop"]=`${style.headingDesktopPx}px`; vars["--pb-h2-size-desktop"]=`${style.headingDesktopPx}px`; }
  if (style.headingMobilePx) { vars["--pb-h1-size-mobile"]=`${style.headingMobilePx}px`; vars["--pb-h2-size-mobile"]=`${style.headingMobilePx}px`; }
  if (style.bodyDesktopPx) vars["--pb-body-size-desktop"]=`${style.bodyDesktopPx}px`;
  if (style.bodyMobilePx) vars["--pb-body-size-mobile"]=`${style.bodyMobilePx}px`;
  if (style.headingWidth) { vars["--pb-heading-max-width"]=textWidth[style.headingWidth]; vars["--pb-secondary-heading-max-width"]=textWidth[style.headingWidth]; }
  if (style.alignment) { vars["--pb-text-align"]=style.alignment; vars["--pb-content-justify"]=contentJustify[style.alignment]; }
  if (style.headingWeight) vars["--pb-heading-weight"] = weight[style.headingWeight];
  if (style.letterSpacing) vars["--pb-heading-tracking"] = tracking[style.letterSpacing];
  if (style.lineHeight) { vars["--pb-heading-line-height"] = headingLineHeight[style.lineHeight]; vars["--pb-body-line-height"] = lineHeight[style.lineHeight]; }
  if (style.headingColor) { vars["--pb-h1-color"] = visualColorHex(style.headingColor); vars["--pb-h2-color"] = visualColorHex(style.headingColor); vars["--pb-ink"] = visualColorHex(style.headingColor); }
  if (style.bodyColor) { vars["--pb-body-color"] = visualColorHex(style.bodyColor); vars["--pb-muted"] = visualColorHex(style.bodyColor); }
  if (style.accentColor) { vars["--pb-eyebrow-color"] = visualColorHex(style.accentColor); vars["--pb-gold"] = visualColorHex(style.accentColor); }
  if (style.primaryButton) vars["--pb-primary-button"] = visualColorHex(style.primaryButton);
  if (style.primaryButtonText) vars["--pb-primary-button-text"] = visualColorHex(style.primaryButtonText);
  return vars as CSSProperties;
}

function luminance(hex: string) {
  const rgb = [1,3,5].map((start) => parseInt(hex.slice(start,start+2),16) / 255).map((value) => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}
export function hasLowContrast(foreground: VisualColorValue, background: VisualColorValue) {
  const [a,b] = [luminance(visualColorHex(foreground)),luminance(visualColorHex(background))].sort((x,y)=>y-x);
  return (a + .05) / (b + .05) < 4.5;
}
