import Link from "next/link";
import { forbidden, redirect } from "next/navigation";
import { readAdminSession } from "@/lib/adminAuth";
import { readGiftCmsIndex } from "@/lib/giftCmsAdmin";
import StoreStudioNavigation from "@/components/admin/StoreStudioNavigation";
import styles from "@/components/admin/GiftCmsEditor.module.css";
export const dynamic="force-dynamic";
export default async function StoreContentStudio(){const session=await readAdminSession();if(!session)redirect("/admin/login");if(session.role!=="owner")forbidden();const products=await readGiftCmsIndex(true);
 return <main className={styles.page}><StoreStudioNavigation/><header className={styles.top}><div><Link href="/admin">← 返回營運中心</Link><p>STORE CONTENT STUDIO</p><h1>商店內容工作室</h1><span>內容與視覺在這裡編輯；價格、庫存與發布仍由商品管理負責。</span></div></header><div className={styles.actions}><Link className={styles.primary} href="/admin/store/content/landing">編輯 Store 首頁</Link><Link className={styles.secondary} href="/admin/store/content/gifts">編輯 Gifts 送禮頁</Link></div><h2>商品頁內容</h2><p className={styles.note}>新增的商店商品會自動出現在這裡，草稿也能先準備內容。</p><div className={styles.catalog}>{products.map(p=><article key={p.id}>{p.thumbnail?<img src={p.thumbnail} alt="" loading="lazy"/>:<div className={styles.placeholder}>STORE</div>}<div><h3>{p.name}</h3><p>{p.sku} · {p.category}</p><small>{p.archived?"已封存":p.published?"Published":"DRAFT"}</small></div><Link className={styles.secondary} href={"/admin/store/content/products/"+encodeURIComponent(p.slug)}>編輯頁面內容</Link></article>)}</div>{!products.length?<p>請先至商品管理新增商店商品。</p>:null}</main>;
}
