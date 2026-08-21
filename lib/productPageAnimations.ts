import type { ProductSectionKey } from "@/lib/productPageSections";
import type { CSSProperties } from "react";

export const PRODUCT_ANIMATION_EFFECTS = ["none", "fade", "slide-left", "slide-right", "slide-up", "scale-fade"] as const;
export const PRODUCT_ANIMATION_TRIGGERS = ["none", "page-load", "viewport"] as const;
export const PRODUCT_ANIMATION_THRESHOLDS = ["entry", "slight", "quarter", "half"] as const;
export const PRODUCT_ANIMATION_CHILD_KEYS = ["left", "right", "heading", "media-stage", "proof-1", "proof-2", "proof-3"] as const;

export type ProductAnimationEffect = (typeof PRODUCT_ANIMATION_EFFECTS)[number];
export type ProductAnimationTrigger = (typeof PRODUCT_ANIMATION_TRIGGERS)[number];
export type ProductAnimationThreshold = (typeof PRODUCT_ANIMATION_THRESHOLDS)[number];
export type ProductAnimationChildKey = (typeof PRODUCT_ANIMATION_CHILD_KEYS)[number];

export type ProductAnimationChildConfig = {
  effect?: ProductAnimationEffect;
  durationMs?: number;
  delayMs?: number;
};

export type ProductSectionAnimationConfig = {
  enabled?: boolean;
  trigger?: ProductAnimationTrigger;
  effect?: ProductAnimationEffect;
  durationMs?: number;
  delayMs?: number;
  threshold?: ProductAnimationThreshold;
  once?: boolean;
  children?: Partial<Record<ProductAnimationChildKey, ProductAnimationChildConfig>>;
};

export type ProductPageAnimations = Partial<Record<ProductSectionKey, ProductSectionAnimationConfig>>;

export const PRODUCT_ANIMATION_CHILDREN_BY_SECTION: Partial<Record<ProductSectionKey, readonly ProductAnimationChildKey[]>> = {
  "select-your-coffee": ["left", "right"],
  "clean-roasting": ["heading", "media-stage", "proof-1", "proof-2", "proof-3"],
};

export const PRODUCT_ANIMATION_THRESHOLD_VALUES: Record<ProductAnimationThreshold, number> = {
  entry: 0.05,
  slight: 0.15,
  quarter: 0.25,
  half: 0.5,
};

const DEFAULT_SECTION_ANIMATION: Required<Omit<ProductSectionAnimationConfig, "children">> = {
  enabled: false,
  trigger: "viewport",
  effect: "fade",
  durationMs: 500,
  delayMs: 0,
  threshold: "slight",
  once: true,
};

const GIOTTO_ADMIN_BASELINES: Partial<Record<ProductSectionKey, ProductSectionAnimationConfig>> = {
  "product-hero": { enabled: false, trigger: "page-load", effect: "scale-fade", durationMs: 760, delayMs: 0, threshold: "entry", once: true },
  "select-your-coffee": {
    enabled: true,
    trigger: "viewport",
    effect: "none",
    durationMs: 540,
    delayMs: 0,
    threshold: "slight",
    once: true,
    children: {
      left: { effect: "slide-left", durationMs: 540, delayMs: 0 },
      right: { effect: "slide-right", durationMs: 540, delayMs: 100 },
    },
  },
  "flavor-notes": { enabled: true, trigger: "viewport", effect: "slide-up", durationMs: 780, delayMs: 0, threshold: "slight", once: true },
  "coffee-profile": { enabled: true, trigger: "viewport", effect: "slide-up", durationMs: 780, delayMs: 0, threshold: "slight", once: true },
  "clean-roasting": {
    enabled: true,
    trigger: "viewport",
    effect: "none",
    durationMs: 400,
    delayMs: 0,
    threshold: "slight",
    once: true,
    children: {
      heading: { effect: "slide-up", durationMs: 360, delayMs: 0 },
      "media-stage": { effect: "slide-up", durationMs: 400, delayMs: 120 },
      "proof-1": { effect: "slide-up", durationMs: 360, delayMs: 300 },
      "proof-2": { effect: "slide-up", durationMs: 360, delayMs: 450 },
      "proof-3": { effect: "slide-up", durationMs: 360, delayMs: 600 },
    },
  },
  campaigns: { enabled: false, trigger: "viewport", effect: "fade", durationMs: 500, delayMs: 0, threshold: "slight", once: true },
  "related-products": { enabled: true, trigger: "viewport", effect: "slide-up", durationMs: 780, delayMs: 0, threshold: "slight", once: true },
  "before-you-order": { enabled: true, trigger: "viewport", effect: "slide-up", durationMs: 780, delayMs: 0, threshold: "slight", once: true },
};

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export function normalizeAnimationDuration(value: unknown, fallback = 500): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1500, Math.max(200, Math.round(value)))
    : fallback;
}

export function normalizeAnimationDelay(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(2000, Math.max(0, Math.round(value)))
    : fallback;
}

export function normalizeProductSectionAnimation(
  value: unknown,
  fallback: ProductSectionAnimationConfig = DEFAULT_SECTION_ANIMATION,
): ProductSectionAnimationConfig {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const childrenSource = source.children && typeof source.children === "object" && !Array.isArray(source.children)
    ? source.children as Record<string, unknown>
    : {};
  const children: ProductSectionAnimationConfig["children"] = {};

  for (const childKey of PRODUCT_ANIMATION_CHILD_KEYS) {
    const childValue = childrenSource[childKey];
    if (!childValue || typeof childValue !== "object" || Array.isArray(childValue)) continue;
    const child = childValue as Record<string, unknown>;
    const childFallback = fallback.children?.[childKey] || {};
    children[childKey] = {
      effect: includes(PRODUCT_ANIMATION_EFFECTS, child.effect) ? child.effect : childFallback.effect || "slide-up",
      durationMs: normalizeAnimationDuration(child.durationMs, childFallback.durationMs || 500),
      delayMs: normalizeAnimationDelay(child.delayMs, childFallback.delayMs || 0),
    };
  }

  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : fallback.enabled === true,
    trigger: includes(PRODUCT_ANIMATION_TRIGGERS, source.trigger) ? source.trigger : fallback.trigger || "viewport",
    effect: includes(PRODUCT_ANIMATION_EFFECTS, source.effect) ? source.effect : fallback.effect || "fade",
    durationMs: normalizeAnimationDuration(source.durationMs, fallback.durationMs || 500),
    delayMs: normalizeAnimationDelay(source.delayMs, fallback.delayMs || 0),
    threshold: includes(PRODUCT_ANIMATION_THRESHOLDS, source.threshold) ? source.threshold : fallback.threshold || "slight",
    once: typeof source.once === "boolean" ? source.once : fallback.once !== false,
    ...(Object.keys(children).length ? { children } : {}),
  };
}

export function getProductAnimationAdminDefault(productSlug: string, sectionKey: ProductSectionKey): ProductSectionAnimationConfig {
  const baseline = productSlug === "giotto-awakening" ? GIOTTO_ADMIN_BASELINES[sectionKey] : undefined;
  return normalizeProductSectionAnimation(baseline, DEFAULT_SECTION_ANIMATION);
}

export function resolveProductSectionAnimation(
  animations: ProductPageAnimations | undefined,
  sectionKey: ProductSectionKey,
): ProductSectionAnimationConfig | null {
  if (!animations || !Object.prototype.hasOwnProperty.call(animations, sectionKey)) return null;
  return normalizeProductSectionAnimation(animations[sectionKey], getProductAnimationAdminDefault("", sectionKey));
}

export function productAnimationTransform(effect: ProductAnimationEffect): string {
  if (effect === "slide-left") return "translateX(-24px)";
  if (effect === "slide-right") return "translateX(24px)";
  if (effect === "slide-up") return "translateY(10px)";
  if (effect === "scale-fade") return "scale(.985)";
  return "none";
}

export type ProductAnimationAttributes = {
  "data-product-animation-managed": "true";
  "data-product-animation-enabled": "true" | "false";
  "data-product-animation-trigger": ProductAnimationTrigger;
  "data-product-animation-effect": ProductAnimationEffect;
  "data-product-animation-threshold": string;
  "data-product-animation-once": "true" | "false";
  style: CSSProperties;
};

export function getProductAnimationAttributes(config: ProductSectionAnimationConfig | null): ProductAnimationAttributes | Record<string, never> {
  if (!config) return {};
  return {
    "data-product-animation-managed": "true",
    "data-product-animation-enabled": config.enabled === true ? "true" : "false",
    "data-product-animation-trigger": config.trigger || "viewport",
    "data-product-animation-effect": config.effect || "fade",
    "data-product-animation-threshold": String(PRODUCT_ANIMATION_THRESHOLD_VALUES[config.threshold || "slight"]),
    "data-product-animation-once": config.once === false ? "false" : "true",
    style: {
      "--product-animation-duration": `${normalizeAnimationDuration(config.durationMs)}ms`,
      "--product-animation-delay": `${normalizeAnimationDelay(config.delayMs)}ms`,
    } as CSSProperties,
  };
}
