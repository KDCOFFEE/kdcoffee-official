import type { Metadata } from "next";

import styles from "../gmailFulfillment.module.css";

export const metadata: Metadata = {
  title: "KD Coffee Gmail Fulfillment 服務條款",
  description:
    "KD Coffee Gmail Fulfillment 內部物流自動化服務的使用條款。",
  alternates: { canonical: "/gmail-fulfillment/terms" },
};

export default function GmailFulfillmentTermsPage() {
  return (
    <main className={styles.main} id="main-content">
      <p className={styles.eyebrow}>TERMS OF SERVICE</p>

      <h1>KD Coffee Gmail Fulfillment 服務條款</h1>

      <time className={styles.updated} dateTime="2026-10-01">
        最後更新：2026-10-01
      </time>

      <p className={styles.lead}>
        KD Coffee Gmail Fulfillment 是供 KD Coffee 授權人員使用的
        內部物流自動化服務。
      </p>

      <section className={styles.section} aria-labelledby="service">
        <h2 id="service">1. 服務內容</h2>

        <p>
          本服務使用經授權的 Gmail API 唯讀存取，
          辨識與 KD Coffee 7-ELEVEN 訂單相關的物流通知，
          並協助更新內部訂單履約狀態。
        </p>
      </section>

      <section className={styles.section} aria-labelledby="authorized-use">
        <h2 id="authorized-use">2. 授權使用</h2>

        <p>
          本服務不是提供一般消費者登入或使用的公開 Gmail 工具。
          僅限 KD Coffee 明確授權的 Google 帳戶與營運流程使用。
        </p>
      </section>

      <section className={styles.section} aria-labelledby="scope">
        <h2 id="scope">3. Gmail 權限</h2>

        <p>本服務使用：</p>

        <p className={styles.scope}>
          https://www.googleapis.com/auth/gmail.readonly
        </p>

        <p>
          此權限僅供物流通知讀取與辨識。
          本服務不利用此權限寄送、刪除、移動或修改 Gmail 郵件。
        </p>
      </section>

      <section className={styles.section} aria-labelledby="responsibility">
        <h2 id="responsibility">4. 營運責任</h2>

        <p>
          自動辨識結果可能因寄件者格式變更、Google API 中斷、
          網路錯誤或資料不完整而無法完成。
          無法安全判斷的物流事件應由 KD Coffee 營運人員人工確認。
        </p>
      </section>

      <section className={styles.section} aria-labelledby="prohibited">
        <h2 id="prohibited">5. 禁止用途</h2>

        <p>本服務不得用於：</p>

        <ul>
          <li>未經授權存取其他人的 Gmail 帳戶。</li>
          <li>廣告投放或建立廣告使用者輪廓。</li>
          <li>出售或出租 Google 使用者資料。</li>
          <li>與 KD Coffee 物流履約無關的郵件監控。</li>
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="privacy">
        <h2 id="privacy">6. 隱私與 Google API 政策</h2>

        <p>
          本服務對 Google 使用者資料的處理方式，
          依 KD Coffee Gmail Fulfillment 隱私權政策及
          Google API Services User Data Policy 執行。
        </p>

        <a
          className={styles.inlineLink}
          href="/gmail-fulfillment/privacy"
        >
          查看隱私權政策
        </a>
      </section>

      <section className={styles.section} aria-labelledby="changes">
        <h2 id="changes">7. 條款更新</h2>

        <p>
          KD Coffee 可能因物流流程、Google API 規範或安全需求調整本條款。
          重大變更將更新本頁的最後更新日期。
        </p>
      </section>

      <section className={styles.section} aria-labelledby="contact">
        <h2 id="contact">8. 聯絡方式</h2>

        <p>如對本服務或條款有疑問，請聯絡：</p>

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