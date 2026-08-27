import path from "path";

/**
 * 將 KD_DATA_DIR 整理成可使用的絕對路徑。
 *
 * 如果沒有設定 KD_DATA_DIR，
 * 就回傳空字串，讓各個函式使用本機原始路徑。
 */
function cleanEnvPath(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? path.resolve(trimmed) : "";
}

/**
 * 取得 Persistent Storage 根目錄。
 *
 * Railway 未來設定：
 * KD_DATA_DIR=/data
 *
 * Windows 本機沒有設定時：
 * 回傳空字串。
 */
export function getPersistentDataRoot() {
  return cleanEnvPath(process.env.KD_DATA_DIR);
}

/**
 * 訂單資料目錄
 *
 * Railway：/data/orders
 * 本機：data/orders
 */
export function getOrdersDir() {
  const root = getPersistentDataRoot();

  return root
    ? path.join(root, "orders")
    : path.join(process.cwd(), "data", "orders");
}

/**
 * 會員資料目錄
 *
 * Railway：/data/members
 * 本機：data/members
 */
export function getMembersDir() {
  const root = getPersistentDataRoot();

  return root
    ? path.join(root, "members")
    : path.join(process.cwd(), "data", "members");
}

/**
 * 網站主要 JSON 資料目錄
 *
 * Railway：/data/store
 * 本機：public/data
 */
export function getStoreDir() {
  const root = getPersistentDataRoot();

  return root
    ? path.join(root, "store")
    : path.join(process.cwd(), "public", "data");
}

/**
 * 商品 / 庫存主要資料
 */
export function getWebsiteDataFile() {
  return path.join(
    getStoreDir(),
    "website-data.json",
  );
}

/**
 * 首頁設定資料
 */
export function getHomepageDataFile() {
  return path.join(
    getStoreDir(),
    "homepage.json",
  );
}

/**
 * 素材庫資料
 */
export function getAssetsDataFile() {
  return path.join(
    getStoreDir(),
    "assets.json",
  );
}

/**
 * 每月豆單歷史資料
 */
export function getMonthlyMenusFile() {
  return path.join(
    getStoreDir(),
    "monthly-menus.json",
  );
}

/**
 * 備份資料根目錄
 *
 * Railway：/data/backups
 * 本機：data/backups
 */
export function getBackupsDir() {
  const root = getPersistentDataRoot();

  return root
    ? path.join(root, "backups")
    : path.join(process.cwd(), "data", "backups");
}

/**
 * 商品作品資料備份
 */
export function getArtworkBackupsDir() {
  return path.join(
    getBackupsDir(),
    "artworks",
  );
}

/**
 * Uploads 根目錄
 *
 * Railway：/data/uploads
 * 本機：public
 */
export function getUploadsRoot() {
  const root = getPersistentDataRoot();

  return root
    ? path.join(root, "uploads")
    : path.join(process.cwd(), "public");
}

/**
 * Asset Library 實際圖片目錄
 *
 * Railway：
 * /data/uploads/assets/{category}
 *
 * 本機：
 * public/uploads/assets/{category}
 */
export function getAssetsUploadDir(
  category: string,
) {
  const root = getPersistentDataRoot();

  return root
    ? path.join(
        root,
        "uploads",
        "assets",
        category,
      )
    : path.join(
        process.cwd(),
        "public",
        "uploads",
        "assets",
        category,
      );
}

/**
 * 商品 Artwork 實際圖片目錄
 *
 * Railway：
 * /data/uploads/artworks/{artworkSlug}
 *
 * 本機：
 * public/uploads/artworks/{artworkSlug}
 */
export function getArtworkUploadDir(
  artworkSlug: string,
) {
  const root = getPersistentDataRoot();

  return root
    ? path.join(
        root,
        "uploads",
        "artworks",
        artworkSlug,
      )
    : path.join(
        process.cwd(),
        "public",
        "uploads",
        "artworks",
        artworkSlug,
      );
}

/**
 * Campaign 圖片目錄
 *
 * Railway：
 * /data/uploads/campaigns
 *
 * 本機：
 * public/images/campaigns
 */
export function getCampaignUploadDir() {
  const root = getPersistentDataRoot();

  return root
    ? path.join(
        root,
        "uploads",
        "campaigns",
      )
    : path.join(
        process.cwd(),
        "public",
        "images",
        "campaigns",
      );
}

/**
 * HOME003 圖片目錄
 *
 * Railway：
 * /data/uploads/home003
 *
 * 本機：
 * public/images/home003
 */
export function getHome003UploadDir() {
  const root = getPersistentDataRoot();

  return root
    ? path.join(
        root,
        "uploads",
        "home003",
      )
    : path.join(
        process.cwd(),
        "public",
        "images",
        "home003",
      );
}

/** Owner-managed standalone pages. Kept separate from homepage and product data. */
export function getPagesDataFile() {
  return path.join(getStoreDir(), "pages.json");
}

export function getOrderNotificationUploadsDir() {
  const root = getPersistentDataRoot();

  return root
    ? path.join(root, "uploads", "order-notifications")
    : path.join(process.cwd(), "public", "uploads", "order-notifications");
}
