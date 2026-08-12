import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { verifyCloudinaryVideo } from "@/lib/cloudinary";
import {
  CLOUDINARY_VIDEO_FOLDER,
  isCloudinaryMediaUsage,
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
    const publicId = String(body.publicId || "").trim();
    const usage = isCloudinaryMediaUsage(body.usage) ? body.usage : "content";
    const safePublicId = new RegExp(
      `^${CLOUDINARY_VIDEO_FOLDER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[a-f0-9-]{36}$`,
    );

    if (!safePublicId.test(publicId)) {
      return NextResponse.json(
        { error: "影片資料驗證失敗。" },
        { status: 400, headers: noStoreHeaders },
      );
    }

    const media = await verifyCloudinaryVideo(publicId, usage);

    return NextResponse.json(
      { ok: true, media },
      { headers: noStoreHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: "影片驗證尚未完成，請稍後再試。" },
      { status: 422, headers: noStoreHeaders },
    );
  }
}
