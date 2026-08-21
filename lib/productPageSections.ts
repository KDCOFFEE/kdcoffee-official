export const PRODUCT_SECTION_PLACEMENTS = [
  "after_purchase",
  "after_profile",
  "after_clean_roasting",
  "before_before_you_order",
  "page_bottom",
] as const;

export type ProductSectionPlacement = (typeof PRODUCT_SECTION_PLACEMENTS)[number];

export const PRODUCT_SECTION_REGISTRY = [
  { key: "product-hero", label: "Product Hero / Identity", fixed: true },
  { key: "select-your-coffee", label: "SELECT YOUR COFFEE", fixed: true },
  { key: "flavor-notes", label: "FLAVOR NOTES", fixed: true },
  { key: "coffee-profile", label: "COFFEE PROFILE", fixed: true },
  { key: "clean-roasting", label: "CLEAN ROASTING", fixed: true },
  { key: "campaigns", label: "Campaigns", fixed: false },
  { key: "related-products", label: "Related Products", fixed: false },
  { key: "before-you-order", label: "BEFORE YOU ORDER", fixed: true },
] as const;

export type ProductSectionKey = (typeof PRODUCT_SECTION_REGISTRY)[number]["key"];
export type MovableProductSectionKey = "campaigns" | "related-products";

export const DEFAULT_OPTIONAL_SECTION_LAYOUT: Record<
  MovableProductSectionKey,
  { placement: ProductSectionPlacement; order: number }
> = {
  campaigns: { placement: "page_bottom", order: 1 },
  "related-products": { placement: "page_bottom", order: 2 },
};

export function isProductSectionPlacement(value: unknown): value is ProductSectionPlacement {
  return typeof value === "string" && PRODUCT_SECTION_PLACEMENTS.includes(value as ProductSectionPlacement);
}

export function normalizeProductSectionPlacement(
  value: unknown,
  fallback: ProductSectionPlacement,
): ProductSectionPlacement {
  return isProductSectionPlacement(value) ? value : fallback;
}

export function normalizeProductSectionOrder(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0 && value <= 20
    ? value
    : fallback;
}
