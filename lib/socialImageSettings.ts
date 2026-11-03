import type { AssetRecord } from "./assets";
// @ts-expect-error -- Native Page Builder contract tests require the extension.
import { safeSocialImage } from "./socialMetadata.ts";

export type SocialImageValue = { path: string; alt: string; assetId?: string };
export function isSocialLibraryImage(asset: AssetRecord) {
  return asset.status === "active" && asset.path.startsWith("/") && Boolean(safeSocialImage(asset.path));
}
export function validateSocialImageValue(value: unknown): asserts value is SocialImageValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("分享圖片格式不正確。");
  const image = value as Record<string, unknown>;
  if (Object.keys(image).some(key => !["path", "alt", "assetId"].includes(key)) || typeof image.path !== "string"
    || !image.path.startsWith("/") || !safeSocialImage(image.path)
    || typeof image.alt !== "string" || image.alt.length > 240
    || (image.assetId !== undefined && (typeof image.assetId !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(image.assetId)))) throw new Error("請從素材庫選擇安全的公開分享圖片。");
}
