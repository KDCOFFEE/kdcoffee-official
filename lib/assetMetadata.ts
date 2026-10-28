import type { AssetRecord } from "./assets";

type AssetMetadata = Partial<Pick<AssetRecord, "alt" | "name" | "originalFileName" | "id" | "path" | "seoStem">>;

/** Shared form of the Store library's opaque-name guard, extended to canonical IDs/paths. */
export function isMeaningfulAssetText(value: unknown, asset: AssetMetadata = {}): value is string {
  if (typeof value !== "string") return false;
  const text = value.trim(), stem = text.replace(/\.(?:avif|gif|jpe?g|png|svg|webp)$/i, "").replace(/-v\d+$/i, "");
  if (!text || /[\\/<>\u0000-\u001f\u007f]/u.test(text) || /^(?:https?|data|file|blob|javascript|ftp):/i.test(text)) return false;
  if ([asset.id, asset.path, asset.seoStem].some(identifier => identifier && text.toLowerCase() === identifier.toLowerCase())) return false;
  // UUID detection is the existing Store convention, including UUIDs embedded in filenames.
  if (/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/i.test(text) || /^[a-f0-9]{12,}$/i.test(stem) || /^\d+$/.test(stem)) return false;
  if (/^(?:asset|pageimg)[-_][a-z0-9_-]+$/i.test(stem) || /^(?:media|image|img|logo|home)[-_]?[a-z0-9]*\d[a-z0-9_-]*$/i.test(stem)) return false;
  if (/^kd-?coffee-.*-[a-f0-9]{12,}$/i.test(stem) || /^\.?(?:avif|gif|jpe?g|png|svg|webp)$/i.test(text)) return false;
  return true;
}

/** Existing Asset convention: explicit alt, display name, original filename stem; never storage names. */
export function resolveAssetAlt(asset: AssetMetadata): string {
  const originalName = asset.originalFileName?.replace(/\.[^.]+$/, "");
  for (const text of [asset.alt, asset.name, originalName]) {
    if (isMeaningfulAssetText(text, asset)) return text.trim();
  }
  return "";
}
