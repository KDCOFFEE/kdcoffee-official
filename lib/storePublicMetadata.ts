import type { Metadata } from "next";
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
