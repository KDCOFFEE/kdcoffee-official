import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import PageBuilderRenderer from "@/components/page-builder/PageBuilderRenderer";
import { getLiveWebsiteData } from "@/data/websiteData";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { PAGE_BUILDER_QA_FIXTURE } from "@/lib/pageBuilderQaFixture";
import { publishedPageRegistry } from "@/lib/pageBuilder";
import { readPageStore } from "@/lib/pageBuilderStore";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "頁面視覺檢查", robots: { index: false, follow: false, nocache: true } };

export default async function PageBuilderDesignQaPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const [store, website] = await Promise.all([readPageStore(), getLiveWebsiteData()]);
  return <><div className="page-builder-preview-nav"><span><b>視覺檢查</b>・程式內測試內容，不會寫入正式頁面資料</span><Link href="/admin/pages">← 返回頁面管理</Link></div><Header/><PageBuilderRenderer page={PAGE_BUILDER_QA_FIXTURE} products={website.menu.products} registry={{ products: website.menu.products, pages: publishedPageRegistry(store) }} visualStyle={store.visualStyle}/><Footer/></>;
}
