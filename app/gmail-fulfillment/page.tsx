import type { Metadata } from "next";
import Link from "next/link";

import styles from "./gmailFulfillment.module.css";

export const metadata: Metadata = {
  title: "KD Coffee Gmail Fulfillment",
  description:
    "KD Coffee 內部使用的 7-ELEVEN 物流通知 Gmail 自動追蹤服務說明。",
  alternates: { canonical: "/gmail-fulfillment" },
};

export default function GmailFulfillmentPage() {
  return (
    <main className={styles.main} id="main-content">
      <p className={styles.eyebrow}>LOGISTICS AUTOMATION</p>

      <h1>KD Coffee Gmail Fulfillment</h1>

      <p className={styles.lead}>
        KD Coffee Gmail Fulfillment 是 KD Coffee 內部使用的物流自動化工具，
        用於讀取授權 Gmail 帳戶中的 7-ELEVEN 物流通知，
        協助更新 KD Coffee 訂單的履約與取貨狀態。
      </p>

      <section className={styles.section} aria-labelledby="purpose">
        <h2 id="purpose">服務用途</h2>
        <p>本服務僅用於 KD Coffee 內部物流作業，包括：</p>
        <ul>
          <li>搜尋 7-ELEVEN 物流服務寄送的通知郵件。</li>
          <li>辨識物流訂單編號與物流狀態。</li>
          <li>將已辨識的物流事件連結至對應的 KD Coffee 訂單。</li>
          <li>協助營運人員掌握交寄、到店、取貨及例外狀態。</li>
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="gmail-access">
        <h2 id="gmail-access">Gmail API 存取</h2>
        <p>
          本服務使用 Gmail API 的唯讀權限。應用程式不會透過此權限寄送、
          刪除、移動或修改使用者郵件。
        </p>

        <p className={styles.scope}>
          https://www.googleapis.com/auth/gmail.readonly
        </p>
      </section>

      <aside className={styles.notice} aria-label="資料使用說明">
        <strong>資料使用承諾</strong>
        <p>
          Gmail 資料僅用於 KD Coffee 的 7-ELEVEN 訂單物流追蹤，
          不會出售、出租、用於廣告，或提供給與此物流作業無關的第三方。
        </p>

        <div className={styles.links}>
          <Link className={styles.actionLink} href="/gmail-fulfillment/privacy">
            隱私權政策 →
          </Link>

          <Link className={styles.actionLink} href="/gmail-fulfillment/terms">
            服務條款 →
          </Link>
        </div>
      </aside>
    </main>
  );
}