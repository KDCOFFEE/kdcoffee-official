import { withSiteSocialImage } from "@/lib/siteSocialImage";
import { socialPageMetadata } from "@/lib/socialMetadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import PageBuilderRenderer from "@/components/page-builder/PageBuilderRenderer";
import { publishedPageRegistry } from "@/lib/pageBuilder";
import { readPageStore } from "@/lib/pageBuilderStore";
import { getLiveWebsiteData } from "@/data/websiteData";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
async function published(slug: string) { const store = await readPageStore(); return { store, page: store.pages.find((item) => item.slug === slug && item.status === "published" && item.publishedSnapshot) }; }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params; const { page } = await published(slug); if (!page?.publishedSnapshot) return { robots: { index: false, follow: false } };
  const snapshot = page.publishedSnapshot;
  return withSiteSocialImage(socialPageMetadata({ path: `/pages/${encodeURIComponent(slug)}`, title: snapshot.seoTitle || snapshot.title,
    description: snapshot.seoDescription || undefined, images: [snapshot.socialImage?.path,
      ...snapshot.sections.filter(section => section.enabled).flatMap(section => section.media.filter(item => item.enabled).map(item => item.media.type === "image" ? item.media.url : item.media.posterUrl))] }));
}
export default async function PublicBuilderPage({ params }: Props) {
  const { slug } = await params; const [{ store, page }, website] = await Promise.all([published(slug), getLiveWebsiteData()]); if (!page?.publishedSnapshot) notFound();
  return <><Header/><PageBuilderRenderer page={page.publishedSnapshot} products={website.menu.products} registry={{ products: website.menu.products, pages: publishedPageRegistry(store) }} visualStyle={store.visualStyle}/><Footer/></>;
}
