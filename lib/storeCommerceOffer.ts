import "server-only";

import { createStoreRepository } from "./storeRepository";
import { findPublicStoreProductBySlug } from "./storePublicSelectors";
import { isStoreProductSlug } from "./storePublicMetadata";
import { isStoreCommerceEnabled } from "./storeCommerceCapability";
import { validateUnifiedCartItem } from "./commerceCart";

export type StoreCommerceOffer = {
  domain: "store";
  productId: string;
  variantId: "default";
  slug: string;
  name: string;
  unitPrice: number;
  quantityLimit: number;
};
export type StoreCommerceOfferErrorCode =
  | "STORE_COMMERCE_DISABLED" | "STORE_PRODUCT_NOT_FOUND" | "STORE_PRODUCT_OUT_OF_STOCK";
export class StoreCommerceOfferError extends Error {
  readonly code: StoreCommerceOfferErrorCode;
  constructor(code: StoreCommerceOfferErrorCode) {
    super(code);
    this.name = "StoreCommerceOfferError";
    this.code = code;
  }
}

/** One live, read-only catalog read. Public selection owns all visibility rules. */
export async function resolveStoreCommerceOffer(slug: string): Promise<StoreCommerceOffer> {
  if (!isStoreCommerceEnabled()) throw new StoreCommerceOfferError("STORE_COMMERCE_DISABLED");
  if (!isStoreProductSlug(slug)) throw new StoreCommerceOfferError("STORE_PRODUCT_NOT_FOUND");
  const catalog = await createStoreRepository().read();
  const product = findPublicStoreProductBySlug(catalog, slug);
  if (!product) throw new StoreCommerceOfferError("STORE_PRODUCT_NOT_FOUND");
  const source = catalog.products.find(item => item.slug === product.slug)!;
  if (source.inventory <= 0) throw new StoreCommerceOfferError("STORE_PRODUCT_OUT_OF_STOCK");
  // Same effective-price rule as Store cards/detail, including a zero sale price.
  const unitPrice = product.salePrice !== undefined && product.salePrice < product.price
    ? product.salePrice : product.price;
  const offer: StoreCommerceOffer = {
    domain: "store", productId: source.id, variantId: "default",
    slug: product.slug, name: product.name, unitPrice,
    quantityLimit: Math.min(99, source.inventory),
  };
  validateUnifiedCartItem({ ...offer, quantity: 1 });
  return offer;
}
