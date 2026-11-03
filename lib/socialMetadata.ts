import type { Metadata } from "next";
// @ts-expect-error -- Native Page Builder contract tests require the extension.
import { getCanonicalPublicSiteOrigin } from "./publicSiteOrigin.ts";

export const BRAND_NAME = "KD 咖啡藝術工坊";
export const BRAND_DESCRIPTION = "高雄精品咖啡工坊。自製流床式熱風烘豆機，搭配紅外線熱顯像與職人杯測，呈現乾淨、清楚、有層次的咖啡風味。";
// Owner's final 1200×630 JPEG belongs here. Do not publish a missing image URL.
export const OWNER_SOCIAL_IMAGE_PATH = "/seo/kd-coffee-social-share.jpg";
// Existing KD-owned, publicly verified PNG; interim until the Owner supplies the card.
export const DEFAULT_SOCIAL_IMAGE = {
  url: `${getCanonicalPublicSiteOrigin()}/uploads/assets/logo/kd-coffee-logo-primary-v05.png`,
  alt: "KD Coffee 咖啡藝術工坊", width: 2000, height: 2000, type: "image/png",
};

/** Accept only public site media or unsigned Cloudinary image delivery.
 * Callers supply authoritative CMS/product fields, never visitor input. */
export function safeSocialImage(value: unknown): string | undefined {
  if (typeof value !== "string" || !value || /[\\\s\u0000-\u001f]/u.test(value) || /%(?:2e|2f|5c|00)/i.test(value) || value.includes("..")) return;
  if (value.startsWith("//")) return;
  try {
    const url = new URL(value, getCanonicalPublicSiteOrigin());
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return;
    if (!/\.(?:jpe?g|png|webp)$/i.test(url.pathname)) return;
    if (["www.kdcoffee1962.com", "kdcoffee1962.com"].includes(url.hostname)) {
      if (!/^\/(?:uploads\/(?:assets|artworks)\/|images\/|seo\/)/.test(url.pathname)) return;
      return new URL(url.pathname, getCanonicalPublicSiteOrigin()).href;
    }
    if (url.hostname === "res.cloudinary.com" && /^\/[^/]+\/(?:image|video)\/upload\//.test(url.pathname)
      && !/\/s--|\/(?:authenticated|private)\//.test(url.pathname)
      && /\/kd-coffee\/(?:images|videos)\//.test(url.pathname)) return url.href;
  } catch { /* Invalid media falls through to the public brand image. */ }
}

export function canonicalPublicUrl(path: string): string {
  const url = new URL(path, getCanonicalPublicSiteOrigin());
  // Canonical identity is independent of attribution, filters and URL fragments.
  return new URL(url.pathname, getCanonicalPublicSiteOrigin()).href;
}

export function socialPageMetadata(input: { path: string; title: string; description?: string; images?: unknown[]; imageAlt?: string }): Metadata {
  const url = canonicalPublicUrl(input.path);
  const description = input.description?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || BRAND_DESCRIPTION;
  const selected = input.images?.map(safeSocialImage).find(Boolean);
  const image = selected ? { url: selected, alt: input.imageAlt || input.title } : DEFAULT_SOCIAL_IMAGE;
  return {
    title: { absolute: input.title }, description,
    alternates: { canonical: url },
    openGraph: { type: "website", locale: "zh_TW", siteName: BRAND_NAME, title: input.title, description, url, images: [image] },
    twitter: { card: "summary_large_image", title: input.title, description, images: [image] },
  };
}

export const rootMetadata: Metadata = {
  ...socialPageMetadata({ path: "/", title: "KD 咖啡藝術工坊｜KD Coffee 精品咖啡", description: BRAND_DESCRIPTION }),
  metadataBase: new URL(getCanonicalPublicSiteOrigin()),
  title: { default: "KD 咖啡藝術工坊｜KD Coffee 精品咖啡", template: "%s｜KD 咖啡藝術工坊" },
  creator: BRAND_NAME, publisher: BRAND_NAME,
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.ico" },
};

export function monthlySocialImages(background: { media?: { posterUrl?: string }; image?: string }): unknown[] {
  return [background.media?.posterUrl, background.image];
}
