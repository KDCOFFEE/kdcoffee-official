import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  CloudinaryFinalizeError,
  safeCloudinaryErrorMessage,
  verifyCloudinaryCustomSectionMedia,
  verifyCloudinaryVideo,
} from "@/lib/cloudinary";
import {
  CLOUDINARY_IMAGE_FOLDER,
  CLOUDINARY_VIDEO_FOLDER,
  isCloudinaryMediaUsage,
} from "@/lib/media";
import { isProductMediaPublicId } from "@/lib/productMediaNaming";
import {
  CUSTOM_SECTION_MEDIA_PURPOSE,
  isCustomSectionMediaPublicId,
  isCustomSectionMediaType,
  isCustomSectionStableId,
} from "@/lib/customSectionMediaNaming";
import { isCanonicalProductSlug } from "@/lib/productMediaNaming";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

function finalizeResponse(code: string, status: number, error = "影片驗證尚未完成，請稍後再試。") {
  return NextResponse.json(
    { error, code },
    { status, headers: noStoreHeaders },
  );
}

function safeLogCode(value: unknown, fallback: string) {
  const code = typeof value === "string" ? value : "";
  return /^[a-z0-9_.:-]{1,80}$/i.test(code) ? code : fallback;
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: noStoreHeaders },
    );
  }

  let customSectionRequest = false;
  let customSectionMediaType: "image" | "video" | undefined;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const publicId = String(body.publicId || "").trim();
    const usage = isCloudinaryMediaUsage(body.usage) ? body.usage : "content";
    const reuseExisting = body.reuseExisting === true;
    const mediaPurpose = typeof body.mediaPurpose === "string" ? body.mediaPurpose : "";
    if (mediaPurpose === CUSTOM_SECTION_MEDIA_PURPOSE) {
      customSectionRequest = true;
      const productSlug = typeof body.productSlug === "string" ? body.productSlug.trim() : "";
      const sectionId = typeof body.sectionId === "string" ? body.sectionId : "";
      const mediaType = body.mediaType;
      if (isCustomSectionMediaType(mediaType)) customSectionMediaType = mediaType;
      const valid =
        isCanonicalProductSlug(productSlug) &&
        isCustomSectionStableId(sectionId) &&
        isCustomSectionMediaType(mediaType) &&
        publicId.startsWith(`${mediaType === "image" ? CLOUDINARY_IMAGE_FOLDER : CLOUDINARY_VIDEO_FOLDER}/`) &&
        isCustomSectionMediaPublicId({ publicId, productSlug, sectionId, mediaType });
      if (!valid) return finalizeResponse("FINALIZE_RESOURCE_INVALID", 400, "自訂 Section 媒體命名資料不正確。");
      const media = await verifyCloudinaryCustomSectionMedia(publicId, mediaType);
      return NextResponse.json({ ok: true, media }, { headers: noStoreHeaders });
    }
    const legacyPublicId = new RegExp(
      `^${CLOUDINARY_VIDEO_FOLDER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[a-f0-9-]{36}$`,
    );

    const publicIdPrefixValid =
      (reuseExisting && publicId.startsWith(`${CLOUDINARY_VIDEO_FOLDER}/`)) ||
      legacyPublicId.test(publicId) ||
      (
        publicId.startsWith(`${CLOUDINARY_VIDEO_FOLDER}/`) &&
        isProductMediaPublicId({ publicId, mediaPurpose: "clean-roasting" })
      );
    if (!publicIdPrefixValid) {
      console.warn(JSON.stringify({
        event: "cloudinary_finalize_failed",
        stage: "resource_validation",
        errorName: "CloudinaryPublicIdValidationError",
        errorMessage: "Cloudinary public ID format was invalid",
        cloudinaryErrorCode: "PUBLIC_ID_FORMAT_INVALID",
        publicIdPrefixValid: false,
      }));
      return finalizeResponse("FINALIZE_RESOURCE_INVALID", 400);
    }

    const media = await verifyCloudinaryVideo(publicId, usage);

    return NextResponse.json(
      { ok: true, media },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    const known = error instanceof CloudinaryFinalizeError ? error : null;
    console.warn(JSON.stringify({
      event: "cloudinary_finalize_failed",
      stage: known?.stage || "unknown",
      errorName: safeLogCode(
        known?.sourceErrorName || (error instanceof Error ? error.name : ""),
        "Error",
      ),
      errorMessage: known?.message || safeCloudinaryErrorMessage(error),
      ...(known?.httpCode ? { httpCode: known.httpCode } : {}),
      ...(known?.cloudinaryErrorCode ? { cloudinaryErrorCode: known.cloudinaryErrorCode } : {}),
      publicIdPrefixValid: true,
      ...(known?.resource.resourceType ? { resourceType: known.resource.resourceType } : {}),
      ...(known?.resource.format ? { format: known.resource.format } : {}),
      ...(known?.resource.bytes !== undefined ? { bytes: known.resource.bytes } : {}),
      ...(known?.resource.duration !== undefined ? { duration: known.resource.duration } : {}),
    }));
    const code = known?.errorCode || "FINALIZE_UNKNOWN";
    const status = code === "FINALIZE_LOOKUP_FAILED" ? 502 : code === "FINALIZE_PROCESSING" ? 425 : 422;
    if (code === "FINALIZE_PROCESSING") {
      return finalizeResponse(code, status, "影片仍在 Cloudinary 處理中，請稍後重新選擇影片再試。");
    }
    return customSectionRequest
      ? finalizeResponse(code, status, customSectionMediaType === "image" ? "圖片驗證失敗，請確認格式後重新上傳。" : "影片驗證失敗，請確認格式後重新上傳。")
      : finalizeResponse(code, status);
  }
}
