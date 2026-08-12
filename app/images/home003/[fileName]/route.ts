import { promises as fs } from "fs";
import path from "path";

import { getHome003UploadDir } from "@/lib/storagePaths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * HOME003 圖片支援的 Content-Type。
 */
const contentTypes: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/**
 * ============================================================
 * HOME003 圖片讀取 Route
 * ============================================================
 *
 * 前台網址維持：
 *
 * /images/home003/檔名
 *
 * 不修改既有網站圖片 URL。
 *
 *
 * Windows 本機沒有 KD_DATA_DIR：
 *
 * 實際讀取：
 * public/images/home003
 *
 *
 * Railway 未來設定：
 *
 * KD_DATA_DIR=/data
 *
 * 實際讀取：
 * /data/uploads/home003
 */
export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      fileName: string;
    }>;
  },
) {
  const { fileName } = await context.params;

  const extension =
    path.extname(fileName).toLowerCase();

  /**
   * 安全檢查：
   * 防止 ../ 等路徑穿越。
   */
  const isSafeFileName =
    fileName === path.basename(fileName) &&
    /^[a-z0-9][a-z0-9._-]*$/i.test(fileName);

  const contentType =
    contentTypes[extension];

  if (!isSafeFileName || !contentType) {
    return new Response(
      "Not found",
      { status: 404 },
    );
  }

  try {
    /**
     * 實體圖片位置由 storagePaths.ts 統一管理。
     */
    const uploadDir =
      getHome003UploadDir();

    const file = await fs.readFile(
      path.join(uploadDir, fileName),
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