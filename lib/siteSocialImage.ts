import "server-only";
import type { Metadata } from "next";
import { cache } from "react";
import { getAssetLibrary } from "./assets";
import { DEFAULT_SOCIAL_IMAGE, safeSocialImage } from "./socialMetadata";

// Reuse the existing Admin Asset Library's social-share slot; no second CMS.
const siteSocialImage = cache(async () => {
  const library = await getAssetLibrary().catch(() => null);
  const asset = library?.assets.find(item => item.id === "LOGO005" && item.status === "active");
  const url = safeSocialImage(asset?.path);
  return url ? { url, alt: asset?.alt || DEFAULT_SOCIAL_IMAGE.alt } : DEFAULT_SOCIAL_IMAGE;
});

/** Replace only the shared fallback. Page-specific approved images win. */
export async function withSiteSocialImage(metadata: Metadata): Promise<Metadata> {
  const image = await siteSocialImage();
  if (image.url === DEFAULT_SOCIAL_IMAGE.url) return metadata;
  const og = metadata.openGraph as { images?: { url: string }[] } | undefined;
  const twitter = metadata.twitter as { images?: { url: string }[] } | undefined;
  return { ...metadata,
    openGraph: og?.images?.[0]?.url === DEFAULT_SOCIAL_IMAGE.url ? { ...metadata.openGraph, images: [image] } : metadata.openGraph,
    twitter: twitter?.images?.[0]?.url === DEFAULT_SOCIAL_IMAGE.url ? { ...metadata.twitter, images: [image] } : metadata.twitter,
  };
}
