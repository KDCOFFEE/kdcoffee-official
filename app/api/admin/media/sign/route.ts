import crypto from "crypto";
import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { createSignedVideoUpload } from "@/lib/cloudinary";
import {
  isAllowedVideoUpload,
  isCloudinaryMediaUsage,
  VIDEO_UPLOAD_LIMITS,
} from "@/lib/media";

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

    const signedUpload = createSignedVideoUpload(crypto.randomUUID());

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
