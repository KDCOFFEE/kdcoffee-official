import type { Metadata } from "next";

import styles from "../gmailFulfillment.module.css";

export const metadata: Metadata = {
  title: "KD Coffee Gmail Fulfillment 隱私權政策",
  description:
    "KD Coffee Gmail Fulfillment 使用 Gmail API 進行 7-ELEVEN 物流通知自動追蹤時的資料與隱私說明。",
  alternates: { canonical: "/gmail-fulfillment/privacy" },
};

export default function GmailFulfillmentPrivacyPage() {
  return (
    <main className={styles.main} id="main-content">
      <p className={styles.eyebrow}>PRIVACY POLICY</p>

      <h1>KD Coffee Gmail Fulfillment 隱私權政策</h1>

      <time className={styles.updated} dateTime="2026-10-01">
        最後更新：2026-10-01
      </time>

      <p className={styles.lead}>
        本政策說明 KD Coffee Gmail Fulfillment 如何使用 Google Gmail API，
        協助 KD Coffee 進行 7-ELEVEN 訂單物流通知自動追蹤。
      </p>

      <section className={styles.section} aria-labelledby="purpose">
        <h2 id="purpose">1. 使用目的</h2>
        <p>
          KD Coffee Gmail Fulfillment 僅用於 KD Coffee 內部物流與訂單履約管理，
          目的為辨識授權 Gmail 帳戶中的 7-ELEVEN 物流通知，
          並將相關物流事件連結至 KD Coffee 訂單。
        </p>
      </section>

      <section className={styles.section} aria-labelledby="scope">
        <h2 id="scope">2. Google API 權限</h2>

        <p>本服務使用下列 Gmail API 唯讀權限：</p>

        <p className={styles.scope}>
          https://www.googleapis.com/auth/gmail.readonly
        </p>

        <p>
          此權限允許應用程式讀取 Gmail 郵件與相關 metadata。
          KD Coffee Gmail Fulfillment 不會使用此權限寄送、刪除、
          移動或修改 Gmail 郵件。
        </p>
      </section>

      <section className={styles.section} aria-labelledby="accessed-data">
        <h2 id="accessed-data">3. 實際存取的 Gmail 資料</h2>

        <p>
          應用程式目前只會主動搜尋 KD Coffee 物流作業所需的
          7-ELEVEN 通知郵件，並在設定的掃描期間內處理可信物流寄件者
          no-reply@sp88.com 的郵件。
        </p>

        <p>處理內容可能包括：</p>

        <ul>
          <li>郵件寄件者。</li>
          <li>郵件主旨。</li>
          <li>郵件文字內容。</li>
          <li>郵件 Message-ID。</li>
          <li>郵件接收時間。</li>
          <li>從通知中解析出的物流訂單編號、物流編號與物流事件。</li>
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="data-use">
        <h2 id="data-use">4. 資料使用方式</h2>

        <p>取得的 Gmail 資料僅用於：</p>

        <ul>
          <li>辨識物流通知格式。</li>
          <li>比對 KD Coffee 既有訂單。</li>
          <li>建立或更新訂單履約事件。</li>
          <li>偵測無法安全自動判斷的物流通知並交由人工確認。</li>
          <li>避免相同物流通知被重複處理。</li>
        </ul>

        <p>
          Gmail 資料不會用於廣告、行銷分析、信用評估或其他與
          KD Coffee 物流履約無關的用途。
        </p>
      </section>

      <section className={styles.section} aria-labelledby="storage">
        <h2 id="storage">5. 資料保存</h2>

        <p>
          系統不會刻意將完整原始 Gmail 郵件內容永久保存於
          KD Coffee 履約資料中。
        </p>

        <p>
          為完成物流作業，系統可能保存由郵件解析產生的營運資料，
          包括物流訂單識別碼、物流事件、事件時間、來源指紋、
          郵件 Message-ID 參考值及人工確認紀錄。
        </p>

        <p>
          這些資料依 KD Coffee 訂單與物流營運所需期間保存。
        </p>
      </section>

      <section className={styles.section} aria-labelledby="credentials">
        <h2 id="credentials">6. OAuth 憑證保存</h2>

        <p>
          OAuth Client Secret 與 Refresh Token 僅保存於 KD Coffee
          Railway 伺服器端的環境機密設定中。
        </p>

        <p>OAuth 憑證不會被刻意放入：</p>

        <ul>
          <li>瀏覽器端 JavaScript。</li>
          <li>公開網站頁面。</li>
          <li>Git repository。</li>
          <li>公開 log。</li>
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="sharing">
        <h2 id="sharing">7. 資料分享</h2>

        <ul>
          <li>Google 使用者資料不會被出售。</li>
          <li>Google 使用者資料不會被出租。</li>
          <li>Google 使用者資料不會用於廣告。</li>
          <li>Google 使用者資料不會分享給無關第三方。</li>
          <li>資料使用僅限 KD Coffee 的物流與訂單履約作業。</li>
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="google-policy">
        <h2 id="google-policy">8. Google API Services User Data Policy</h2>

        <p>
          本應用程式對從 Google API 取得資訊的使用與傳輸，
          遵守 Google API Services User Data Policy，
          包括其中的 Limited Use 要求。
        </p>
      </section>

      <section className={styles.section} aria-labelledby="revocation">
        <h2 id="revocation">9. 撤銷授權</h2>

        <p>
          授權 Gmail 帳戶的持有人可以透過 Google 帳戶安全性設定
          撤銷 KD Coffee Gmail Fulfillment 的 OAuth 存取權。
          撤銷後，應用程式將無法再透過該授權讀取 Gmail。
        </p>
      </section>

      <section className={styles.section} aria-labelledby="contact">
        <h2 id="contact">10. 聯絡方式</h2>

        <p>
          如對本政策或 KD Coffee Gmail Fulfillment 有疑問，
          請聯絡 KD Coffee：
        </p>

        <div className={styles.contactLinks}>
          <a
            className={styles.inlineLink}
            href="mailto:kdcoffee1962@gmail.com"
          >
            kdcoffee1962@gmail.com
          </a>
        </div>
      </section>
    </main>
  );
}