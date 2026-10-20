import Link from "next/link";
import { worksRecord, worksReference } from "@/lib/worksArtworkContract";
import styles from "./WorksArtworkWorkspace.module.css";

export default function WorksArtworkIndex({ products }: { products: readonly unknown[] }) {
  const seen = new Set<string>();
  // Match the Owner read service's canonical identity requirements. If the
  // catalog is ambiguous, do not offer links that the service cannot resolve.
  const valid = products.every(product => {
    if (!worksRecord(product) || !worksReference(product.slug) || seen.has(product.slug)) return false;
    seen.add(product.slug);
    return true;
  });
  return <section className={styles.artworkIndex} aria-labelledby="artwork-index-title">
    <header><h2 id="artwork-index-title">個別作品工作區</h2>
      <p>選擇作品，編輯作品頁的引言、故事與風味敘述。下方的全部咖啡設定維持原有功能。</p></header>
    {!valid ? <p role="alert">作品目錄需要確認，暫時無法提供個別作品入口。</p> :
      products.length === 0 ? <p>目前沒有可管理的作品。</p> :
        <><p className={styles.indexCount}>共 {products.length} 件作品</p>
          <ul>{products.map(product => {
            const item = product as Record<string, unknown>;
            const slug = item.slug as string;
            const name = typeof item.name === "string" && item.name.trim() ? item.name : slug;
            return <li key={slug}><div><strong>{name}</strong><small>{slug}</small></div>
              <Link href={"/admin/works/" + encodeURIComponent(slug)} aria-label={"進入作品：" + name}>進入作品 <span aria-hidden="true">→</span></Link></li>;
          })}</ul></>}
  </section>;
}
