import { promises as fs } from "fs";

import { getHomepageDataFile } from "@/lib/storagePaths";

/**
 * ============================================================
 * 首頁 Hero 設定
 * ============================================================
 *
 * 這裡只定義首頁 Hero 區塊的資料格式。
 * Persistent Storage 修改不改動任何欄位或顯示邏輯。
 */
export type HeroSettings = {
  enabled?: boolean;
  eyebrow: string;
  titleLines: string[];
  lead: string;
  buttonLabel: string;
  buttonHref: string;
  poster: string;
  videoWebm: string;
  videoMp4: string;
  location: string;
  method: string;
  monthNumber: string;
  monthLabel: string;
};

/**
 * ============================================================
 * 首頁活動資料
 * ============================================================
 */
export type HomepageCampaign = {
  id: string;
  enabled?: boolean;
  sort?: number;
  eyebrow: string;
  title: string;
  description: string;
  details: string[];
  ctaLabel: string;
  ctaHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  note?: string;
  image?: string;
  startDate?: string;
  endDate?: string;
};

/**
 * ============================================================
 * homepage.json 完整資料格式
 * ============================================================
 */
export type HomepageData = {
  version: number;
  updatedAt: string;

  hero: HeroSettings;

  campaignSection: {
    enabled?: boolean;
    eyebrow: string;
    title: string;
    intro: string;
    displayLimit?: number;
  };

  campaigns: HomepageCampaign[];

  sectionMedia: {
    whyKdImage?: string;
    contactImage?: string;
    footerBackground?: string;
  };
};

/**
 * ============================================================
 * Persistent Storage 路徑
 * ============================================================
 *
 * 原本固定讀取：
 *
 * public/data/homepage.json
 *
 *
 * 現在統一交給 storagePaths.ts 管理。
 *
 * Windows 本機沒有設定 KD_DATA_DIR：
 *
 * → public/data/homepage.json
 *
 *
 * Railway 未來設定：
 *
 * KD_DATA_DIR=/data
 *
 * → /data/store/homepage.json
 *
 *
 * 這樣後台修改首頁資料後，
 * 前台首頁也會讀到同一份 Persistent Storage 資料。
 */
const homepagePath =
  getHomepageDataFile();

/**
 * ============================================================
 * 讀取首頁資料
 * ============================================================
 */
export async function getHomepageData(): Promise<HomepageData> {
  return JSON.parse(
    await fs.readFile(
      homepagePath,
      "utf8",
    ),
  ) as HomepageData;
}

/**
 * ============================================================
 * 取得目前有效的首頁活動
 * ============================================================
 *
 * 原本邏輯完全保留：
 *
 * 1. enabled !== false
 * 2. 檢查 startDate
 * 3. 檢查 endDate
 * 4. 依 sort 排序
 * 5. 套用 displayLimit
 */
export function activeHomepageCampaigns(
  homepageData: HomepageData,
  now = new Date(),
) {
  const items =
    homepageData.campaigns
      .filter(
        (campaign) =>
          campaign.enabled !== false,
      )
      .filter(
        (campaign) => {
          const start =
            campaign.startDate
              ? new Date(
                  `${campaign.startDate}T00:00:00`,
                )
              : null;

          const end =
            campaign.endDate
              ? new Date(
                  `${campaign.endDate}T23:59:59`,
                )
              : null;

          return (
            (!start ||
              now >= start) &&
            (!end ||
              now <= end)
          );
        },
      )
      .sort(
        (a, b) =>
          Number(a.sort || 0) -
          Number(b.sort || 0),
      );

  const limit =
    Number(
      homepageData
        .campaignSection
        .displayLimit || 0,
    );

  return limit > 0
    ? items.slice(0, limit)
    : items;
}