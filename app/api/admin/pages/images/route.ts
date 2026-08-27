import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import type { AssetLibrary } from "@/lib/assets";
import { atomicWriteJson, withFileLock } from "@/lib/jsonFileStore";
import { localImageMedia } from "@/lib/media";
import {
  createPageBuilderAsset,
  optimizePageBuilderImage,
  PAGE_BUILDER_IMAGE_CATEGORY,
  pageBuilderImageIdentity,
  validatePageBuilderImageFile,
} from "@/lib/pageBuilderImages";
import { getAssetsDataFile, getAssetsUploadDir } from "@/lib/storagePaths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let writtenPath = "";
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("沒有選擇圖片。");
    validatePageBuilderImageFile(file);

    const identity = pageBuilderImageIdentity(file.name, randomUUID());
    const uploadDir = getAssetsUploadDir(PAGE_BUILDER_IMAGE_CATEGORY);
    const publicPath = `/uploads/assets/${PAGE_BUILDER_IMAGE_CATEGORY}/${identity.fileName}`;
    const optimized = await optimizePageBuilderImage(Buffer.from(await file.arrayBuffer()));
    await fs.mkdir(uploadDir, { recursive: true });
    writtenPath = path.join(uploadDir, identity.fileName);
    await fs.writeFile(writtenPath, optimized, { flag: "wx" });

    const now = new Date().toISOString();
    const asset = createPageBuilderAsset({
      id: identity.id,
      seoStem: identity.seoStem,
      originalFileName: file.name,
      publicPath,
      now,
    });

    await withFileLock(getAssetsDataFile(), async () => {
      const library = JSON.parse(await fs.readFile(getAssetsDataFile(), "utf8")) as AssetLibrary;
      if (library.assets.some((item) => item.id === asset.id || item.path === asset.path)) {
        throw new Error("圖片識別碼衝突，請重新上傳。");
      }
      library.assets.push(asset);
      library.version = Number(library.version || 0) + 1;
      library.updatedAt = now;
      await atomicWriteJson(getAssetsDataFile(), library);
    });

    return NextResponse.json({ ok: true, asset, media: localImageMedia(publicPath) }, { status: 201 });
  } catch (error) {
    if (writtenPath) await fs.unlink(writtenPath).catch(() => undefined);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "圖片上傳失敗。" },
      { status: 400 },
    );
  }
}
