import path from "path";
import sharp from "sharp";

import type { AssetRecord } from "./assets.ts";
// @ts-expect-error Node's strip-types test runner requires the explicit extension.
import { isAllowedImageUpload } from "./media.ts";

export const PAGE_BUILDER_IMAGE_CATEGORY = "page-builder";
export const PAGE_BUILDER_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const PAGE_BUILDER_IMAGE_MAX_DIMENSION = 1800;

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

export function validatePageBuilderImageFile(file: Pick<File, "name" | "type" | "size">) {
  if (!isAllowedImageUpload(file.name, file.type)) {
    throw new Error("圖片格式僅支援 JPG、PNG 或 WebP。");
  }
  if (file.size <= 0 || file.size > PAGE_BUILDER_IMAGE_MAX_BYTES) {
    throw new Error("圖片大小必須介於 1 byte 與 15 MB 之間。");
  }
}

export async function optimizePageBuilderImage(input: Buffer) {
  return sharp(input)
    .rotate()
    .resize({
      width: PAGE_BUILDER_IMAGE_MAX_DIMENSION,
      height: PAGE_BUILDER_IMAGE_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 84, effort: 4 })
    .toBuffer();
}

export function pageBuilderImageIdentity(originalFileName: string, uuid: string) {
  const sourceStem = cleanStem(path.parse(originalFileName).name) || "image";
  const suffix = uuid.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 12);
  const seoStem = `kd-coffee-page-${sourceStem}-${suffix}`;
  return {
    id: `PAGEIMG-${suffix.toUpperCase()}`,
    seoStem,
    fileName: `${seoStem}-v01.webp`,
  };
}

export function createPageBuilderAsset({
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
    category: PAGE_BUILDER_IMAGE_CATEGORY,
    name: readableName,
    usage: "Page Builder 活動／專題頁",
    path: publicPath,
    recommendedSize: "最長邊 1800 px；系統自動最佳化",
    displaySize: "依頁面區塊與裝置自適應",
    format: "WebP",
    alt: readableName,
    seoStem,
    status: "active",
    originalFileName,
    updatedAt: now,
  };
}
