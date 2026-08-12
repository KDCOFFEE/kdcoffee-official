import { NextResponse } from "next/server";
import { promises as fs } from "fs";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { atomicWriteJson, withFileLock } from "@/lib/jsonFileStore";
import { validateHomepageCampaignDates } from "@/lib/homepageCampaignValidation";
import { verifyHomepageMedia } from "@/lib/homepageMedia";
import {
  hasAvailableHome004Sku,
  resolveHome004Recommendations,
} from "@/lib/home004Recommendations";

import {
  getHomepageDataFile,
  getWebsiteDataFile,
} from "@/lib/storagePaths";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 * Persistent Storage 路徑
 * ============================================================
 *
 * Windows 本機：
 * 如果沒有設定 KD_DATA_DIR，
 * storagePaths.ts 會自動回到原本專案內的：
 *
 * public/data/homepage.json
 * public/data/website-data.json
 *
 *
 * Railway Production：
 * 未來設定：
 *
 * KD_DATA_DIR=/data
 *
 * 之後首頁資料與商品資料就會改從
 * Persistent Volume 讀取 / 寫入。
 *
 *
 * 這次只修改檔案路徑，
 * 不修改 HOME003 / HOME004 或首頁活動邏輯。
 */
const homepagePath = getHomepageDataFile();
const websitePath = getWebsiteDataFile();

/**
 * 讀取 JSON 檔案。
 *
 * 保留原本既有行為：
 * 如果檔案不存在或 JSON 有問題，
 * 會直接丟出錯誤，由上層 API 處理。
 */
async function readJson(filePath: string) {
  return JSON.parse(
    await fs.readFile(filePath, "utf8"),
  );
}

/**
 * ============================================================
 * GET
 * ============================================================
 *
 * 提供後台首頁管理頁需要的資料：
 *
 * 1. homepage.json
 * 2. website-data.json 裡的商品清單
 *
 * 商品清單主要供 HOME004 推薦作品選擇使用。
 */
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  /**
   * 同時讀取：
   *
   * homepage.json
   * website-data.json
   *
   * 兩個路徑現在都由 storagePaths.ts 統一管理。
   */
  const [homepage, website] = await Promise.all([
    readJson(homepagePath),
    readJson(websitePath),
  ]);

  /**
   * 整理 HOME004 可使用的商品資料。
   *
   * 這裡完全保留原本商品篩選與 SKU 判斷邏輯。
   */
  const products = Array.isArray(website.menu?.products)
    ? website.menu.products
        .map((product: Record<string, unknown>) => ({
          slug:
            typeof product.slug === "string"
              ? product.slug
              : "",

          name:
            typeof product.name === "string"
              ? product.name
              : "",

          active:
            typeof product.active === "boolean"
              ? product.active
              : undefined,

          status:
            typeof product.status === "string"
              ? product.status
              : undefined,

          purchasable:
            product.purchasable === true,

          inMonthlyMenu:
            product.inMonthlyMenu === true,

          hasAvailableSku:
            hasAvailableHome004Sku(product),
        }))
        .filter(
          (product: {
            slug: string;
            name: string;
          }) =>
            product.slug &&
            product.name,
        )
    : [];

  return NextResponse.json({
    homepage,
    products,
  });
}

/**
 * ============================================================
 * PUT
 * ============================================================
 *
 * 儲存後台首頁設定。
 *
 * 重要：
 * Persistent Storage 修改只改 homepagePath / websitePath。
 *
 * 原本以下邏輯全部保留：
 *
 * - 首頁資料格式檢查
 * - Campaign 日期驗證
 * - HOME004 商品推薦驗證
 * - file lock
 * - atomic write
 * - version 遞增
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
    const homepage = body.homepage;

    /**
     * 確認首頁基本資料完整。
     */
    if (
      !homepage ||
      !Array.isArray(homepage.campaigns) ||
      !homepage.hero
    ) {
      return NextResponse.json(
        { error: "首頁資料格式不完整" },
        { status: 400 },
      );
    }

    /**
     * 驗證活動開始 / 結束日期。
     *
     * 保留原本既有驗證。
     */
    const campaignDateError =
      validateHomepageCampaignDates(
        homepage.campaigns,
      );

    if (campaignDateError) {
      return NextResponse.json(
        { error: campaignDateError },
        { status: 400 },
      );
    }

    /**
     * 讀取目前正式商品資料。
     *
     * 現在會透過 getWebsiteDataFile()
     * 取得正確位置。
     */
    const website =
      await readJson(websitePath);

    /**
     * 驗證 HOME004 推薦商品。
     *
     * 避免首頁推薦到不存在、
     * 不可購買或無可用 SKU 的作品。
     *
     * 原本邏輯完全保留。
     */
    const home004Resolution =
      resolveHome004Recommendations(
        homepage.home004?.productSlugs,

        Array.isArray(
          website.menu?.products,
        )
          ? website.menu.products
          : [],
      );

    if (!home004Resolution.valid) {
      return NextResponse.json(
        {
          error:
            home004Resolution.errors[0],
        },
        { status: 400 },
      );
    }

    await verifyHomepageMedia(homepage);

    /**
     * 使用 homepagePath 做 file lock。
     *
     * Railway 未來設定 KD_DATA_DIR=/data 後，
     * lock 的就是 Persistent Volume 裡的 homepage.json。
     */
    const version =
      await withFileLock(
        homepagePath,

        async () => {
          homepage.updatedAt =
            new Date().toISOString();

          homepage.version =
            Number(
              homepage.version || 1,
            ) + 1;

          /**
           * Atomic Write：
           *
           * 避免 JSON 寫到一半時
           * 因程序中斷而損壞正式首頁資料。
           */
          await atomicWriteJson(
            homepagePath,
            homepage,
          );

          return homepage.version;
        },
      );

    return NextResponse.json({
      ok: true,
      version,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "儲存失敗",
      },
      { status: 500 },
    );
  }
}
