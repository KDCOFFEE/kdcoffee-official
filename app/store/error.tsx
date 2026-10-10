"use client";

import Link from "next/link";
import styles from "@/components/store/StorePublic.module.css";

export default function StoreError({ unstable_retry }: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry: () => void;
}) {
  return (
    <main id="store-main" tabIndex={-1} className={`${styles.main} ${styles.errorState}`}>
      <p className={styles.eyebrow}>STORE</p>
      <h1>商店暫時無法載入</h1>
      <p>商店目前暫時無法載入，請稍後再試。</p>
      <div className={styles.errorActions}>
        <button className={styles.retryButton} type="button" onClick={() => unstable_retry()}>重新載入商店</button>
        <Link className={styles.textLink} href="/">返回首頁</Link>
      </div>
    </main>
  );
}
