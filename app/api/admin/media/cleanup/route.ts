import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { safeCloudinaryErrorMessage } from "@/lib/cloudinary";
import { scanCloudinaryCleanupVideos } from "@/lib/cloudinaryCleanup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

function safeErrorName(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  return /^[a-z0-9_.:-]{1,80}$/i.test(name) ? name : "Error";
}

export async function POST() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: noStoreHeaders },
    );
  }

  try {
    const scan = await scanCloudinaryCleanupVideos();
    console.info(JSON.stringify({
      event: "cloudinary_cleanup_scan",
      total: scan.total,
      used: scan.used,
      orphan: scan.orphan,
    }));
    return NextResponse.json(scan, { headers: noStoreHeaders });
  } catch (error) {
    console.warn(JSON.stringify({
      event: "cloudinary_cleanup_scan_failed",
      errorName: safeErrorName(error),
      errorMessage: safeCloudinaryErrorMessage(error),
    }));
    return NextResponse.json(
      { error: "Cloudinary 影片掃描失敗，請稍後再試。" },
      { status: 502, headers: noStoreHeaders },
    );
  }
}
