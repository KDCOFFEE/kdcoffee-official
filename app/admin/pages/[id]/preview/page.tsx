import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import PageBuilderRenderer from "@/components/page-builder/PageBuilderRenderer";
import { publishedPageRegistry } from "@/lib/pageBuilder";
import { readPageStore } from "@/lib/pageBuilderStore";
import { getLiveWebsiteData } from "@/data/websiteData";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "草稿預覽", robots: { index: false, follow: false, nocache: true } };
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) redirect("/admin/login"); const { id } = await params; const [store, website] = await Promise.all([readPageStore(), getLiveWebsiteData()]); const page = store.pages.find((item) => item.id === id); if (!page) notFound();
  return <><div className="page-builder-preview-nav"><span><b>草稿預覽</b>・此版本尚未公開</span><Link href={`/admin/pages/${page.id}`}>← 返回編輯</Link></div><Header/><PageBuilderRenderer page={page.draft} products={website.menu.products} registry={{ products: website.menu.products, pages: publishedPageRegistry(store) }} visualStyle={store.visualStyle}/><Footer/></>;
}
