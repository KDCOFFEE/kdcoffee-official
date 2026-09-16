import type { Metadata } from "next";

import styles from "../memberBackup.module.css";

export const metadata: Metadata = {
  title: "KD Coffee Member Backup 隱私權政策",
  description: "KD Coffee Member Backup 使用 Google Drive API 進行災難復原備份時的資料與隱私說明。",
  alternates: { canonical: "/member-backup/privacy" },
};

export default function MemberBackupPrivacyPage() {
  return (
    <main className={styles.main} id="main-content">
      <p className={styles.eyebrow}>PRIVACY POLICY</p>
      <h1>KD Coffee Member Backup 隱私權政策</h1>
      <time className={styles.updated} dateTime="2026-09-16">最後更新：2026-09-16</time>
      <p className={styles.lead}>
        本政策說明 KD Coffee Member Backup 如何在內部災難復原與資料備份流程中使用 Google Drive API。
      </p>

      <section className={styles.section} aria-labelledby="purpose">
        <h2 id="purpose">1. 使用目的</h2>
        <p>KD Coffee Member Backup 僅用於 KD Coffee 內部災難復原、資料備份及營運持續性。</p>
      </section>

      <section className={styles.section} aria-labelledby="google-scope">
        <h2 id="google-scope">2. Google API 權限</h2>
        <p>本應用程式僅申請下列 Google Drive API 權限：</p>
        <a
          className={styles.scope}
          href="https://www.googleapis.com/auth/drive.file"
          target="_blank"
          rel="noreferrer"
        >
          https://www.googleapis.com/auth/drive.file
        </a>
        <p>
          此權限允許應用程式管理由本應用程式建立，或由使用者明確授權給本應用程式的 Google Drive 檔案與資料夾；並非存取使用者整個 Google Drive 的權限。
        </p>
      </section>

      <section className={styles.section} aria-labelledby="google-data-use">
        <h2 id="google-data-use">3. Google 使用者資料用途</h2>
        <p>Google Drive 存取僅用於：</p>
        <ul>
          <li>建立由應用程式管理的備份資料夾。</li>
          <li>上傳已完成驗證的 KD Coffee 備份 ZIP 檔案。</li>
          <li>讀取已上傳備份檔案的 metadata。</li>
          <li>驗證檔案大小、checksum 與 parent folder metadata。</li>
          <li>尋找由本應用程式建立的備份檔案。</li>
          <li>僅對應用程式管理的檔案執行備份保留政策。</li>
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="credential-storage">
        <h2 id="credential-storage">4. OAuth 憑證保存</h2>
        <p>
          OAuth Client Secret 與 Refresh Token 僅保存於 Railway 的伺服器端環境機密設定中。
        </p>
        <p>這些憑證不會被刻意放入：</p>
        <ul>
          <li>瀏覽器端 JavaScript。</li>
          <li>公開頁面。</li>
          <li>Git repository。</li>
          <li>備份 ZIP 檔案。</li>
          <li>公開 log。</li>
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="sharing">
        <h2 id="sharing">5. 資料分享</h2>
        <ul>
          <li>Google 使用者資料不會被出售。</li>
          <li>Google 使用者資料不會被出租。</li>
          <li>Google 使用者資料不會用於廣告。</li>
          <li>Google 使用者資料不會分享給無關第三方。</li>
          <li>存取用途僅限於備份與災難復原。</li>
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="google-policy">
        <h2 id="google-policy">6. Google API Services User Data Policy</h2>
        <p>
          本應用程式對從 Google API 取得資訊的使用與傳輸，遵守 Google API Services User Data Policy，包括其中的 Limited Use 要求。
        </p>
      </section>

      <section className={styles.section} aria-labelledby="retention">
        <h2 id="retention">7. 備份資料保留</h2>
        <p>
          備份封存檔可能依 KD Coffee 的災難復原保留政策保存，並在適用的保留期限屆滿後刪除。保留作業僅適用於由本應用程式管理的備份檔案。
        </p>
      </section>

      <section className={styles.section} aria-labelledby="contact">
        <h2 id="contact">8. 聯絡方式</h2>
        <p>如對本政策或 KD Coffee Member Backup 有疑問，可透過 KD Coffee 現有公開聯絡管道與我們聯繫。</p>
        <div className={styles.contactLinks}>
          <a className={styles.inlineLink} href="mailto:kdcoffee1962@gmail.com">kdcoffee1962@gmail.com</a>
          <a className={styles.inlineLink} href="https://line.me/R/ti/p/@kdcoffee" target="_blank" rel="noreferrer">
            LINE @kdcoffee
          </a>
        </div>
      </section>
    </main>
  );
}
