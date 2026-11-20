import "server-only";
import type { CoffeeArtwork } from "@/data/websiteData";
import { cartIdentifier } from "./commerceCart";
import { createMerchantImageBudget, verifyLocalMerchantProductImage } from "./googleMerchantCoffeeFeedSource";
import { merchantCoffeeImageSlots, resolveMerchantCoffeeImage, selectMerchantHalfPoundSku } from "./merchantCoffeeImageSelection";

export class MerchantImageApprovalError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export async function verifyMerchantCoffeeImage(url: string, budget = createMerchantImageBudget()) {
  try {
    const image = await verifyLocalMerchantProductImage(url, budget);
    if (!image) return null;
    await image.recheck();
    return image.sha256;
  } catch {
    throw new MerchantImageApprovalError("暫時無法驗證圖片檔案，請重新讀取。", 409);
  }
}

export function getMerchantCoffeeApprovalSku(product: CoffeeArtwork, products: CoffeeArtwork[]) {
  const { sku } = selectMerchantHalfPoundSku(product);
  if (!sku || typeof sku.id !== "string" || !sku.id.trim() ||
      (sku.enabled !== undefined && sku.enabled !== true) ||
      typeof product.id !== "string" || !product.id.trim() ||
      products.filter(row => row.id === product.id).length !== 1 ||
      products.filter(row => row.slug === product.slug).length !== 1) return null;
  const skuId = sku.id;
  try {
    cartIdentifier(product.id, "productId");
    cartIdentifier(skuId, "variantId");
  } catch {
    return null;
  }
  const occurrences = products.flatMap(row => Array.isArray(row.skus) && row.skus.length
    ? row.skus : Array.isArray(row.purchase) ? row.purchase : []).filter(option => option?.id === skuId);
  return occurrences.length === 1 ? { id: skuId, label: sku.label } : null;
}

async function inspect(product: CoffeeArtwork, products: CoffeeArtwork[], version: number) {
  const sku = getMerchantCoffeeApprovalSku(product, products);
  const budget = createMerchantImageBudget();
  const images = [];
  for (const slot of merchantCoffeeImageSlots) {
    if (!sku) break;
    const url = resolveMerchantCoffeeImage(product, slot);
    if (!url) continue;
    const sha256 = await verifyMerchantCoffeeImage(url, budget).catch(() => null);
    if (!sha256) continue;
    const approval = product.assets?.[slot]?.merchantApproval;
    images.push({
      slot, url, sha256,
      approved: approval?.sha256 === sha256 && Array.isArray(approval.skuIds) &&
        approval.skuIds.includes(sku.id) && (approval.sourceUrl === undefined || approval.sourceUrl === url),
    });
  }
  return {
    sku, images, version,
    hasApproval: merchantCoffeeImageSlots.some(slot => Boolean(product.assets?.[slot]?.merchantApproval)),
  };
}

export async function changeMerchantCoffeeImageApproval(
  products: CoffeeArtwork[],
  input: Record<string, unknown>,
  version: number,
) {
  const { slug, action } = input;
  if (typeof slug !== "string" || !slug.trim() || (action !== "inspect" && action !== "approve" && action !== "revoke")) {
    throw new MerchantImageApprovalError("Merchant 商品或操作格式錯誤。");
  }
  const matches = products.filter(product => product.slug === slug);
  if (matches.length !== 1) throw new MerchantImageApprovalError("找不到唯一的商品。", 409);
  const [product] = matches;
  if (action === "inspect") return { inspection: await inspect(product, products, version) };
  if (input.version !== version) throw new MerchantImageApprovalError("商品已更新，請重新讀取後再操作。", 409);

  const assets = { ...product.assets };
  for (const slot of merchantCoffeeImageSlots) {
    const asset = assets[slot];
    if (asset && "merchantApproval" in asset) {
      const next = { ...asset };
      delete next.merchantApproval;
      assets[slot] = next;
    }
  }
  if (action === "approve") {
    const slot = merchantCoffeeImageSlots.find(candidate => candidate === input.slot);
    const sku = getMerchantCoffeeApprovalSku(product, products);
    const url = slot && resolveMerchantCoffeeImage(product, slot);
    if (!slot || !sku || sku.id !== input.skuId || !url || url !== input.url) {
      throw new MerchantImageApprovalError("半磅 SKU 或來源圖片已變更，請重新讀取。", 409);
    }
    const sha256 = await verifyMerchantCoffeeImage(url);
    if (!sha256 || sha256 !== input.sha256) {
      throw new MerchantImageApprovalError("圖片內容已變更或無法驗證，請重新讀取。", 409);
    }
    assets[slot] = { ...assets[slot], merchantApproval: { skuIds: [sku.id], sha256, sourceUrl: url } };
  }
  return { products: products.map(row => row === product ? { ...row, assets } : row) };
}
