import { promises as fs } from "fs";
import { getAssetsDataFile } from "@/lib/storagePaths";

/**
 * ============================================================
 * KD Coffee 素材資料結構
 * ============================================================
 *
 * 每一筆 AssetRecord 代表後台素材庫中的一個素材。
 *
 * 注意：
 * 這裡的 path 是「素材本身的網站路徑」，
 * 不是 assets.json 的實體儲存位置。
 *
 * 這次 Persistent Storage 修改
 * 不改動任何素材資料格式。
 */
export type AssetRecord = {
  id: string;
  category: string;
  name: string;
  usage: string;
  path: string;
  recommendedSize: string;
  displaySize: string;
  format: string;
  alt: string;
  seoStem: string;
  status: "active" | "missing" | "draft";
  originalFileName?: string;
  updatedAt?: string;
};

/**
 * assets.json 的完整資料格式。
 */
export type AssetLibrary = {
  version: number;
  updatedAt: string;
  assets: AssetRecord[];
};

/**
 * ============================================================
 * Persistent Storage 路徑
 * ============================================================
 *
 * 原本固定使用：
 *
 * public/data/assets.json
 *
 *
 * 現在統一交由 storagePaths.ts 決定。
 *
 * 【Windows 本機】
 * 如果沒有設定 KD_DATA_DIR：
 *
 * getAssetsDataFile()
 * 會回到原本專案內的：
 *
 * public/data/assets.json
 *
 *
 * 【Railway Production】
 * 未來設定：
 *
 * KD_DATA_DIR=/data
 *
 * 之後 assets.json 就會改放到
 * Persistent Volume。
 *
 *
 * 這樣後台修改素材資料後，
 * Railway Redeploy 才不會恢復成 repository 舊版本。
 */
const assetPath = getAssetsDataFile();

/**
 * ============================================================
 * 讀取素材庫
 * ============================================================
 *
 * 從目前實際使用中的 assets.json
 * 讀取完整素材資料。
 */
export async function getAssetLibrary(): Promise<AssetLibrary> {
  return JSON.parse(
    await fs.readFile(assetPath, "utf8"),
  ) as AssetLibrary;
}

/**
 * ============================================================
 * 儲存素材庫
 * ============================================================
 *
 * 保留原本既有行為：
 *
 * 1. version +1
 * 2. 更新 updatedAt
 * 3. 將完整素材庫寫回 assets.json
 *
 * 這次只改 assets.json 的實體儲存位置，
 * 不修改素材資料與版本邏輯。
 */
export async function saveAssetLibrary(
  library: AssetLibrary,
) {
  library.version =
    Number(library.version || 0) + 1;

  library.updatedAt =
    new Date().toISOString();

  await fs.writeFile(
    assetPath,
    `${JSON.stringify(library, null, 2)}\n`,
    "utf8",
  );
}

/**
 * ============================================================
 * 取得單一素材
 * ============================================================
 *
 * 先讀取完整 Asset Library，
 * 再依照 id 尋找指定素材。
 *
 * 找不到時回傳 null。
 *
 * 原本邏輯完全保留。
 */
export async function getAsset(id: string) {
  const library =
    await getAssetLibrary();

  return (
    library.assets.find(
      (asset) => asset.id === id,
    ) || null
  );
}