import { promises as fs } from "fs";
import path from "path";

import { getArtworkUploadDir } from "@/lib/storagePaths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Artwork 圖片 / 影片支援的 Content-Type。
 *
 * homepage upload route 允許 image/* 與 video/*，
 * 所以這裡除了圖片，也保留常見影片格式。
 */
const contentTypes: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",

  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

/**
 * ============================================================
 * Artwork 圖片 / 影片讀取 Route
 * ============================================================
 *
 * 前台網址維持：
 *
 * /uploads/artworks/{artworkSlug}/{fileName}
 *
 *
 * Windows 本機沒有 KD_DATA_DIR：
 *
 * 實際讀取：
 * public/uploads/artworks/{artworkSlug}
 *
 *
 * Railway 未來設定：
 *
 * KD_DATA_DIR=/data
 *
 * 實際讀取：
 * /data/uploads/artworks/{artworkSlug}
 *
 *
 * 如此可以讓 artwork 實體檔案放在 Persistent Volume，
 * 同時維持原本網站 URL 不變。
 */
export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      artworkSlug: string;
      fileName: string;
    }>;
  },
) {
  const {
    artworkSlug,
    fileName,
  } = await context.params;

  const extension =
    path.extname(fileName).toLowerCase();

  /**
   * artworkSlug 安全檢查。
   *
   * slug 只允許英數字與 -
   */
  const isSafeArtworkSlug =
    artworkSlug === path.basename(artworkSlug) &&
    /^[a-z0-9][a-z0-9-]*$/i.test(artworkSlug);

  /**
   * fileName 安全檢查。
   *
   * 防止 ../ 等路徑穿越。
   */
  const isSafeFileName =
    fileName === path.basename(fileName) &&
    /^[a-z0-9][a-z0-9._-]*$/i.test(fileName);

  const contentType =
    contentTypes[extension];

  if (
    !isSafeArtworkSlug ||
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
     * artwork 實際存放目錄
     * 統一交給 storagePaths.ts。
     */
    const uploadDir =
      getArtworkUploadDir(
        artworkSlug,
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