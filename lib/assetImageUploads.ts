import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AssetLibrary } from "./assets";
import { atomicWriteJson, withFileLock, FileLockReleaseError } from "./jsonFileStore";
import { localImageMedia } from "./media";
import { getAssetsDataFile, getAssetsUploadDir, getPersistentDataRoot } from "./storagePaths";
import { createWebsiteImageAsset, optimizeWebsiteImage, WEBSITE_IMAGE_CATEGORY, websiteImageIdentity, validateWebsiteImageFile, inspectUploadedImage, ImageSafetyError, LINE_CARD_IMAGE_LIMITS } from "./websiteImages";

/** One existing image optimizer/identity/registration flow; authorization stays in each API. */
export async function uploadWebsiteImageAsset(file: File, options: { validateSafety?: boolean; purpose?: "line-card-header" } = {}) {
  const header = options.purpose === "line-card-header";
  const safe = options.validateSafety || header;
  let writtenPath = "", created = false, committed = false;
  try {
    if (!safe) validateWebsiteImageFile(file);
    if (safe && !getPersistentDataRoot()) throw new ImageSafetyError("請先配置既有媒體儲存空間。", 503);
    const original = safe ? (await inspectUploadedImage(file, header ? LINE_CARD_IMAGE_LIMITS : undefined)).bytes : Buffer.from(await file.arrayBuffer());
    const identity = websiteImageIdentity(file.name, randomUUID());
    if (header) identity.id = "ASSET-" + identity.id.slice(8);
    const category = header ? "line-cards" : WEBSITE_IMAGE_CATEGORY;
    const uploadDir = getAssetsUploadDir(category);
    const publicPath = "/uploads/assets/" + category + "/" + identity.fileName;
    const optimized = await optimizeWebsiteImage(original);
    await fs.mkdir(uploadDir, { recursive: true });
    writtenPath = path.join(uploadDir, identity.fileName);
    await fs.writeFile(writtenPath, optimized, { flag: "wx" });
    created = true;
    const now = new Date().toISOString();
    const asset = createWebsiteImageAsset({ id: identity.id, seoStem: identity.seoStem, originalFileName: file.name, publicPath, now });
    if (header) Object.assign(asset, { category, usage: "LINE 通知卡片抬頭圖片", recommendedSize: "960 × 320 px", displaySize: "3:1 · 置中裁切" });
    try { await withFileLock(getAssetsDataFile(), async () => {
      const library = JSON.parse(await fs.readFile(getAssetsDataFile(), "utf8")) as AssetLibrary;
      if (library.assets.some(item => item.id === asset.id || item.path === asset.path)) throw new Error("圖片識別碼衝突，請重新上傳。");
      library.assets.push(asset); library.version = Number(library.version || 0) + 1; library.updatedAt = now;
      await atomicWriteJson(getAssetsDataFile(), library);
      committed = true;
    }); } catch (error) {
      if (!committed || !(error instanceof FileLockReleaseError)) throw error;
      // Same committed-save contract as saveAssetLibrary: retain success and report lock recovery.
      try {
        console.warn(JSON.stringify({ event: "asset_library_committed_lock_release_failed", assetPath: getAssetsDataFile(), assetId: asset.id, lockPath: error.lockPath, phase: error.phase, code: error.code, attempts: error.attempts, recoveryRequired: true }));
      } catch { /* Logging cannot change a committed save result. */ }
    }
    return { asset, media: localImageMedia(publicPath) };
  } catch (error) {
    // Preserve legacy cleanup. Opt-in safe callers never remove a file they did not create.
    if (!committed && writtenPath && (!safe || created)) await fs.unlink(writtenPath).catch(() => undefined);
    throw error;
  }
}
