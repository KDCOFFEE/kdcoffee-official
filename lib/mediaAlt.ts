import { isMeaningfulAssetText, resolveAssetAlt } from "./assetMetadata";
import type { MediaAsset } from "./media";

export type MediaDescription = { media?: MediaAsset; alt?: string; decorative?: boolean };

export function sameMediaIdentity(left?: MediaAsset, right?: MediaAsset) {
  if (!left || !right || left.type !== right.type) return false;
  if (left.publicId && right.publicId) return left.publicId === right.publicId && left.provider === right.provider;
  return left.url === right.url;
}

/** Called by selection handlers only. Same-media edits retain the Owner's decision. */
export function replacementMediaDescription(previous: MediaDescription | undefined, media: MediaAsset, fallback = "") {
  if (sameMediaIdentity(previous?.media, media)) {
    return { media, alt: previous?.alt ?? "", ...(previous?.decorative !== undefined ? { decorative: previous.decorative } : {}) };
  }
  const alt = resolveAssetAlt({ alt: media.alt }) || (isMeaningfulAssetText(fallback) ? fallback.trim() : "");
  return { media, alt, decorative: false };
}
