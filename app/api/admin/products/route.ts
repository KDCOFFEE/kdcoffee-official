import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { atomicWriteJson, withFileLock } from "@/lib/jsonFileStore";
import {
  applyProductChanges,
  ProductCommerceUpdateError,
} from "@/lib/productCommerceUpdates";
import {
  mergeProductAssetUpdates,
  ProductAssetUpdateError,
} from "@/lib/productAssetUpdates";
import {
  ProductMediaValidationError,
  verifyProductAssetUpdates,
} from "@/lib/productMedia";

import {
  getWebsiteDataFile,
  getHomepageDataFile,
  getMonthlyMenusFile,
  getArtworkBackupsDir,
} from "@/lib/storagePaths";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 * Persistent Storage 路徑
 * ============================================================
 *
 * 這三個路徑不再直接寫死 process.cwd()。
 *
 * Windows 本機：
 * 如果沒有設定 KD_DATA_DIR，
 * storagePaths.ts 會自動回到原本專案內的位置。
 *
 * Railway Production：
 * 未來設定 KD_DATA_DIR=/data 後，
 * 會改為使用 Persistent Volume。
 *
 * 注意：
 * 這裡只有改「資料存放位置」，
 * 商品、SKU、價格、庫存與後台更新邏輯全部維持原樣。
 */
const websiteFile = getWebsiteDataFile();
const homepageFile = getHomepageDataFile();
const archiveFile = getMonthlyMenusFile();
const backupDir = getArtworkBackupsDir();

const SCHEMA_VERSION = "12.0";

type ProductRecord = Record<string, unknown>;

/**
 * 商品頁面預設版面設定。
 * 保留原本既有設定，不修改。
 */
const defaultPageLayout = {
  heroAsset: "hero",
  productAsset: "productPhoto",
  listAsset: "mainVisual",
  galleryAssets: ["label"],
  showGallery: true,
  showRelatedWorks: true,
};

/**
 * 商品預設顯示欄位。
 * 保留原本既有設定，不修改。
 */
const defaultDisplayFields = {
  origin: true,
  process: true,
  roast: true,
  variety: false,
  altitude: false,
  flavors: true,
  shortCopy: true,
  mood: true,
};

/**
 * 判斷資料是否為一般 Object。
 *
 * 避免 null、Array 或其他非商品物件資料
 * 被當成 ProductRecord 使用。
 */
function isRecord(value: unknown): value is ProductRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * 將舊商品資料補齊目前後台需要的欄位。
 *
 * 這是原本既有 migration / normalize 邏輯，
 * Persistent Storage 修改不碰這裡的行為。
 */
function normalizeProduct(value: unknown) {
  const product = isRecord(value) ? value : {};
  const purchase = Array.isArray(product.purchase) ? product.purchase : [];
  const pageLayout = isRecord(product.pageLayout) ? product.pageLayout : {};

  return {
    ...product,

    schemaVersion: SCHEMA_VERSION,

    flavors: Array.isArray(product.flavors) ? product.flavors : [],

    assets: isRecord(product.assets) ? product.assets : {},

    pageLayout: {
      ...defaultPageLayout,
      ...pageLayout,
      galleryAssets: Array.isArray(pageLayout.galleryAssets)
        ? pageLayout.galleryAssets
        : ["label"],
    },

    history: Array.isArray(product.history) ? product.history : [],

    publish: isRecord(product.publish) ? product.publish : {},

    displayFields: {
      ...defaultDisplayFields,
      ...(isRecord(product.displayFields) ? product.displayFields : {}),
    },

    skus:
      Array.isArray(product.skus) && product.skus.length
        ? product.skus
        : purchase
            .filter(isRecord)
            .map((item) => ({
              ...item,
              stock: product.stock || 0,
              enabled: true,
            })),
  };
}

/**
 * 安全讀取 JSON。
 *
 * 如果檔案不存在、JSON 損壞或讀取失敗，
 * 會回傳呼叫端提供的 fallback。
 *
 * 這是原本既有行為，不修改。
 */
async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/**
 * 商品資料修改前建立備份。
 *
 * Windows 本機：
 * 使用原本 data/backups/artworks。
 *
 * Railway 未來設定 KD_DATA_DIR=/data：
 * 備份會進 Persistent Volume。
 *
 * 仍然只保留最新 30 份備份。
 */
async function backup(data: unknown) {
  await fs.mkdir(backupDir, { recursive: true });

  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  await fs.writeFile(
    path.join(backupDir, `artworks-${stamp}.json`),
    `${JSON.stringify(data, null, 2)}\n`,
    "utf8",
  );

  const files = (await fs.readdir(backupDir))
    .sort()
    .reverse();

  await Promise.all(
    files
      .slice(30)
      .map((name) => fs.unlink(path.join(backupDir, name))),
  );
}

/**
 * ============================================================
 * GET
 * ============================================================
 *
 * 提供後台商品管理頁讀取：
 * - 商品
 * - 本月豆單基本資料
 * - 歷史 monthly menu
 * - schema version
 * - updatedAt
 */
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  // websiteFile 現在統一由 storagePaths.ts 決定。
  const [data, homepage] = await Promise.all([
    readJson<ProductRecord>(websiteFile, {}),
    readJson<ProductRecord>(homepageFile, {}),
  ]);

  // monthly-menus.json 同樣統一由 storagePaths.ts 決定。
  const archive = await readJson<ProductRecord>(
    archiveFile,
    { menus: [] },
  );

  const menu = isRecord(data.menu)
    ? data.menu
    : {};

  const raw = Array.isArray(menu.products)
    ? menu.products
    : [];

  const products = raw
    .filter(isRecord)
    .map(normalizeProduct);

  const migrated =
    data.schemaVersion !== SCHEMA_VERSION ||
    products.some(
      (product, index) =>
        JSON.stringify(product) !== JSON.stringify(raw[index]),
    );

  return NextResponse.json({
    products,

    campaigns: Array.isArray(homepage.campaigns) ? homepage.campaigns : [],

    menu: {
      monthKey: menu.monthKey || "2026-08",
      monthLabel: menu.monthLabel || "",
      title: menu.title || "",
      intro: menu.intro || "",
    },

    archive: archive.menus || [],

    version: data.version || 1,

    schemaVersion: SCHEMA_VERSION,

    migrated,

    updatedAt: data.updatedAt || "",
  });
}

/**
 * ============================================================
 * PUT
 * ============================================================
 *
 * 後台商品資料寫入。
 *
 * 重要：
 * Persistent Storage 修改只改 websiteFile 的實際位置。
 *
 * 原本：
 * - assets patch
 * - productChanges patch
 * - SKU
 * - stock
 * - commerce validation
 * - file lock
 * - atomic write
 *
 * 全部維持原本邏輯。
 */
export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();

    /**
     * ----------------------------------------------------------
     * 商品素材更新
     * ----------------------------------------------------------
     */
    if (body.scope === "assets") {
      if (!Array.isArray(body.products)) {
        return NextResponse.json(
          { error: "商品素材資料格式不正確。" },
          { status: 400 },
        );
      }

      /**
       * 使用 websiteFile 作為 lock key。
       *
       * Railway 設定 KD_DATA_DIR=/data 後，
       * lock 與實際寫入會針對 Persistent Storage 的
       * website-data.json。
       */
      return await withFileLock(
        websiteFile,
        async () => {
          const data =
            await readJson<ProductRecord>(
              websiteFile,
              {},
            );

          const menu = isRecord(data.menu)
            ? data.menu
            : {};

          const current = (
            Array.isArray(menu.products)
              ? menu.products
              : []
          ).filter(isRecord);

          /**
           * 沿用原本商品素材合併入口；Cloudinary 媒體先由
           * server-side 查詢並以可信資料覆蓋 client metadata。
           */
          const verifiedUpdates =
            await verifyProductAssetUpdates(
              body.products,
            );

          const products =
            mergeProductAssetUpdates(
              current,
              verifiedUpdates,
            );

          // 寫入新資料以前先建立備份。
          await backup(data);

          data.menu = {
            ...menu,
            products,
          };

          data.updatedAt =
            new Date().toISOString();

          data.version =
            Number(data.version || 1) + 1;

          /**
           * 使用 atomic write，
           * 避免寫到一半造成 JSON 損壞。
           */
          await atomicWriteJson(
            websiteFile,
            data,
          );

          return NextResponse.json({
            ok: true,
            scope: "assets",
            count: body.products.length,
            version: data.version,
            updatedAt: data.updatedAt,
          });
        },
      );
    }

    /**
     * ----------------------------------------------------------
     * 商品 Commerce 資料更新
     * ----------------------------------------------------------
     *
     * 禁止後台直接提交完整 products snapshot。
     * 必須使用 productChanges patch。
     *
     * 這是原本的重要保護機制，完全保留。
     */
    if (body.scope !== "productChanges") {
      return NextResponse.json(
        {
          error:
            "商品儲存必須使用 productChanges patch，禁止提交完整 products snapshot。",
        },
        { status: 400 },
      );
    }

    if (!Array.isArray(body.changes)) {
      return NextResponse.json(
        { error: "商品變更資料格式不正確。" },
        { status: 400 },
      );
    }

    return await withFileLock(
      websiteFile,
      async () => {
        /**
         * 每次修改前重新讀取最新 website-data，
         * 避免直接使用舊 snapshot。
         */
        const data =
          await readJson<ProductRecord>(
            websiteFile,
            {},
          );

        const menu = isRecord(data.menu)
          ? data.menu
          : {};

        const current = (
          Array.isArray(menu.products)
            ? menu.products
            : []
        ).filter(isRecord);

        /**
         * 套用原本商品修改邏輯。
         *
         * SKU / stock / price 等規則
         * 都仍然由 applyProductChanges() 負責。
         */
        const products =
          applyProductChanges(
            current,
            body.changes,
          );

        // 修改前建立備份。
        await backup(data);

        data.menu = {
          ...menu,
          products,
        };

        data.schemaVersion =
          SCHEMA_VERSION;

        data.updatedAt =
          new Date().toISOString();

        data.version =
          Number(data.version || 1) + 1;

        /**
         * 寫回同一個 Persistent Storage websiteFile。
         */
        await atomicWriteJson(
          websiteFile,
          data,
        );

        return NextResponse.json({
          ok: true,
          scope: "productChanges",
          count: body.changes.length,
          version: data.version,
          updatedAt: data.updatedAt,
        });
      },
    );
  } catch (error) {
    /**
     * 保留原本錯誤處理：
     *
     * Commerce update error：
     * 使用 error 本身指定的 HTTP status。
     *
     * Asset update error：
     * HTTP 400。
     *
     * 其他未知錯誤：
     * HTTP 500。
     */
    const status =
      error instanceof ProductCommerceUpdateError
        ? error.status
        : error instanceof ProductAssetUpdateError ||
            error instanceof ProductMediaValidationError
          ? 400
          : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "儲存失敗",
      },
      { status },
    );
  }
}
