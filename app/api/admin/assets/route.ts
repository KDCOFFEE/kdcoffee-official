import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { AssetLibraryVersionConflictError, getAssetLibrary, saveAssetLibrary } from "@/lib/assets";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getAssetLibrary());
}

export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    if (!body || !Array.isArray(body.assets)) return NextResponse.json({ error: "資產資料格式錯誤" }, { status: 400 });
    await saveAssetLibrary(body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "儲存失敗" },
      { status: error instanceof AssetLibraryVersionConflictError ? 409 : 500 },
    );
  }
}
