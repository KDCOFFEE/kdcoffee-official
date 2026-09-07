import "server-only";

import {
  CloudinaryFinalizeError,
  verifyCloudinaryVideo,
} from "@/lib/cloudinary";
import {
  CLOUDINARY_VIDEO_FOLDER,
  isMediaAsset,
} from "@/lib/media";
import type { ProductAssetUpdate } from "@/lib/productAssetUpdates";

const VIDEO_ASSET_TYPES = new Set([
  "hero",
  "productPhoto",
  "mainVisual",
  "artworkCover",
  // J.4 H2: only this product-detail asset is additionally allowed to
  // mirror a video as its primary media when Gallery item #1 is a video.
  "roastedBeanPhoto",
]);

const PRODUCT_PUBLIC_ID = new RegExp(
  `^${CLOUDINARY_VIDEO_FOLDER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$`,
  "i",
);

type UnknownRecord = Record<string, unknown>;

export class ProductMediaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductMediaValidationError";
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function productAssetSupportsVideo(assetType: string) {
  return VIDEO_ASSET_TYPES.has(assetType);
}

async function verifyProductAsset(
  assetType: string,
  value: UnknownRecord,
) {
  if (!("media" in value) || value.media === undefined) return { ...value };
  if (value.media === null) return { ...value, media: null };
  if (!isMediaAsset(value.media)) {
    throw new ProductMediaValidationError("商品媒體資料格式不正確。");
  }

  if (value.media.type === "image") {
    const path = String(value.path || "").trim();
    const isLocalImage =
      value.media.provider === "local" &&
      value.media.url.trim() === path &&
      path.startsWith("/") &&
      !/\.(?:mp4|mov|webm)(?:$|[?#])/i.test(path);
    if (!isLocalImage) {
      throw new ProductMediaValidationError("商品圖片媒體資料不正確。");
    }
    return {
      ...value,
      media: { type: "image" as const, url: path, provider: "local" as const },
    };
  }
  if (!productAssetSupportsVideo(assetType)) {
    throw new ProductMediaValidationError("此商品素材欄位僅支援圖片。");
  }
  if (value.media.provider !== "cloudinary") {
    throw new ProductMediaValidationError("商品影片必須使用已驗證的 Cloudinary 媒體。");
  }

  const publicId = String(value.media.publicId || "").trim();
  const publicIdValid =
    assetType === "roastedBeanPhoto"
      ? publicId.startsWith(`${CLOUDINARY_VIDEO_FOLDER}/`)
      : PRODUCT_PUBLIC_ID.test(publicId);
  if (!publicIdValid) {
    throw new ProductMediaValidationError("商品影片識別資料不正確，請重新上傳。");
  }

  try {
    const verifiedMedia = await verifyCloudinaryVideo(publicId, "product");
    if (!verifiedMedia.posterUrl) {
      throw new ProductMediaValidationError("商品影片缺少可用的靜態預覽圖。");
    }
    return { ...value, media: verifiedMedia };
  } catch (error) {
    if (error instanceof ProductMediaValidationError) throw error;
    if (error instanceof CloudinaryFinalizeError) {
      throw new ProductMediaValidationError("商品影片驗證失敗，請重新上傳。");
    }
    throw error;
  }
}

async function verifyRoastedBeanGallery(
  value: UnknownRecord,
) {
  if (!("gallery" in value) || value.gallery === undefined) return { ...value };
  if (!Array.isArray(value.gallery)) {
    throw new ProductMediaValidationError("烘焙豆 Gallery 資料格式不正確。");
  }

  const gallery: UnknownRecord[] = [];
  for (const item of value.gallery) {
    if (!isRecord(item)) {
      throw new ProductMediaValidationError("烘焙豆 Gallery 媒體項目格式不正確。");
    }

    // Reuse the exact same trusted media verification used by product assets.
    // This validates local images and re-fetches Cloudinary video metadata.
    gallery.push(await verifyProductAsset("roastedBeanPhoto", item));
  }

  return { ...value, gallery };
}

export async function verifyProductAssetUpdates(
  updates: ProductAssetUpdate[],
): Promise<ProductAssetUpdate[]> {
  const verified: ProductAssetUpdate[] = [];

  for (const update of updates) {
    if (!isRecord(update)) {
      throw new ProductMediaValidationError("商品素材資料格式不正確。");
    }
    if (!("assets" in update)) {
      verified.push({ ...update });
      continue;
    }
    if (!isRecord(update.assets)) {
      throw new ProductMediaValidationError("商品素材資料格式不正確。");
    }

    const assets: Record<string, UnknownRecord> = {};
    for (const [assetType, value] of Object.entries(update.assets)) {
      if (!assetType.trim() || !isRecord(value)) {
        throw new ProductMediaValidationError("商品素材項目格式不正確。");
      }
      const verifiedAsset = await verifyProductAsset(assetType, value);
      assets[assetType] =
        assetType === "roastedBeanPhoto"
          ? await verifyRoastedBeanGallery(verifiedAsset)
          : verifiedAsset;
    }
    verified.push({ ...update, assets });
  }

  return verified;
}
