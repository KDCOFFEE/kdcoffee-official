import type { MetadataRoute } from "next";
import { getLiveWebsiteData } from "@/data/websiteData";
import { publishedPageRegistry } from "@/lib/pageBuilder";
import { readPageStore } from "@/lib/pageBuilderStore";
import { resolveWorksProductListing } from "@/lib/productListing";
import { getCanonicalPublicSiteOrigin } from "@/lib/publicSiteOrigin";
import { readPublicStoreSitemapProducts } from "@/lib/storePublicReadModel";
import { storeProductHref } from "@/lib/storePublicMetadata";
import { isStoreSeoPublicEnabled } from "@/lib/storeSeoPublication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [website, pages] = await Promise.all([getLiveWebsiteData(), readPageStore()]);
  const paths = [
    "/", "/works", "/monthly-menu",
    ...resolveWorksProductListing(website.menu.products).map(product => `/works/${encodeURIComponent(product.slug)}`),
    ...publishedPageRegistry(pages).filter(page => page.published).map(page => page.href),
  ];
  // An unpublished Store does not even require a Store catalog read.
  if (isStoreSeoPublicEnabled()) {
    paths.push("/store", ...(await readPublicStoreSitemapProducts()).map(product => storeProductHref(product.slug)));
  }
  const origin = getCanonicalPublicSiteOrigin();
  return [...new Set(paths)].map(path => ({ url: new URL(path, origin).href }));
}
