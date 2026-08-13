import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { safeCloudinaryErrorMessage } from "@/lib/cloudinary";
import {
  deleteCloudinaryOrphanVideos,
  isManagedCloudinaryVideoPublicId,
  MAX_CLEANUP_DELETE_COUNT,
} from "@/lib/cloudinaryCleanup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

function safeErrorName(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  return /^[a-z0-9_.:-]{1,80}$/i.test(name) ? name : "Error";
}

function invalidRequest(error: string) {
  return NextResponse.json(
    { error },
    { status: 400, headers: noStoreHeaders },
  );
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: noStoreHeaders },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("刪除資料格式不正確。");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return invalidRequest("刪除資料格式不正確。");
  }
  const publicIds = (body as Record<string, unknown>).publicIds;
  if (!Array.isArray(publicIds) || publicIds.length < 1) {
    return invalidRequest("請選擇要刪除的影片。");
  }
  if (publicIds.length > MAX_CLEANUP_DELETE_COUNT) {
    return invalidRequest(`一次最多刪除 ${MAX_CLEANUP_DELETE_COUNT} 支影片。`);
  }
  const normalized = publicIds.map((value) =>
    typeof value === "string" ? value.trim() : "",
  );
  if (
    normalized.some((publicId) => !isManagedCloudinaryVideoPublicId(publicId)) ||
    new Set(normalized).size !== normalized.length
  ) {
    return invalidRequest("影片識別資料不正確。");
  }

  let results: Awaited<ReturnType<typeof deleteCloudinaryOrphanVideos>>;
  try {
    results = await deleteCloudinaryOrphanVideos(normalized);
  } catch (error) {
    console.warn(JSON.stringify({
      event: "cloudinary_cleanup_delete_failed",
      requestedCount: normalized.length,
      errorName: safeErrorName(error),
      errorMessage: safeCloudinaryErrorMessage(error),
    }));
    return NextResponse.json(
      { error: "影片刪除驗證失敗，未執行刪除。" },
      { status: 502, headers: noStoreHeaders },
    );
  }
  const deletedCount = results.filter((item) => item.status === "deleted").length;
  const skippedInUse = results.filter((item) => item.status === "skipped_in_use").length;
  const failedCount = results.length - deletedCount - skippedInUse;
  console.info(JSON.stringify({
    event: "cloudinary_cleanup_delete",
    requestedCount: normalized.length,
    deletedCount,
    skippedInUse,
    failedCount,
  }));

  return NextResponse.json(
    { ok: failedCount === 0, results, deletedCount, skippedInUse, failedCount },
    { headers: noStoreHeaders },
  );
}
