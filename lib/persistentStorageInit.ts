import { promises as fs } from "fs";
import path from "path";

import {
  getPersistentDataRoot,
  getStoreDir,
  getOrdersDir,
  getMembersDir,
  getMemberIdentityDir,
  getMembershipCommerceDir,
  getFulfillmentDir,
  getBackupsDir,
  getArtworkBackupsDir,
  getCampaignUploadDir,
  getHome003UploadDir,
  getPagesDataFile,
} from "@/lib/storagePaths";

/**
 * ============================================================
 * KD Coffee Persistent Storage 初始化
 * ============================================================
 *
 * 目的：
 *
 * Railway 第一次掛上全新的 /data Volume 時，
 * /data 會是空的。
 *
 * 但正式網站啟動時需要：
 *
 * website-data.json
 * homepage.json
 * assets.json
 * monthly-menus.json
 *
 * 所以第一次啟動時，
 * 需要把 repository 裡的原始 JSON
 * seed 到 Persistent Volume。
 *
 *
 * 【最重要安全規則】
 *
 * 只在目標檔案「不存在」時才複製。
 *
 * 如果 /data 裡已經有正式資料，
 * 絕對不可以使用 repository 裡的舊資料覆蓋。
 */

/**
 * 避免同一個 Node.js process
 * 在短時間內重複執行初始化。
 */
let initializationPromise:
  Promise<void> | null = null;

/**
 * 如果目標檔案不存在，
 * 才從 repository seed。
 *
 * 如果目標檔案已存在：
 * 完全不修改。
 */
async function seedFileIfMissing(
  sourceFile: string,
  targetFile: string,
) {
  try {
    /**
     * access 成功代表目標檔已存在。
     *
     * 已存在就立即 return，
     * 絕對不覆蓋正式資料。
     */
    await fs.access(targetFile);
    return;
  } catch {
    /**
     * 不存在才繼續 seed。
     */
  }

  /**
   * 確保目標資料夾存在。
   */
  await fs.mkdir(
    path.dirname(targetFile),
    {
      recursive: true,
    },
  );

  /**
   * 從 repository 原始 JSON
   * 複製到 Persistent Storage。
   */
  await fs.copyFile(
    sourceFile,
    targetFile,
  );
}

/**
 * ============================================================
 * 初始化 Persistent Storage
 * ============================================================
 *
 * Windows 本機：
 *
 * 如果沒有 KD_DATA_DIR，
 * 直接 return，不做任何事情。
 *
 *
 * Railway：
 *
 * KD_DATA_DIR=/data
 *
 * 第一次：
 * 建立必要目錄並 seed 初始 JSON。
 *
 * 之後：
 * /data 裡已有檔案，所以不再覆蓋。
 */
export async function ensurePersistentStorageInitialized() {
  /**
   * 同一個 process 已經正在初始化時，
   * 共用同一個 Promise，
   * 避免多個 request 同時 seed。
   */
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise =
    initializePersistentStorage();

  try {
    await initializationPromise;
  } catch (error) {
    /**
     * 如果初始化真的失敗，
     * 清掉 Promise。
     *
     * 下一次 request 還有機會重新嘗試，
     * 而不是永久卡在失敗狀態。
     */
    initializationPromise = null;
    throw error;
  }
}

/**
 * 真正執行初始化的內部函式。
 */
async function initializePersistentStorage() {
  const root =
    getPersistentDataRoot();

  /**
   * ==========================================================
   * Windows 本機
   * ==========================================================
   *
   * 沒有 KD_DATA_DIR：
   *
   * 不建立任何 Persistent Storage，
   * 不複製任何檔案，
   * 完全維持目前本機專案運作方式。
   */
  if (!root) {
    return;
  }

  /**
   * ==========================================================
   * Railway Persistent Volume 目錄
   * ==========================================================
   */
  const directories = [
    root,
    getStoreDir(),
    getOrdersDir(),
    getMembersDir(),
    getMemberIdentityDir(),
    getMembershipCommerceDir(),
    getFulfillmentDir(),
    getBackupsDir(),
    getArtworkBackupsDir(),

    /**
     * Campaign / HOME003 沒有參數，
     * 可以直接建立。
     *
     * Assets / Artwork 有 category / slug，
     * 實際上傳時由 upload route
     * 再建立各自的子資料夾即可。
     */
    getCampaignUploadDir(),
    getHome003UploadDir(),

    path.join(
      root,
      "uploads",
      "assets",
    ),

    path.join(
      root,
      "uploads",
      "artworks",
    ),
  ];

  await Promise.all(
    directories.map(
      (directory) =>
        fs.mkdir(
          directory,
          {
            recursive: true,
          },
        ),
    ),
  );

  /**
   * ==========================================================
   * Repository Seed
   * ==========================================================
   *
   * Source：
   * 永遠是部署版本內 public/data 的原始 JSON。
   *
   * Target：
   * Railway /data/store。
   */
  const repositoryDataDir =
    path.join(
      process.cwd(),
      "public",
      "data",
    );

  const persistentStoreDir =
    getStoreDir();

  /**
   * 只有 target 不存在才 seed。
   *
   * 注意：
   * 這裡絕對不是每次啟動都 copy。
   */
  await Promise.all([
    seedFileIfMissing(
      path.join(
        repositoryDataDir,
        "website-data.json",
      ),
      path.join(
        persistentStoreDir,
        "website-data.json",
      ),
    ),

    seedFileIfMissing(
      path.join(repositoryDataDir, "pages.json"),
      getPagesDataFile(),
    ),

    seedFileIfMissing(
      path.join(
        repositoryDataDir,
        "homepage.json",
      ),
      path.join(
        persistentStoreDir,
        "homepage.json",
      ),
    ),

    seedFileIfMissing(
      path.join(
        repositoryDataDir,
        "assets.json",
      ),
      path.join(
        persistentStoreDir,
        "assets.json",
      ),
    ),

    seedFileIfMissing(
      path.join(
        repositoryDataDir,
        "monthly-menus.json",
      ),
      path.join(
        persistentStoreDir,
        "monthly-menus.json",
      ),
    ),
  ]);
}
