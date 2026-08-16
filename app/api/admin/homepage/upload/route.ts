import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  getArtworkUploadDir,
  getCampaignUploadDir,
  getHome003UploadDir,
} from "@/lib/storagePaths";

export const runtime = "nodejs";

/**
 * ============================================================
 * KD Coffee Homepage / Campaign / Artwork Upload
 * ============================================================
 *
 * 這支 API 同時負責：
 *
 * 1. HOME003 圖片
 * 2. Campaign 圖片
 * 3. Artwork 圖片
 * 4. 影片
 *
 *
 * 圖片現在會自動最佳化：
 *
 * PNG / JPG / JPEG / WebP / AVIF
 * ↓
 * Sharp
 * ↓
 * 自動修正 EXIF 方向
 * ↓
 * 最大尺寸限制
 * ↓
 * WebP
 * ↓
 * 品質壓縮
 * ↓
 * Persistent Storage
 *
 *
 * 影片：
 *
 * 完全維持原始檔案，
 * 不經 Sharp 處理。
 */

/**
 * 將名稱整理成安全的網址 / 檔案名稱。
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
 * 影片使用原始副檔名。
 */
const safeVideoExt = (file: File) =>
  path
    .extname(file.name)
    .toLowerCase()
    .replace(/[^.a-z0-9]/g, "") ||
  ".mp4";

/**
 * ============================================================
 * 圖片最佳化設定
 * ============================================================
 *
 * HOME003 / Campaign：
 * 最大寬度 1600 px
 *
 * Artwork：
 * 最大寬度 1800 px
 *
 * 不會把原本較小的圖片放大。
 *
 * WebP quality 84：
 * 保留良好視覺品質，
 * 同時大幅降低檔案大小。
 */
async function optimizeImage(
  input: Buffer,
  maxWidth: number,
) {
  return sharp(input)
    /**
     * 依 EXIF 自動修正手機照片方向。
     */
    .rotate()

    /**
     * 只在圖片比限制尺寸大時縮小。
     *
     * fit: inside
     * 保持原始比例。
     *
     * withoutEnlargement: true
     * 小圖不會被硬放大。
     */
    .resize({
      width: maxWidth,
      height: maxWidth,
      fit: "inside",
      withoutEnlargement: true,
    })

    /**
     * 統一輸出 WebP。
     */
    .webp({
      quality: 84,

      /**
       * effort 4：
       * 在壓縮率與伺服器處理速度之間
       * 取得較好的平衡。
       */
      effort: 4,
    })

    .toBuffer();
}

/**
 * ============================================================
 * POST Upload
 * ============================================================
 */
export async function POST(
  request: Request,
) {
  /**
   * 後台驗證。
   */
  if (
    !(await isAdminAuthenticated())
  ) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  const formData =
    await request.formData();

  const file =
    formData.get("file");

  /**
   * 必須有檔案。
   */
  if (!(file instanceof File)) {
    return NextResponse.json(
      {
        error: "沒有選擇檔案",
      },
      {
        status: 400,
      },
    );
  }

  const isImage =
    file.type.startsWith(
      "image/",
    );

  const isVideo =
    file.type.startsWith(
      "video/",
    );

  /**
   * 只接受圖片或影片。
   */
  if (!isImage && !isVideo) {
    return NextResponse.json(
      {
        error:
          "只接受圖片或影片",
      },
      {
        status: 400,
      },
    );
  }

  /**
   * 保留原本 40 MB 上限。
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
      {
        status: 400,
      },
    );
  }

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

  const isMonthlyMenu =
    assetGroup === "monthly-menu";

  if (isMonthlyMenu) {
    const allowedTypes = ["image/webp", "image/jpeg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "豆單背景只接受 WebP、JPG、JPEG 或 PNG 圖片" },
        { status: 400 },
      );
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: "豆單背景圖片不可超過 20MB" },
        { status: 400 },
      );
    }
  }

  /**
   * 使用者指定 desiredName 時，
   * 先取得不含副檔名的檔名。
   */
  const requestedStem =
    cleanPart(
      path.basename(
        requested,
        path.extname(
          requested,
        ),
      ),
    );

  /**
   * 移除既有版本號。
   *
   * 例如：
   * image-v02
   *
   * ↓
   *
   * image
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
   * 其他素材如果沒有 kdcoffee-
   * 就自動補上。
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
   * Persistent Storage
   * ==========================================================
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
    {
      recursive: true,
    },
  );

  /**
   * 找目前已有的版本。
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
      .map(
        (name) =>
          name.match(
            versionPattern,
          ),
      )
      .filter(Boolean)
      .map(
        (match) =>
          Number(
            match?.[1] || 0,
          ),
      );

  /**
   * 下一版：
   *
   * v01
   * v02
   * v03
   * ...
   */
  const version =
    Math.max(
      0,
      ...versions,
    ) + 1;

  /**
   * ==========================================================
   * 檔案處理
   * ==========================================================
   */
  const originalBuffer =
    Buffer.from(
      await file.arrayBuffer(),
    );

  let outputBuffer:
    Buffer;

  let outputExt:
    string;

  if (isImage) {
    /**
     * HOME003 / Campaign：
     * 1600 px
     *
     * Artwork：
     * 1800 px
     */
    const maxWidth = isMonthlyMenu
      ? 3000
      : isHome003 || isCampaign
        ? 1600
        : 1800;

    /**
     * 圖片統一轉 WebP。
     */
    outputBuffer =
      await optimizeImage(
        originalBuffer,
        maxWidth,
      );

    outputExt =
      ".webp";
  } else {
    /**
     * 影片完全保留原始內容。
     */
    outputBuffer =
      originalBuffer;

    outputExt =
      safeVideoExt(file);
  }

  /**
   * 最終檔名。
   */
  const fileName =
    `${seoStem}-v${String(
      version,
    ).padStart(
      2,
      "0",
    )}${outputExt}`;

  /**
   * 寫入實際 Storage。
   */
  await fs.writeFile(
    path.join(
      uploadDir,
      fileName,
    ),
    outputBuffer,
  );

  /**
   * ==========================================================
   * Public URL
   * ==========================================================
   *
   * URL 結構完全維持原本。
   */
  const publicPath =
    isHome003
      ? `/images/home003/${fileName}`
      : isCampaign
        ? `/images/campaigns/${fileName}`
        : `/uploads/artworks/${artworkSlug}/${fileName}`;

  /**
   * 回傳原本既有欄位，
   * 另外增加檔案大小資訊，
   * 方便後台之後顯示壓縮結果。
   */
  return NextResponse.json({
    ok: true,

    path:
      publicPath,

    fileName,

    originalFileName:
      file.name,

    version,

    /**
     * 原始上傳大小。
     */
    originalSize:
      file.size,

    /**
     * 實際存檔大小。
     */
    optimizedSize:
      outputBuffer.length,

    /**
     * 圖片才會是 true。
     */
    optimized:
      isImage,
  });
}
