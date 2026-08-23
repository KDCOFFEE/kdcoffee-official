import type { ProductSectionPlacement } from "./productPageSections";
import type { MediaAsset } from "./media";
import {
  getProductAnimationAttributes,
  type ProductSectionAnimationConfig,
} from "./productPageAnimations";

export const PRODUCT_CUSTOM_SECTION_MAX_COUNT = 10;
export const PRODUCT_CUSTOM_SECTION_MAX_BYTES = 100_000;
export const PRODUCT_CUSTOM_FEATURE_MAX_ITEMS = 6;

export const PRODUCT_CUSTOM_SECTION_TYPES = ["text", "features"] as const;
export const PRODUCT_CUSTOM_TEXT_LAYOUTS = ["standard", "narrow", "centered"] as const;
export const PRODUCT_CUSTOM_FEATURE_LAYOUTS = ["grid", "editorial"] as const;
export const PRODUCT_CUSTOM_FEATURE_ICONS = ["flavor", "origin", "process", "roast", "air", "heat", "cupping"] as const;
export const PRODUCT_CUSTOM_MEDIA_POSITIONS = ["full", "media-left", "media-right", "media-top", "media-bottom"] as const;
export const PRODUCT_CUSTOM_MEDIA_ALT_MAX_LENGTH = 240;
export const PRODUCT_CUSTOM_MEDIA_CAPTION_MAX_LENGTH = 500;

export const PRODUCT_CUSTOM_SECTION_ID_PATTERN = /^cs-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const PRODUCT_CUSTOM_FEATURE_ID_PATTERN = /^fi-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type ProductCustomSectionType = (typeof PRODUCT_CUSTOM_SECTION_TYPES)[number];
export type ProductCustomTextLayout = (typeof PRODUCT_CUSTOM_TEXT_LAYOUTS)[number];
export type ProductCustomFeatureLayout = (typeof PRODUCT_CUSTOM_FEATURE_LAYOUTS)[number];
export type ProductCustomFeatureIcon = (typeof PRODUCT_CUSTOM_FEATURE_ICONS)[number];
export type ProductCustomMediaPosition = (typeof PRODUCT_CUSTOM_MEDIA_POSITIONS)[number];

export type ProductCustomCloudinaryMedia = {
  provider: "cloudinary";
  asset: MediaAsset;
  alt: string;
  caption?: string;
  position: ProductCustomMediaPosition;
};

export type ProductCustomYouTubeMedia = {
  provider: "youtube";
  videoId: string;
  title: string;
  caption?: string;
  position: ProductCustomMediaPosition;
};

export type ProductCustomSectionMedia = ProductCustomCloudinaryMedia | ProductCustomYouTubeMedia;

type ProductCustomSectionBase = {
  id: string;
  adminName: string;
  enabled: boolean;
  placement: ProductSectionPlacement;
  order: number;
  animation?: ProductSectionAnimationConfig;
  media?: ProductCustomSectionMedia;
};

export type ProductCustomTextSection = ProductCustomSectionBase & {
  type: "text";
  layout: ProductCustomTextLayout;
  content: {
    eyebrow?: string;
    heading?: string;
    body?: string;
  };
};

export type ProductCustomFeatureItem = {
  id: string;
  title: string;
  body: string;
  icon?: ProductCustomFeatureIcon;
};

export type ProductCustomFeaturesSection = ProductCustomSectionBase & {
  type: "features";
  layout: ProductCustomFeatureLayout;
  content: {
    eyebrow?: string;
    heading?: string;
    description?: string;
    items: ProductCustomFeatureItem[];
  };
};

export type ProductCustomSection = ProductCustomTextSection | ProductCustomFeaturesSection;

export function createProductCustomSectionId() {
  return `cs-${globalThis.crypto.randomUUID()}`;
}

export function createProductCustomFeatureId() {
  return `fi-${globalThis.crypto.randomUUID()}`;
}

export function productCustomSectionAnchor(id: string) {
  return `custom-${id}`;
}

export function sortProductCustomSections(sections: readonly ProductCustomSection[]) {
  return [...sections].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}

export function resolveProductCustomSectionSlot(
  sections: readonly ProductCustomSection[],
  placement: ProductSectionPlacement,
) {
  return sortProductCustomSections(sections).filter((section) => section.enabled && section.placement === placement);
}

export function getProductCustomSectionAnimationAttributes(section: ProductCustomSection) {
  return section.animation?.enabled === true
    ? getProductAnimationAttributes(section.animation)
    : {};
}
