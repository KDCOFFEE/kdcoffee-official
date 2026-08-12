import { promises as fs } from "fs";
import path from "path";

import { getAssetsUploadDir } from "@/lib/storagePaths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Assets 圖片支援的 Content-Type。
 */
const contentTypes: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

/**
 * ============================================================
 * Asset Library 圖片讀取 Route
 * ============================================================
 *
 * 前台網址維持：
 *
 * /uploads/assets/{category}/{fileName}
 *
 *
 * Windows 本機沒有 KD_DATA_DIR：
 *
 * 實際讀取：
 * public/uploads/assets/{category}
 *
 *
 * Railway 未來設定：
 *
 * KD_DATA_DIR=/data
 *
 * 實際讀取：
 * /data/uploads/assets/{category}
 *
 *
 * 因此前台圖片 URL 不需要修改，
 * 但 Railway 可以改由 Persistent Volume 提供實體圖片。
 */
export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      category: string;
      fileName: string;
    }>;
  },
) {
  const {
    category,
    fileName,
  } = await context.params;

  const extension =
    path.extname(fileName).toLowerCase();

  /**
   * category 安全檢查。
   *
   * category 是由後台 clean() 產生，
   * 正常只會包含英數字與 -。
   */
  const isSafeCategory =
    category === path.basename(category) &&
    /^[a-z0-9][a-z0-9-]*$/i.test(category);

  /**
   * fileName 安全檢查。
   * 防止 ../ 等路徑穿越。
   */
  const isSafeFileName =
    fileName === path.basename(fileName) &&
    /^[a-z0-9][a-z0-9._-]*$/i.test(fileName);

  const contentType =
    contentTypes[extension];

  if (
    !isSafeCategory ||
    !isSafeFileName ||
    !contentType
  ) {
    return new Response(
      "Not found",
      { status: 404 },
    );
  }

  try {
    /**
     * Assets 實際圖片目錄
     * 統一交給 storagePaths.ts 管理。
     */
    const uploadDir =
      getAssetsUploadDir(
        category,
      );

    const file = await fs.readFile(
      path.join(
        uploadDir,
        fileName,
      ),
    );

    return new Response(file, {
      headers: {
        "Cache-Control":
          "public, max-age=3600",

        "Content-Type":
          contentType,
      },
    });
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException)
        .code === "ENOENT"
    ) {
      return new Response(
        "Not found",
        { status: 404 },
      );
    }

    throw error;
  }
}