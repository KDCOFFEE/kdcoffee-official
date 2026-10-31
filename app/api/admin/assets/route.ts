import {readLineCardHeaderAssets} from '@/lib/lineCardHeaderAssetStore';
import { NextResponse } from "next/server";
import { isAdminAuthenticated, readAdminSession } from "@/lib/adminAuth";
import { AssetLibraryVersionConflictError, getAssetLibrary, saveAssetLibrary } from "@/lib/assets";

export const dynamic = "force-dynamic";

export async function GET(request?: Request) {
  if (request && new URL(request.url).searchParams.get("purpose") === "line-card-header") {
    const session=await readAdminSession();if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});if(session.role!=="owner"||session.legacy)return NextResponse.json({error:"Owner only"},{status:403});
    try{return NextResponse.json({assets:await readLineCardHeaderAssets()},{headers:{"Cache-Control":"no-store"}});}catch{return NextResponse.json({error:"素材庫無法讀取。"},{status:500});}
  }
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
