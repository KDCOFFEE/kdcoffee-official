import Link from "next/link";
import styles from "@/components/store/StoreProductDetail.module.css";

export default function StoreProductNotFound() {
  return (
    <main id="store-main" tabIndex={-1} className={`${styles.main} ${styles.notFound}`}>
      <h1>找不到這件商品</h1>
      <p>這件商品目前未公開，或已不再提供。</p>
      <Link href="/store">返回商店</Link>
    </main>
  );
}
