import "server-only";
import type { Metadata } from "next";
import { cache } from "react";
import { getAssetLibrary } from "./assets";
import { assertAssetImageAvailable } from "./assetImages";
import { DEFAULT_SOCIAL_IMAGE, safeSocialImage } from "./socialMetadata";

// Reuse the existing Admin Asset Library's social-share slot; no second CMS.
const siteSocialImage = cache(async () => {
  const library = await getAssetLibrary().catch(() => null);
  for (const id of ["LOGO005", "LOGO001"]) {
    const asset = library?.assets.find(item => item.id === id && item.status === "active");
    const url = safeSocialImage(asset?.path);
    if (!asset || !url) continue;
    try {
      // Existing local brand assets must still exist; do not publish a stale file.
      if (asset.path.startsWith("/")) await assertAssetImageAvailable(asset.path, false);
      return { url, alt: asset.alt || DEFAULT_SOCIAL_IMAGE.alt };
    } catch { /* Try the next registered brand fallback. */ }
  }
  return DEFAULT_SOCIAL_IMAGE;
});

/** Replace only the shared fallback. Page-specific approved images win. */
export async function withSiteSocialImage(metadata: Metadata): Promise<Metadata> {
  const image = await siteSocialImage();
  if (image.url === DEFAULT_SOCIAL_IMAGE.url) return metadata;
  const og = metadata.openGraph as { images?: { url: string }[] } | undefined;
  const twitter = metadata.twitter as { images?: { url: string }[] } | undefined;
  return { ...metadata,
    openGraph: og?.images?.[0] === DEFAULT_SOCIAL_IMAGE ? { ...metadata.openGraph, images: [image] } : metadata.openGraph,
    twitter: twitter?.images?.[0] === DEFAULT_SOCIAL_IMAGE ? { ...metadata.twitter, images: [image] } : metadata.twitter,
  };
}
