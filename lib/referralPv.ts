import type { WebsiteData, PurchaseOption } from "@/data/websiteData";
import type { MoneyRoundingMode } from "./membershipRuleTypes";

export type ReferralPvSnapshot = { basePV: number; discountRatio: number; effectivePV: number };

function round(value: number, mode: MoneyRoundingMode) {
  if (mode === "round-down") return Math.floor(value * 100) / 100;
  if (mode === "round-up") return Math.ceil(value * 100) / 100;
  return Math.floor(value * 100 + 0.5) / 100;
}

export function resolveEffectivePv(input: { sku: PurchaseOption; originalUnitPrice: number; discountedUnitPrice: number; quantity?: number; roundingMode: MoneyRoundingMode }): ReferralPvSnapshot {
  if (input.sku.pvEnabled !== true || typeof input.sku.pvValue !== "number" || !Number.isFinite(input.sku.pvValue) || input.sku.pvValue < 0) throw new Error("此 SKU 尚未設定有效 PV");
  if (!Number.isFinite(input.originalUnitPrice) || input.originalUnitPrice <= 0 || !Number.isFinite(input.discountedUnitPrice) || input.discountedUnitPrice < 0) throw new Error("商品折扣價格不正確");
  const quantity = input.quantity ?? 1;
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("商品數量不正確");
  const discountRatio = Math.min(1, input.discountedUnitPrice / input.originalUnitPrice);
  const basePV = input.sku.pvValue * quantity;
  return { basePV, discountRatio, effectivePV: round(basePV * discountRatio, input.roundingMode) };
}

export function listActiveSkusMissingPv(website: WebsiteData) {
  return website.menu.products.flatMap((product) => {
    if (product.active === false || product.purchasable === false || product.status !== "active") return [];
    const options = product.skus?.length ? product.skus : product.purchase;
    return options.flatMap((sku, index) => sku.enabled === false || (sku.pvEnabled === true && typeof sku.pvValue === "number" && Number.isFinite(sku.pvValue) && sku.pvValue >= 0) ? [] : [{ productId: product.slug, productName: product.name, skuId: sku.id || `${product.slug}:${index}`, skuLabel: sku.label }]);
  });
}
