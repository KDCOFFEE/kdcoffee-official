import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { getAssetLibrary } from "./assets";
import { isLocalAssetImagePath } from "./media";
import { getAssetsUploadDir, getArtworkUploadDir, getCampaignUploadDir, getHome003UploadDir } from "./storagePaths";
import { inspectImageBytes, SAFE_IMAGE_LIMITS, ImageSafetyError } from "./websiteImages";

function assetImageFile(src: string) {
  const parts = src.split("/"), file = parts.at(-1)!;
  if (src.startsWith("/uploads/assets/")) return path.join(getAssetsUploadDir(parts[3]), file);
  if (src.startsWith("/uploads/artworks/")) return path.join(getArtworkUploadDir(parts[3]), file);
  return path.join(src.startsWith("/images/home003/") ? getHome003UploadDir() : getCampaignUploadDir(), file);
}
export async function assertAssetImageAvailable(src: string, inspect = true) {
  if (!isLocalAssetImagePath(src)) throw new ImageSafetyError("請選擇素材庫中的安全圖片。");
  const library = await getAssetLibrary();
  if (!library.assets.some(asset => asset.status === "active" && asset.path === src)) throw new ImageSafetyError("所選圖片已不在素材庫中，請重新選擇。");
  // Next serves an existing public file before its dynamic media route. Match that
  // read order; never copy a static asset or alter its canonical URL.
  const candidates = [...new Set([path.join(process.cwd(), "public", src.slice(1)), assetImageFile(src)])];
  for (const file of candidates) {
    let stat;
    try { stat = await fs.lstat(/* turbopackIgnore: true */ file); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > SAFE_IMAGE_LIMITS.maxBytes) throw new ImageSafetyError("所選圖片無法安全讀取。");
    if (inspect) await inspectImageBytes(await fs.readFile(/* turbopackIgnore: true */ file), file);
    return;
  }
  throw new ImageSafetyError("所選圖片不存在，請重新選擇。");
}
