import Link from "next/link";

import styles from "./gmailFulfillment.module.css";

export default function GmailFulfillmentLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main-content">
        跳至主要內容
      </a>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href="/" aria-label="KD Coffee 首頁">
            <strong>KD</strong>
            <span>COFFEE</span>
          </Link>

          <span className={styles.headerLabel}>Gmail Fulfillment</span>
        </div>
      </header>

      {children}

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span>KD Coffee Gmail Fulfillment</span>
          <span>Internal logistics automation service</span>
        </div>
      </footer>
    </div>
  );
}