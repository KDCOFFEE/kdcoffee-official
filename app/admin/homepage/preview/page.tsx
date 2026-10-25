import { redirect } from "next/navigation";
import { promises as fs } from "fs";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { getHomepageData } from "@/data/homepageData";
import { getWebsiteDataFile } from "@/lib/storagePaths";
import { publishedPageRegistry } from "@/lib/pageBuilder";
import { readPageStore } from "@/lib/pageBuilderStore";
import { getAsset } from "@/lib/assets";
import Footer from "@/components/layout/Footer";
import HomepageDraftPreview from "@/components/admin/HomepageDraftPreview";
import type { HomepageViewData } from "@/components/home/HomepageV3";
export const dynamic = "force-dynamic";
export const metadata = { title: "首頁草稿預覽", robots: { index: false, follow: false } };
export default async function HomepagePreviewPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const [homepage, website, pages, logo] = await Promise.all([getHomepageData(), fs.readFile(getWebsiteDataFile(), "utf8").then(JSON.parse), readPageStore(), getAsset("LOGO001")]);
  return <HomepageDraftPreview initial={homepage as unknown as HomepageViewData} products={website.menu?.products || []} pages={publishedPageRegistry(pages)} logo={logo ? { path: logo.path, alt: logo.alt } : undefined} footer={<Footer />} />;
}
