import "server-only";

import { createStoreRepository } from "./storeRepository";
import { findPublicStoreProductBySlug, selectPublicStoreIndex } from "./storePublicSelectors";
import type { PublicStoreIndexOptions, PublicStoreProductDetail } from "./storePublicSelectors";

export type PublicStoreProductReadModel = {
  product: PublicStoreProductDetail;
  /** Server-side source values only; pass product, not this wrapper, to client components. */
  manualSeo: { seoTitle?: string; seoDescription?: string };
};

/** One lock-free repository read; integrity and filesystem errors propagate unchanged. */
export async function readPublicStoreIndex(options: PublicStoreIndexOptions = {}) {
  const catalog = await createStoreRepository().read();
  return selectPublicStoreIndex(catalog, options);
}

export async function readPublicStoreProductBySlug(slug: string): Promise<PublicStoreProductReadModel | null> {
  const catalog = await createStoreRepository().read();
  const product = findPublicStoreProductBySlug(catalog, slug);
  if (!product) return null;
  const source = catalog.products.find(item => item.slug === slug)!;
  return {
    product,
    manualSeo: {
      ...(source.seoTitle !== undefined ? { seoTitle: source.seoTitle } : {}),
      ...(source.seoDescription !== undefined ? { seoDescription: source.seoDescription } : {}),
    },
  };
}