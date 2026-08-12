import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  getAssetLibrary,
  saveAssetLibrary,
} from "@/lib/assets";
import {
  getAssetsUploadDir,
} from "@/lib/storagePaths";

export const runtime = "nodejs";

/**
 * 將素材分類、SEO 名稱等文字
 * 整理成安全的網址 / 檔案名稱格式。
 *
 * 原本邏輯保留不變。
 */
const clean = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Asset Library 允許上傳的圖片格式。
 *
 * 原本格式限制保留不變。
 */
const allowedExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".svg",
  ".gif",
  ".avif",
]);

/**
 * ============================================================
 * Asset Library 圖片上傳
 * ============================================================
 *
 * Windows 本機沒有 KD_DATA_DIR：
 *
 * 實體檔案仍然寫入：
 * public/uploads/assets/{category}
 *
 *
 * Railway 未來設定：
 *
 * KD_DATA_DIR=/data
 *
 * 實體檔案改寫入：
 * /data/uploads/assets/{category}
 *
 *
 * 但網站保存的 URL 仍然維持：
 *
 * /uploads/assets/{category}/{fileName}
 *
 * 由我們剛建立的 serving route 負責讀取實體檔案。
 */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const form = await request.formData();

  const file = form.get("file");
  const assetId = String(
    form.get("assetId") || "",
  );

  /**
   * 基本資料檢查。
   */
  if (!(file instanceof File) || !assetId) {
    return NextResponse.json(
      {
        error:
          "缺少檔案或 Asset ID",
      },
      { status: 400 },
    );
  }

  /**
   * Asset 管理目前只接受圖片。
   */
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      {
        error:
          "目前資產管理只接受圖片",
      },
      { status: 400 },
    );
  }

  /**
   * 單檔最大 12 MB。
   */
  if (file.size > 12 * 1024 * 1024) {
    return NextResponse.json(
      {
        error:
          "圖片不可超過 12 MB",
      },
      { status: 400 },
    );
  }

  /**
   * 讀取目前 Asset Library。
   *
   * assets.json 本身已經透過
   * lib/assets.ts 接上 Persistent Storage。
   */
  const library =
    await getAssetLibrary();

  const index =
    library.assets.findIndex(
      (asset) =>
        asset.id === assetId,
    );

  if (index < 0) {
    return NextResponse.json(
      {
        error:
          "找不到指定的資產位置",
      },
      { status: 404 },
    );
  }

  const asset =
    library.assets[index];

  /**
   * 取得副檔名並確認格式。
   */
  const ext =
    path
      .extname(file.name)
      .toLowerCase();

  if (!allowedExtensions.has(ext)) {
    return NextResponse.json(
      {
        error:
          "不支援的圖片格式",
      },
      { status: 400 },
    );
  }

  /**
   * 建立安全 category。
   */
  const category =
    clean(asset.category) || "misc";

  /**
   * 建立 SEO 檔名。
   */
  const stem =
    clean(asset.seoStem) ||
    `kd-coffee-${asset.id.toLowerCase()}`;

  /**
   * ==========================================================
   * Persistent Storage
   * ==========================================================
   *
   * 原本：
   * public/uploads/assets/{category}
   *
   * 現在統一交給 storagePaths.ts。
   */
  const uploadDir =
    getAssetsUploadDir(category);

  await fs.mkdir(
    uploadDir,
    { recursive: true },
  );

  /**
   * 讀取既有版本，
   * 用來計算下一個 v01 / v02 / v03...
   */
  const existing =
    await fs
      .readdir(uploadDir)
      .catch(
        () => [] as string[],
      );

  const escaped =
    stem.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );

  const matches =
    existing
      .map((name) =>
        name.match(
          new RegExp(
            `^${escaped}-v(\\d+)\\.[a-z0-9]+$`,
            "i",
          ),
        ),
      )
      .filter(Boolean);

  const version =
    Math.max(
      0,
      ...matches.map(
        (match) =>
          Number(
            match?.[1] || 0,
          ),
      ),
    ) + 1;

  /**
   * jpeg 統一輸出 .jpg，
   * 其他格式保持原副檔名。
   */
  const fileName =
    `${stem}-v${String(version).padStart(2, "0")}` +
    `${ext === ".jpeg" ? ".jpg" : ext}`;

  /**
   * 將實際圖片寫入 storage。
   */
  await fs.writeFile(
    path.join(
      uploadDir,
      fileName,
    ),
    Buffer.from(
      await file.arrayBuffer(),
    ),
  );

  /**
   * 重要：
   *
   * public URL 不修改。
   *
   * 即使 Railway 實體圖片放在 /data，
   * 網站仍然使用原本：
   *
   * /uploads/assets/...
   *
   * serving route 會負責從正確 storage 讀取。
   */
  const publicPath =
    `/uploads/assets/${category}/${fileName}`;

  /**
   * 更新 assets.json 裡的素材記錄。
   */
  library.assets[index] = {
    ...asset,
    path: publicPath,
    status: "active",
    originalFileName:
      file.name,
    updatedAt:
      new Date().toISOString(),
  };

  /**
   * assets.json 已經接上 Persistent Storage。
   */
  await saveAssetLibrary(
    library,
  );

  return NextResponse.json({
    ok: true,
    asset:
      library.assets[index],
    fileName,
    path: publicPath,
  });
}