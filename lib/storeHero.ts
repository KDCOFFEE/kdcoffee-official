import type { CSSProperties } from "react";
import type { StoreHeroSettings, StoreMediaReference, StoreHeroTiming } from "./storeTypes";
import { PREMIUM_HERO_TIMING, resolveHeroTiming } from "./homepageCms";
import { clampTypographySize, resolveVisualColor, visualColorHex, type VisualColorValue } from "./pageBuilderVisualStyle";

const fallbackImage = { url: "/images/home003/kd-coffee-first-specialty-coffee-drip-bag-v01.png", alt: "" };
export const DEFAULT_STORE_HERO = {
  title: "KD Coffee 商店",
  subtitle: "為日常咖啡，選一件真正喜歡的器物。",
  backgroundImage: fallbackImage,
  mobileBackgroundImage: fallbackImage,
  titleFontSize: 48,
  titleColor: "#251b16" as VisualColorValue,
  subtitleFontSize: 16,
  subtitleColor: "#514336" as VisualColorValue,
  motionEnabled: false,
  timing: { mediaDuration: PREMIUM_HERO_TIMING.mediaDuration, headlineLine1Start: PREMIUM_HERO_TIMING.headlineLine1Start, leadStart: PREMIUM_HERO_TIMING.leadStart },
};
export type PublicStoreHero = typeof DEFAULT_STORE_HERO;

/** Reuse Homepage sequencing, supplying only Store's media/title/subtitle roles. */
export function resolveStoreHeroTiming(value?: Partial<StoreHeroTiming>): StoreHeroTiming {
  const title = value?.headlineLine1Start ?? PREMIUM_HERO_TIMING.headlineLine1Start;
  const lead = value?.leadStart ?? PREMIUM_HERO_TIMING.leadStart;
  const resolved = resolveHeroTiming({ ...value, eyebrowStart: 0, headlineLine1Start: title, headlineLine2Start: title, leadStart: lead, primaryCtaStart: lead, secondaryCtaStart: lead, trustStart: lead });
  return { mediaDuration: resolved.mediaDuration, headlineLine1Start: resolved.headlineLine1Start, leadStart: resolved.leadStart };
}
function imageProjection(image: StoreMediaReference | undefined, fallback: { url: string; alt: string }) {
  return image?.type === "image" ? { url: image.url, alt: image.alt } : { ...fallback };
}
/** Pure display projection; fallback values never enter persistence. */
export function publicStoreHero(settings?: StoreHeroSettings): PublicStoreHero {
  const desktop = imageProjection(settings?.backgroundImage, fallbackImage);
  return {
    title: settings?.title?.trim() ? settings.title : DEFAULT_STORE_HERO.title,
    subtitle: settings?.subtitle?.trim() ? settings.subtitle : DEFAULT_STORE_HERO.subtitle,
    backgroundImage: desktop,
    mobileBackgroundImage: imageProjection(settings?.mobileBackgroundImage, desktop),
    titleFontSize: clampTypographySize("heading", "desktop", settings?.titleFontSize ?? DEFAULT_STORE_HERO.titleFontSize),
    titleColor: resolveVisualColor(settings?.titleColor, DEFAULT_STORE_HERO.titleColor),
    subtitleFontSize: clampTypographySize("body", "desktop", settings?.subtitleFontSize ?? DEFAULT_STORE_HERO.subtitleFontSize),
    subtitleColor: resolveVisualColor(settings?.subtitleColor, DEFAULT_STORE_HERO.subtitleColor),
    motionEnabled: settings?.motionEnabled === true,
    timing: resolveStoreHeroTiming(settings?.timing),
  };
}
export function storeHeroStyle(hero: PublicStoreHero): CSSProperties {
  return {
    "--store-hero-title-size": `${hero.titleFontSize}px`,
    "--store-hero-title-mobile-size": `${clampTypographySize("heading", "mobile", hero.titleFontSize * 34 / 48)}px`,
    "--store-hero-title-color": visualColorHex(hero.titleColor),
    "--store-hero-subtitle-size": `${hero.subtitleFontSize}px`,
    "--store-hero-subtitle-mobile-size": `${clampTypographySize("body", "mobile", hero.subtitleFontSize)}px`,
    "--store-hero-subtitle-color": visualColorHex(hero.subtitleColor),
    "--store-hero-text-animation": "home-hero-enter",
    "--store-hero-media-animation": "home-hero-media-emerge",
    "--store-hero-media-duration": `${hero.timing.mediaDuration}ms`,
    "--store-hero-title-start": `${hero.timing.headlineLine1Start}ms`,
    "--store-hero-subtitle-start": `${hero.timing.leadStart}ms`,
  } as CSSProperties;
}
