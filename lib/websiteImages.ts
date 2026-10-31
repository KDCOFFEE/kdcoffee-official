import path from "path";
import sharp from "sharp";

import type { AssetRecord } from "./assets.ts";
// @ts-expect-error Node's strip-types test runner requires the explicit extension.
import { CUSTOM_SECTION_IMAGE_LIMITS, imageExtension, isAllowedImageUpload } from "./media.ts";
// @ts-expect-error Node's strip-types test runner requires the explicit extension.
import { resolveAssetAlt } from "./assetMetadata.ts";

export const WEBSITE_IMAGE_CATEGORY = "page-builder";
export const WEBSITE_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const WEBSITE_IMAGE_MAX_DIMENSION = 1800;

function cleanStem(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
}

export function validateWebsiteImageFile(file: Pick<File, "name" | "type" | "size">) {
  if (!isAllowedImageUpload(file.name, file.type)) {
    throw new Error("圖片格式僅支援 JPG、PNG 或 WebP。");
  }
  if (file.size <= 0 || file.size > WEBSITE_IMAGE_MAX_BYTES) {
    throw new Error("圖片大小必須介於 1 byte 與 15 MB 之間。");
  }
}

export async function optimizeWebsiteImage(input: Buffer) {
  return sharp(input)
    .rotate()
    .resize({
      width: WEBSITE_IMAGE_MAX_DIMENSION,
      height: WEBSITE_IMAGE_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 84, effort: 4 })
    .toBuffer();
}

export function websiteImageIdentity(originalFileName: string, uuid: string) {
  const sourceStem = cleanStem(path.parse(originalFileName).name) || "image";
  const suffix = uuid.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 12);
  const seoStem = `kd-coffee-page-${sourceStem}-${suffix}`;
  return {
    id: `PAGEIMG-${suffix.toUpperCase()}`,
    seoStem,
    fileName: `${seoStem}-v01.webp`,
  };
}

export function createWebsiteImageAsset({
  id,
  seoStem,
  originalFileName,
  publicPath,
  now,
}: {
  id: string;
  seoStem: string;
  originalFileName: string;
  publicPath: string;
  now: string;
}): AssetRecord {
  const readableName = path.parse(originalFileName).name.trim() || "Page Builder 圖片";
  return {
    id,
    category: WEBSITE_IMAGE_CATEGORY,
    name: readableName,
    usage: "Page Builder 活動／專題頁",
    path: publicPath,
    recommendedSize: "最長邊 1800 px；系統自動最佳化",
    displaySize: "依頁面區塊與裝置自適應",
    format: "WebP",
    alt: resolveAssetAlt({ name: readableName, originalFileName, id, path: publicPath, seoStem }),
    seoStem,
    status: "active",
    originalFileName,
    updatedAt: now,
  };
}

/** Opt-in shared safety for new upload callers. Historical callers retain their validation. */
export const SAFE_IMAGE_LIMITS = { maxBytes: 12 * 1024 * 1024, maxDimension: CUSTOM_SECTION_IMAGE_LIMITS.maxDimension, maxPixels: CUSTOM_SECTION_IMAGE_LIMITS.maxPixels } as const;
export class ImageSafetyError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export type ImageInspectionLimits = { maxBytes: number; maxDimension: number; maxPixels: number; minWidth?: number; minHeight?: number };
export const LINE_CARD_IMAGE_LIMITS = { maxBytes: 5 * 1024 * 1024, maxDimension: 4096, maxPixels: 8_000_000, minWidth: 320, minHeight: 100 } as const;
export async function inspectImageBytes(bytes: Buffer, fileName: string, mimeType?: string, limits: ImageInspectionLimits = SAFE_IMAGE_LIMITS) {
  try {
    const image = sharp(bytes, { failOn: "error", limitInputPixels: limits.maxPixels });
    const meta = await image.metadata(), extension = imageExtension(fileName), expected = extension === "jpg" ? "jpeg" : extension;
    if (meta.format !== (expected === "avif" ? "heif" : expected) || (mimeType && mimeType !== "image/" + expected) || !meta.width || !meta.height || meta.width > limits.maxDimension || meta.height > limits.maxDimension || meta.width * meta.height > limits.maxPixels || meta.width < (limits.minWidth || 1) || meta.height < (limits.minHeight || 1) || (meta.pages || 1) !== 1) throw new Error("format");
    await image.stats();
    return { format: meta.format, width: meta.width, height: meta.height, bytes: bytes.length, frames: meta.pages || 1 };
  } catch { throw new ImageSafetyError("圖片內容、格式或尺寸無法驗證，請使用有效的 JPG、PNG 或 WebP 圖片。"); }
}
export async function inspectUploadedImage(file: File, limits: ImageInspectionLimits = SAFE_IMAGE_LIMITS) {
  if (!isAllowedImageUpload(file.name, file.type) || /[\\/\u0000-\u001f]/u.test(file.name) || file.name.length > 300 || file.size <= 0 || file.size > limits.maxBytes) throw new ImageSafetyError("請使用大小限制以內的 JPG、PNG 或 WebP 圖片。");
  const bytes = Buffer.from(await file.arrayBuffer());
  return { bytes, metadata: await inspectImageBytes(bytes, file.name, file.type, limits) };
}
