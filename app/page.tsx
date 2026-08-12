import { promises as fs } from "fs";

import { getHomepageData } from "@/data/homepageData";
import { getWebsiteDataFile } from "@/lib/storagePaths";

import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import HomepageV3 from "@/components/home/HomepageV3";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 * KD Coffee 首頁
 * ============================================================
 *
 * 首頁需要兩份主要資料：
 *
 * 1. homepage.json
 * 2. website-data.json
 *
 *
 * homepage.json：
 * 已經由 getHomepageData()
 * 統一走 Persistent Storage。
 *
 *
 * website-data.json：
 * 現在同樣改用 getWebsiteDataFile()。
 *
 *
 * Windows 本機沒有 KD_DATA_DIR：
 *
 * → public/data/website-data.json
 *
 *
 * Railway 未來設定：
 *
 * KD_DATA_DIR=/data
 *
 * → /data/store/website-data.json
 *
 *
 * 這樣首頁顯示的商品與庫存資料，
 * 才會跟後台實際修改的是同一份資料。
 */
export default async function Home() {
  /**
   * 同時讀取首頁設定與商品資料。
   */
  const [homepageData, website] =
    await Promise.all([
      getHomepageData(),

      fs
        .readFile(
          getWebsiteDataFile(),
          "utf8",
        )
        .then(JSON.parse),
    ]);

  /**
   * 保留原本首頁商品資料取得方式。
   */
  const products =
    website.menu?.products || [];

  return (
    <main>
      <Header />

      <HomepageV3
        homepageData={
          homepageData as any
        }
        products={products}
      />

      <Footer />
    </main>
  );
}