"use client";
import Link from "next/link";
import styles from "./GiftCmsEditor.module.css";
export default function StoreStudioNavigation({dirty=false}:{dirty?:boolean}){return <nav onClickCapture={e=>{if(dirty&&(e.target as Element).closest("a")&&!window.confirm("目前有尚未儲存的變更，確定離開？"))e.preventDefault();}} className={styles.studioNav} aria-label="商店管理"><Link href="/admin/store">商品管理</Link><Link href="/admin/store/content/landing">Store 首頁</Link><Link href="/admin/store/content">商品頁內容</Link><Link href="/admin/store/content/gifts">Gifts 送禮頁</Link><Link href="/admin/store/content/landing?tab=visual">視覺設定</Link><Link href="/admin/assets">素材</Link><Link href="/admin/store/content/landing?tab=seo">SEO</Link></nav>}
