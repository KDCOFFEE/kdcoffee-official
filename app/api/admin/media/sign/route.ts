import crypto from "crypto";
import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  createSignedProductVideoUpload,
  createSignedVideoUpload,
} from "@/lib/cloudinary";
import {
  isAllowedVideoUpload,
  isCloudinaryMediaUsage,
  VIDEO_UPLOAD_LIMITS,
} from "@/lib/media";
import { isCanonicalProductSlug } from "@/lib/productMediaNaming";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: noStoreHeaders },
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const usage = isCloudinaryMediaUsage(body.usage) ? body.usage : "content";
    const fileName = String(body.fileName || "");
    const mimeType = String(body.mimeType || "");
    const fileSize = Number(body.fileSize);
    const limits = VIDEO_UPLOAD_LIMITS[usage];

    if (!isAllowedVideoUpload(fileName, mimeType)) {
      return NextResponse.json(
        { error: "影片格式僅支援 MP4、MOV 或 WebM。" },
        { status: 400, headers: noStoreHeaders },
      );
    }

    if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > limits.maxBytes) {
      return NextResponse.json(
        {
          error: `影片大小不得超過 ${Math.round(limits.maxBytes / 1024 / 1024)} MB。`,
        },
        { status: 400, headers: noStoreHeaders },
      );
    }

    const productSlug = typeof body.productSlug === "string" ? body.productSlug.trim() : "";
    const mediaPurpose = typeof body.mediaPurpose === "string" ? body.mediaPurpose : "";
    const usesProductMediaNaming = Boolean(productSlug || mediaPurpose);
    const reservedPublicIds = Array.isArray(body.reservedPublicIds)
      ? body.reservedPublicIds
      : [];

    if (
      usesProductMediaNaming &&
      (
        !isCanonicalProductSlug(productSlug) ||
        mediaPurpose !== "clean-roasting" ||
        reservedPublicIds.length > 8 ||
        reservedPublicIds.some((publicId) =>
          typeof publicId !== "string" || !publicId.trim() || publicId.length > 220
        )
      )
    ) {
      return NextResponse.json(
        { error: "商品影片命名資料不正確。" },
        { status: 400, headers: noStoreHeaders },
      );
    }

    const signedUpload = usesProductMediaNaming
      ? await createSignedProductVideoUpload({
          productSlug,
          mediaPurpose: "clean-roasting",
          reservedPublicIds: reservedPublicIds.map((publicId) => String(publicId).trim()),
        })
      : createSignedVideoUpload(crypto.randomUUID());

    return NextResponse.json(
      {
        ...signedUpload,
        usage,
        maxBytes: limits.maxBytes,
        maxDurationSeconds: limits.maxDurationSeconds,
      },
      { headers: noStoreHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: "影片上傳服務尚未設定或暫時無法使用。" },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
