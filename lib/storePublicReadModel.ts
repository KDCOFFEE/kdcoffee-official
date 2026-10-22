import "server-only";

import { createStoreRepository } from "./storeRepository";
import { publicStoreHero } from "./storeHero";
import { findPublicStoreProductBySlug, selectPublicStoreIndex } from "./storePublicSelectors";
import type { PublicStoreIndexOptions, PublicStoreProductDetail } from "./storePublicSelectors";

export type PublicStoreProductReadModel = {
  product: PublicStoreProductDetail;
  /** Detail-only presentation value; never adds reward internals to public cards or gallery props. */
  pvValue?: number;
  /** Server-side source values only; pass product, not this wrapper, to client components. */
  manualSeo: { seoTitle?: string; seoDescription?: string };
};

/** One lock-free repository read; integrity and filesystem errors propagate unchanged. */
export async function readPublicStoreIndex(options: PublicStoreIndexOptions = {}) {
  const catalog = await createStoreRepository().read();
  return {
    ...selectPublicStoreIndex(catalog, options),
    // Only a narrow public projection is added when optional settings exist.
    ...(catalog.settings?.hero ? { hero: publicStoreHero(catalog.settings.hero) } : {}),
  };
}

export async function readPublicStoreProductBySlug(slug: string): Promise<PublicStoreProductReadModel | null> {
  const catalog = await createStoreRepository().read();
  const product = findPublicStoreProductBySlug(catalog, slug);
  if (!product) return null;
  const source = catalog.products.find(item => item.slug === slug)!;
  return {
    product,
    pvValue: source.pvValue,
    manualSeo: {
      ...(source.seoTitle !== undefined ? { seoTitle: source.seoTitle } : {}),
      ...(source.seoDescription !== undefined ? { seoDescription: source.seoDescription } : {}),
    },
  };
}
/** Enumerate the same canonical public index across all pages from one snapshot. */
export async function readPublicStoreSitemapProducts(): Promise<{ slug: string }[]> {
  const catalog = await createStoreRepository().read();
  const first = selectPublicStoreIndex(catalog).products;
  const products = first.items.map(({ slug }) => ({ slug }));
  for (let page = 2; page <= first.totalPages; page += 1) {
    products.push(...selectPublicStoreIndex(catalog, { page }).products.items.map(({ slug }) => ({ slug })));
  }
  return products;
}
