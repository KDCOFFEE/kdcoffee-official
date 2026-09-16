import type { Metadata } from "next";
import Link from "next/link";

import styles from "./memberBackup.module.css";

export const metadata: Metadata = {
  title: "KD Coffee Member Backup",
  description: "KD Coffee 內部災難復原與會員相關營運資料備份工具說明。",
  alternates: { canonical: "/member-backup" },
};

export default function MemberBackupPage() {
  return (
    <main className={styles.main} id="main-content">
      <p className={styles.eyebrow}>DISASTER RECOVERY</p>
      <h1>KD Coffee Member Backup</h1>
      <p className={styles.lead}>
        KD Coffee Member Backup 是 KD Coffee 內部使用的災難復原與資料備份工具，協助在主要主機或儲存系統發生故障時，維持會員服務與營運資料的復原能力。
      </p>

      <section className={styles.section} aria-labelledby="backup-purpose">
        <h2 id="backup-purpose">服務用途</h2>
        <p>此工具用於：</p>
        <ul>
          <li>建立經過完整性驗證的災難復原備份檔案。</li>
          <li>保存 KD Coffee 會員資料及相關營運紀錄。</li>
          <li>將驗證完成的備份檔案，上傳至 KD Coffee 明確授權的 Google Drive 帳戶。</li>
          <li>在主要代管或儲存系統故障時，支援營運持續性與資料復原。</li>
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="drive-use">
        <h2 id="drive-use">Google Drive API 使用方式</h2>
        <p>
          Google Drive API 僅用於上述備份流程，包括建立應用程式管理的備份位置、上傳已驗證的備份檔案，以及核對上傳結果。
        </p>
        <p>
          本服務不是提供一般消費者使用的公開應用程式。OAuth 憑證僅由伺服器端備份程序使用，不會提供給公開頁面或瀏覽器端程式。
        </p>
      </section>

      <aside className={styles.notice} aria-label="資料使用承諾">
        <strong>資料使用承諾</strong>
        <p>
          Google Drive 資料不會被出售、出租、用於廣告，或分享給與備份及災難復原無關的第三方。
        </p>
        <Link className={styles.actionLink} href="/member-backup/privacy">
          隱私權政策 →
        </Link>
      </aside>
    </main>
  );
}
