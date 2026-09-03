import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  readWorksPageAdminState,
  saveWorksPageAdminState,
  WorksPageVersionConflictError,
} from "@/lib/worksPageAdminStore";
import type { WorksPageCmsConfig } from "@/lib/worksPageCms";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await readWorksPageAdminState());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Works 頁面資料讀取失敗。" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { version?: unknown; works?: unknown };
    return NextResponse.json(await saveWorksPageAdminState({
      version: Number(body.version),
      works: body.works as WorksPageCmsConfig,
    }));
  } catch (error) {
    const conflict = error instanceof WorksPageVersionConflictError;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "儲存失敗，請稍後再試。" },
      { status: conflict ? 409 : 400 },
    );
  }
}
