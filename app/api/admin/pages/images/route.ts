import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { uploadWebsiteImageAsset } from "@/lib/assetImageUploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await request.formData(), file = form.get("file");
    if (!(file instanceof File)) throw new Error("沒有選擇圖片。");
    return NextResponse.json({ ok: true, ...await uploadWebsiteImageAsset(file) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "圖片上傳失敗。" }, { status: 400 });
  }
}
