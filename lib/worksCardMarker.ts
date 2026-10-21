import {
  isWorksSoldOutText, resolveWorksMarketingPreset, resolveWorksSoldOutPresentation,
  type WorksCardMarkerPresentation, type WorksMarketingMarkerType,
} from "./worksPageCms";
export type WorksMarkerProduct = { slug: string; tag?: string; status?: string; purchasable?: boolean };
export type ResolvedWorksCardMarker = {
  source: "system" | "marketing";
  type: "SOLD_OUT" | WorksMarketingMarkerType;
  assignmentSource: "Product.status/purchasable" | "Product.tag";
  presentation: WorksCardMarkerPresentation;
};
const LEGACY_TYPES: Record<string, WorksMarketingMarkerType> = {
  "新品": "NEW", "新品上市": "NEW", "推薦": "RECOMMENDED", "本月推薦": "RECOMMENDED",
  "活動": "CAMPAIGN", "限量": "LIMITED", "期間限定": "LIMITED", "本月精選": "FEATURED",
};
/** Reuse the existing assignment truth; arbitrary existing labels stay CUSTOM.
 * No inferred availability, campaign pricing, tag mutation or saved shadow table.
 */
export function resolveWorksMarketingTag(tag: unknown): { type: WorksMarketingMarkerType; text: string } | null {
  if (!isWorksSoldOutText(tag) || /[<>]/.test(tag)) return null;
  return { type: Object.hasOwn(LEGACY_TYPES, tag) ? LEGACY_TYPES[tag] : "CUSTOM", text: tag };
}
export function isWorksCardSoldOut(product: Pick<WorksMarkerProduct, "status" | "purchasable">): boolean {
  return product.status === "sold_out" || product.purchasable === false;
}
export function assertWorksMarkerCatalog(products: ReadonlyArray<{ slug?: unknown }>): void {
  const seen = new Set<string>();
  for (const product of products) {
    if (typeof product.slug !== "string" || !product.slug || seen.has(product.slug))
      throw new Error("作品標籤的 canonical slug 無效或重複。");
    seen.add(product.slug);
  }
}
export function resolveWorksCardMarker({
  product, cardMarkers, soldOutPresentation, showTag = true, showCommerceSummary = true,
}: {
  product: WorksMarkerProduct; cardMarkers?: unknown; soldOutPresentation?: unknown;
  showTag?: boolean; showCommerceSummary?: boolean;
}): ResolvedWorksCardMarker | null {
  // System status wins even when presentation is hidden: marketing never resurfaces.
  if (isWorksCardSoldOut(product)) return showCommerceSummary ? {
    source: "system", type: "SOLD_OUT", assignmentSource: "Product.status/purchasable",
    presentation: resolveWorksSoldOutPresentation(soldOutPresentation),
  } : null;
  if (!showTag) return null;
  const assignment = resolveWorksMarketingTag(product.tag);
  if (!assignment) return null;
  const presentation = resolveWorksMarketingPreset(cardMarkers, assignment.type);
  return {
    source: "marketing", type: assignment.type, assignmentSource: "Product.tag",
    presentation: assignment.type === "CUSTOM" ? { ...presentation, text: assignment.text } : presentation,
  };
}
