import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { atomicWriteJson, withFileLock } from "@/lib/jsonFileStore";
import {
  isMonthlyMenuBackgroundImage,
  MONTHLY_MENU_BACKGROUND_FITS,
  MONTHLY_MENU_BACKGROUND_POSITIONS,
  normalizeMonthlyMenuBackground,
  type MonthlyMenuBackgroundFit,
  type MonthlyMenuBackgroundPosition,
} from "@/lib/monthlyMenuBackground";
import { getArtworkUploadDir, getWebsiteDataFile } from "@/lib/storagePaths";

export const dynamic = "force-dynamic";

const websiteFile = getWebsiteDataFile();

type WebsiteRecord = Record<string, unknown> & {
  menu?: Record<string, unknown>;
  version?: unknown;
};

async function readWebsiteData() {
  return JSON.parse(await fs.readFile(websiteFile, "utf8")) as WebsiteRecord;
}

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const website = await readWebsiteData();
  return NextResponse.json({
    background: normalizeMonthlyMenuBackground(website.menu?.background),
    monthKey: typeof website.menu?.monthKey === "string" ? website.menu.monthKey : undefined,
  });
}

export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const background = body?.background;
    if (!background || typeof background !== "object" || Array.isArray(background)) {
      return NextResponse.json({ error: "豆單背景資料格式不完整" }, { status: 400 });
    }

    const opacity = Number(background.opacity);
    if (!Number.isFinite(opacity) || opacity !== 1) {
      return NextResponse.json({ error: "主題視覺濃度設定不合法" }, { status: 400 });
    }
    if (!MONTHLY_MENU_BACKGROUND_POSITIONS.includes(background.position as MonthlyMenuBackgroundPosition)) {
      return NextResponse.json({ error: "背景位置不合法" }, { status: 400 });
    }
    if (!MONTHLY_MENU_BACKGROUND_FITS.includes(background.fit as MonthlyMenuBackgroundFit)) {
      return NextResponse.json({ error: "背景呈現方式不合法" }, { status: 400 });
    }

    const image = typeof background.image === "string" ? background.image.trim() : "";
    if (image && !isMonthlyMenuBackgroundImage(image)) {
      return NextResponse.json({ error: "豆單背景圖片路徑不合法" }, { status: 400 });
    }
    if (image) {
      try {
        await fs.access(path.join(getArtworkUploadDir("monthly-menu"), path.basename(image)));
      } catch {
        return NextResponse.json({ error: "找不到已上傳的豆單背景圖片" }, { status: 400 });
      }
    }

    const savedBackground = {
      ...(image ? { image } : {}),
      opacity,
      position: background.position,
      fit: background.fit,
    };

    const version = await withFileLock(websiteFile, async () => {
      const website = await readWebsiteData();
      if (!website.menu || typeof website.menu !== "object") {
        throw new Error("網站豆單資料格式不完整");
      }
      website.menu = { ...website.menu, background: savedBackground };
      website.updatedAt = new Date().toISOString();
      website.version = Number(website.version || 1) + 1;
      await atomicWriteJson(websiteFile, website);
      return website.version;
    });

    return NextResponse.json({ ok: true, version, background: savedBackground });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "儲存失敗",
    }, { status: 500 });
  }
}
