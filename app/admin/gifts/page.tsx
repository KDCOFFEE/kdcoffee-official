import Link from "next/link";
import { forbidden, redirect } from "next/navigation";
import { readAdminSession } from "@/lib/adminAuth";
import { readGiftCmsIndex } from "@/lib/giftCmsAdmin";
import styles from "@/components/admin/GiftCmsEditor.module.css";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function GiftCmsIndex() {
  const session = await readAdminSession(); if (!session) redirect("/admin/login"); if (session.role !== "owner") forbidden();
  const products = await readGiftCmsIndex();
  return <main className={styles.page}><header className={styles.top}><div><Link href="/admin">← 返回營運中心</Link><p>GIFTS CONTENT STUDIO</p><h1>禮盒頁管理</h1><Link href="/admin/store/content">進入商店內容工作室 →</Link><span>編輯送禮內容；商品價格、庫存與發布仍由商店管理。</span></div></header>
    <section className={styles.landingCard}><div><p>/gifts</p><h2>送禮首頁</h2><p>主視覺、分類、選禮建議與客製送禮。</p></div><Link className={styles.primary} href="/admin/gifts/landing">編輯頁面</Link></section>
    <h2>禮盒商品內容</h2><div className={styles.catalog}>{products.map(p => <article key={p.id}>{p.thumbnail ? <img src={p.thumbnail} alt="" loading="lazy" /> : <div className={styles.placeholder}>GIFT</div>}<div><h3>{p.name}</h3><p>{p.sku} · {p.category}</p><small>{p.archived ? "已封存" : p.published ? "Published" : "DRAFT"}</small></div><Link className={styles.secondary} href={"/admin/gifts/products/" + encodeURIComponent(p.slug)}>編輯頁面內容</Link></article>)}</div>{!products.length ? <p>目前尚無禮盒商品。請至商店工作區新增 Gift 商品。</p> : null}
  </main>;
}
