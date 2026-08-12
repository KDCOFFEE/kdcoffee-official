import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  getArtworkUploadDir,
  getCampaignUploadDir,
  getHome003UploadDir,
} from "@/lib/storagePaths";

export const runtime = "nodejs";

/**
 * 將使用者輸入、slug、asset type 等文字
 * 整理成安全的檔案名稱格式。
 *
 * 原本邏輯保留不變。
 */
const cleanPart = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * 取得安全副檔名。
 *
 * 原本邏輯保留：
 * - 優先使用原始檔案副檔名
 * - 如果沒有副檔名：
 *   video → .mp4
 *   其他 → .jpg
 */
const safeExt = (file: File) =>
  path
    .extname(file.name)
    .toLowerCase()
    .replace(/[^.a-z0-9]/g, "") ||
  (file.type.startsWith("video/")
    ? ".mp4"
    : ".jpg");

/**
 * ============================================================
 * HOME003 / Campaign / Artwork 上傳
 * ============================================================
 *
 * 這支 API 同時負責三種素材：
 *
 * 1. HOME003
 * 2. Campaign
 * 3. Artwork
 *
 *
 * Windows 本機沒有 KD_DATA_DIR 時：
 *
 * HOME003
 * → public/images/home003
 *
 * Campaign
 * → public/images/campaigns
 *
 * Artwork
 * → public/uploads/artworks/{artworkSlug}
 *
 *
 * Railway 未來設定：
 *
 * KD_DATA_DIR=/data
 *
 * HOME003
 * → /data/uploads/home003
 *
 * Campaign
 * → /data/uploads/campaigns
 *
 * Artwork
 * → /data/uploads/artworks/{artworkSlug}
 *
 *
 * 前台 public URL 完全維持原本格式，
 * 由我們已建立的 serving routes 負責讀取。
 */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const formData =
    await request.formData();

  const file =
    formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      {
        error:
          "沒有選擇檔案",
      },
      { status: 400 },
    );
  }

  /**
   * 保留原本規則：
   * 只接受圖片或影片。
   */
  if (
    !file.type.startsWith("image/") &&
    !file.type.startsWith("video/")
  ) {
    return NextResponse.json(
      {
        error:
          "只接受圖片或影片",
      },
      { status: 400 },
    );
  }

  /**
   * 保留原本 40 MB 限制。
   */
  if (
    file.size >
    40 * 1024 * 1024
  ) {
    return NextResponse.json(
      {
        error:
          "檔案不可超過 40MB",
      },
      { status: 400 },
    );
  }

  const ext =
    safeExt(file);

  const requested =
    String(
      formData.get(
        "desiredName",
      ) || "",
    );

  const artworkSlug =
    cleanPart(
      String(
        formData.get(
          "artworkSlug",
        ) || "artwork",
      ),
    ) || "artwork";

  const assetType =
    cleanPart(
      String(
        formData.get(
          "assetType",
        ) || "asset",
      ),
    ) || "asset";

  const assetGroup =
    cleanPart(
      String(
        formData.get(
          "assetGroup",
        ) || "",
      ),
    );

  const isHome003 =
    assetGroup === "home003";

  const isCampaign =
    assetGroup === "campaign";

  /**
   * 使用者如果指定 desiredName，
   * 先取得不含副檔名的 stem。
   */
  const requestedStem =
    cleanPart(
      path.basename(
        requested,
        path.extname(requested),
      ),
    );

  /**
   * 移除既有 -v01 / -v02 ...
   * 避免版本號一直重複疊加。
   */
  const baseStem =
    requestedStem.replace(
      /-v\d+$/i,
      "",
    ) ||
    `kdcoffee-${artworkSlug}-${assetType}`;

  /**
   * HOME003 保留原本命名方式。
   *
   * 其他素材如果還沒有 kdcoffee-
   * 前綴，就自動補上。
   */
  const seoStem =
    isHome003 ||
    baseStem.startsWith(
      "kdcoffee-",
    )
      ? baseStem
      : `kdcoffee-${baseStem}`;

  /**
   * ==========================================================
   * Persistent Storage 路徑
   * ==========================================================
   *
   * 原本這裡直接使用 process.cwd() + public。
   *
   * 現在統一交給 storagePaths.ts。
   */
  const uploadDir =
    isHome003
      ? getHome003UploadDir()
      : isCampaign
        ? getCampaignUploadDir()
        : getArtworkUploadDir(
            artworkSlug,
          );

  await fs.mkdir(
    uploadDir,
    { recursive: true },
  );

  /**
   * 找目前已有的版本號。
   */
  const existing =
    await fs
      .readdir(uploadDir)
      .catch(
        () => [] as string[],
      );

  const versionPattern =
    new RegExp(
      `^${seoStem.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      )}-v(\\d+)\\.[a-z0-9]+$`,
      "i",
    );

  const versions =
    existing
      .map((name) =>
        name.match(
          versionPattern,
        ),
      )
      .filter(Boolean)
      .map((match) =>
        Number(
          match?.[1] || 0,
        ),
      );

  /**
   * 下一版：
   * v01 / v02 / v03 ...
   */
  const version =
    Math.max(
      0,
      ...versions,
    ) + 1;

  const fileName =
    `${seoStem}-v${String(
      version,
    ).padStart(
      2,
      "0",
    )}${ext}`;

  /**
   * 實際寫入檔案。
   *
   * Railway 未來會寫入 /data，
   * Windows 本機仍維持原 public 位置。
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
   * ==========================================================
   * Public URL
   * ==========================================================
   *
   * 這裡刻意維持原本網址，
   * 不修改前台資料結構。
   *
   * Serving Route 會負責把 URL
   * 對應到真正 Persistent Storage。
   */
  const publicPath =
    isHome003
      ? `/images/home003/${fileName}`
      : isCampaign
        ? `/images/campaigns/${fileName}`
        : `/uploads/artworks/${artworkSlug}/${fileName}`;

  return NextResponse.json({
    ok: true,
    path: publicPath,
    fileName,
    originalFileName:
      file.name,
    version,
  });
}