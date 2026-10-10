import type { Metadata } from "next";
import type { PublicStoreProductReadModel } from "./storePublicReadModel";
import { storeSeoPreview } from "./storeSeo";
import type { PublicStoreIndexOptions } from "./storePublicSelectors";

export type StoreSearchParams = Record<string, string | string[] | undefined>;

/** Shared pure URL contract for landing metadata, navigation and query parsing. */
export function firstStoreQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseStorePublicQuery(query: StoreSearchParams): PublicStoreIndexOptions {
  const sectionSlug = firstStoreQueryValue(query.section);
  const categorySlug = firstStoreQueryValue(query.category);
  const pageValue = firstStoreQueryValue(query.page);
  const candidate = pageValue !== undefined && /^\d+$/.test(pageValue) ? Number(pageValue) : NaN;
  return {
    ...(sectionSlug !== undefined ? { sectionSlug } : {}),
    ...(categorySlug !== undefined ? { categorySlug } : {}),
    page: Number.isSafeInteger(candidate) && candidate >= 1 ? candidate : 1,
  };
}

/** Category URLs always have a Section context; first-page links omit page=1. */
export function storeBrowseHref(options: PublicStoreIndexOptions = {}): string {
  const query = new URLSearchParams();
  if (options.sectionSlug) {
    query.set("section", options.sectionSlug);
    if (options.categorySlug) query.set("category", options.categorySlug);
  }
  if (options.page !== undefined && Number.isSafeInteger(options.page) && options.page > 1) {
    query.set("page", String(options.page));
  }
  const suffix = query.toString();
  return suffix ? `/store?${suffix}` : "/store";
}

export function storeLandingMetadata(query: StoreSearchParams = {}): Metadata {
  const description = "探索 KD Coffee 精選商品。";
  return {
    title: "商店",
    description,
    alternates: { canonical: "/store" },
    robots: { index: Object.keys(query).length === 0, follow: true },
    openGraph: {
      title: "商店｜KD Coffee", description, url: "/store",
      siteName: "KD Coffee", locale: "zh_TW", type: "website",
    },
    twitter: { card: "summary", title: "商店｜KD Coffee", description },
  };
}

/** Slugs arrive already decoded from Next; do not normalize product identities. */
export function isStoreProductSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
}
export function storeProductHref(slug: string): string {
  return `/store/${encodeURIComponent(slug)}`;
}

function safeShareImage(url: string | undefined): string | undefined {
  if (!url || /[\\\s]/u.test(url) || url.startsWith("//")) return undefined;
  if (url.startsWith("/")) return /[?#]/u.test(url) ? undefined : url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? url : undefined;
  } catch { return undefined; }
}

/** Pure metadata projection. Only the server uses the manual SEO wrapper. */
export function storeProductMetadata(model: PublicStoreProductReadModel): Metadata {
  const { product, manualSeo } = model;
  const seo = storeSeoPreview({ ...product, ...manualSeo });
  const description = seo.description || `${product.name}，KD Coffee 精選商品。`;
  const canonical = storeProductHref(product.slug);
  const imageCandidates = [
    product.heroMedia?.type === "image" ? product.heroMedia.url : product.heroMedia?.type === "video" ? product.heroMedia.posterUrl : undefined,
    ...product.gallery.filter(media => media.type === "image").map(media => media.url),
  ];
  const image = imageCandidates.map(safeShareImage).find(Boolean);
  return {
    title: seo.title, description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: { title: seo.title, description, url: canonical, siteName: "KD Coffee", locale: "zh_TW", type: "website",
      images: image ? [{ url: image, alt: product.name }] : [] },
    twitter: { card: image ? "summary_large_image" : "summary", title: seo.title, description,
      ...(image ? { images: [image] } : {}) },
  };
}
