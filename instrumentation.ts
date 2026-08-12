/**
 * ============================================================
 * KD Coffee Server Startup
 * ============================================================
 *
 * Next.js 會在新的 Server Instance 啟動時
 * 呼叫這個 register()。
 *
 * 主要用途：
 *
 * Railway 使用 Persistent Volume 時，
 * 在網站開始正式處理 Request 以前，
 * 先確認 /data 的必要目錄與初始 JSON 已經準備完成。
 *
 *
 * Windows 本機：
 *
 * 沒有設定 KD_DATA_DIR，
 * ensurePersistentStorageInitialized()
 * 會直接略過，不改變本機既有資料。
 *
 *
 * Railway Production：
 *
 * 未來設定：
 *
 * KD_DATA_DIR=/data
 *
 * 第一次啟動空 Volume 時：
 *
 * repository public/data
 *         ↓
 * 缺少的 JSON 才 Seed
 *         ↓
 * /data/store
 *
 *
 * 已經存在於 /data 的正式資料
 * 絕對不會被 repository 舊檔覆蓋。
 */

export async function register() {
  /**
   * 只有 Node.js Runtime 才執行檔案系統初始化。
   *
   * KD Coffee 正式網站目前需要 fs / Railway Volume，
   * 這些都是 Node.js Runtime 的工作。
   */
  if (
    process.env.NEXT_RUNTIME ===
    "nodejs"
  ) {
    const {
      ensurePersistentStorageInitialized,
    } = await import(
      "@/lib/persistentStorageInit"
    );

    await ensurePersistentStorageInitialized();
  }
}