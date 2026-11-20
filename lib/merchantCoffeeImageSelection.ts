import type { CoffeeArtwork } from "@/data/websiteData";
import { merchantProductImageUrl } from "./googleMerchantCoffeeLiveEvidence";
import { getProductMediaAsset, resolveStaticProductAssetImage } from "./productVisualAssets";

export const merchantCoffeeImageSlots = ["productPhoto", "productVisual"] as const;
export type MerchantCoffeeImageSlot = (typeof merchantCoffeeImageSlots)[number];

export function selectMerchantHalfPoundSku(product: CoffeeArtwork) {
  const items = Array.isArray(product.skus) ? product.skus.filter(sku => sku?.enabled !== false) : [];
  if (!items.length) return { reason: "missing_public_persisted_sku" } as const;
  const matches = items.filter(sku => sku?.kind !== "drip" &&
    typeof sku?.detail === "string" && /^227\s*g$/iu.test(sku.detail.normalize("NFKC").trim()));
  if (matches.length !== 1) return { reason: matches.length > 1
    ? "ambiguous_coffee_half_pound_sku" : "missing_coffee_half_pound_sku" } as const;
  const [sku] = matches;
  if (sku.kind !== "beans") return { reason: "unverified_coffee_half_pound_sku_kind", item: sku.id } as const;
  return { sku } as const;
}

export function resolveMerchantCoffeeImage(product: CoffeeArtwork, slot: MerchantCoffeeImageSlot) {
  const asset = product.assets?.[slot];
  const media = getProductMediaAsset(product, slot);
  if (asset?.media && media?.type !== "image") return null;
  const url = merchantProductImageUrl(resolveStaticProductAssetImage(product, slot));
  if (!url || !new URL(url).pathname.startsWith(`/uploads/artworks/${product.slug}/`) ||
      url === merchantProductImageUrl(resolveStaticProductAssetImage(product, "artworkCover"))) return null;
  return url;
}
