import path from "path";

export class StorageConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageConfigurationError";
  }
}

type StorageRootSource = "KD_DATA_DIR" | "RAILWAY_VOLUME_MOUNT_PATH" | "local";

export type StorageRootContract = {
  root: string;
  source: StorageRootSource;
  railwayMountPath: string;
};

function configuredValue(value: string | undefined) {
  return value?.trim() || "";
}

function pathStyle(value: string) {
  if (/^[A-Za-z]:[\\/]/u.test(value) || value.startsWith("\\\\")) return path.win32;
  return path.posix;
}

function normalizeExplicitRoot(value: string, variableName: string) {
  if (value.includes("\0")) {
    throw new StorageConfigurationError(`${variableName} contains an invalid null character`);
  }

  const style = pathStyle(value);
  if (!style.isAbsolute(value)) {
    throw new StorageConfigurationError(`${variableName} must be an absolute filesystem path`);
  }

  const normalized = style.normalize(value);
  if (normalized === style.parse(normalized).root) {
    throw new StorageConfigurationError(`${variableName} must not be a filesystem root`);
  }
  return normalized;
}

function rootsEqual(left: string, right: string) {
  const windows = pathStyle(left) === path.win32 || pathStyle(right) === path.win32;
  return windows ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function rootIsWithinMount(root: string, mount: string) {
  const rootStyle = pathStyle(root);
  const mountStyle = pathStyle(mount);
  if (rootStyle !== mountStyle) return false;
  if (rootsEqual(root, mount)) return true;
  const relative = rootStyle.relative(mount, root);
  return Boolean(relative) && relative !== ".." && !relative.startsWith(`..${rootStyle.sep}`) && !rootStyle.isAbsolute(relative);
}

/** Resolve and validate the single application storage-root contract. */
export function getStorageRootContract(): StorageRootContract {
  const configuredRoot = configuredValue(process.env.KD_DATA_DIR);
  const configuredRailwayMount = configuredValue(process.env.RAILWAY_VOLUME_MOUNT_PATH);
  const railwayMountPath = configuredRailwayMount
    ? normalizeExplicitRoot(configuredRailwayMount, "RAILWAY_VOLUME_MOUNT_PATH")
    : "";

  if (configuredRoot) {
    const root = normalizeExplicitRoot(configuredRoot, "KD_DATA_DIR");
    if (railwayMountPath && !rootIsWithinMount(root, railwayMountPath)) {
      throw new StorageConfigurationError(
        "KD_DATA_DIR must be the Railway volume mount path or a directory beneath it",
      );
    }
    return { root, source: "KD_DATA_DIR", railwayMountPath };
  }

  if (railwayMountPath) {
    return {
      root: railwayMountPath,
      source: "RAILWAY_VOLUME_MOUNT_PATH",
      railwayMountPath,
    };
  }

  return { root: "", source: "local", railwayMountPath: "" };
}

/**
 * Fail server startup when Railway is clearly running in production but no
 * mounted persistent root is visible. This check is intentionally performed
 * at runtime, not during the Railway build where volumes are unavailable.
 */
export function assertProductionStorageRootConfigured() {
  const contract = getStorageRootContract();
  const railwayRuntime = Boolean(
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_ENVIRONMENT_ID ||
    process.env.RAILWAY_SERVICE_ID ||
    process.env.RAILWAY_VOLUME_NAME,
  );
  if (process.env.NODE_ENV === "production" && railwayRuntime && !contract.root) {
    throw new StorageConfigurationError(
      "Railway production requires KD_DATA_DIR or RAILWAY_VOLUME_MOUNT_PATH; refusing repository-local runtime storage",
    );
  }
  return contract;
}

function joinPersistentRoot(root: string, ...segments: string[]) {
  return pathStyle(root).join(root, ...segments);
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
  return getStorageRootContract().root;
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
    ? joinPersistentRoot(root, "orders")
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
    ? joinPersistentRoot(root, "members")
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
    ? joinPersistentRoot(root, "store")
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
    ? joinPersistentRoot(root, "backups")
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
    ? joinPersistentRoot(root, "uploads")
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
    ? joinPersistentRoot(
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
    ? joinPersistentRoot(
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
    ? joinPersistentRoot(
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
    ? joinPersistentRoot(
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

/**
 * 會員身份註冊表。
 *
 * 登入方式與會員本體分開保存；既有會員 JSON 與歷史訂單不需搬移。
 */
export function getMemberIdentityDir() {
  const root = getPersistentDataRoot();

  return root
    ? joinPersistentRoot(root, "member-identity")
    : path.join(process.cwd(), "data", "member-identity");
}

export function getMemberIdentityRegistryFile() {
  return path.join(getMemberIdentityDir(), "registry.json");
}

/**
 * 會員商務資料。規則歷史與交易狀態分檔，交易狀態則共用單一鎖，
 * 讓推薦獎勵、抵用金與定期購事件可以原子完成。
 */
export function getMembershipCommerceDir() {
  const root = getPersistentDataRoot();

  return root
    ? joinPersistentRoot(root, "membership-commerce")
    : path.join(process.cwd(), "data", "membership-commerce");
}

export function getMembershipRulesFile() {
  return path.join(getMembershipCommerceDir(), "business-rules.json");
}

export function getMembershipCommerceStateFile() {
  return path.join(getMembershipCommerceDir(), "commerce-state.json");
}

/** Admin-only membership simulator. Its namespace is never read by production commerce. */
export function getMembershipTestLabDir() {
  const root = getPersistentDataRoot();
  return root
    ? joinPersistentRoot(root, "membership-test-lab")
    : path.join(process.cwd(), "data", "membership-test-lab");
}

export function getMembershipTestLabStateFile() {
  return path.join(getMembershipTestLabDir(), "scenario-state.json");
}

export function getMembershipTestLabCommerceFile() {
  return path.join(getMembershipTestLabDir(), "simulation-commerce.json");
}

export function getMembershipTestLabRulesFile() {
  return path.join(getMembershipTestLabDir(), "simulation-rules.json");
}

/** Canonical order-fulfillment records and Owner logistics settings. */
export function getFulfillmentDir() {
  const root = getPersistentDataRoot();
  return root
    ? joinPersistentRoot(root, "fulfillment")
    : path.join(process.cwd(), "data", "fulfillment");
}

export function getFulfillmentStateFile() {
  return path.join(getFulfillmentDir(), "state.json");
}

export function getFulfillmentSettingsFile() {
  return path.join(getFulfillmentDir(), "settings.json");
}

/** Owner-managed standalone pages. Kept separate from homepage and product data. */
export function getPagesDataFile() {
  return path.join(getStoreDir(), "pages.json");
}

export function getOrderNotificationUploadsDir() {
  const root = getPersistentDataRoot();

  return root
    ? joinPersistentRoot(root, "uploads", "order-notifications")
    : path.join(process.cwd(), "public", "uploads", "order-notifications");
}
