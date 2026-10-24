import { readGiftCmsState } from "@/lib/giftCmsStore";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import GiftExperience from "@/components/gifts/GiftExperience";
import styles from "@/components/gifts/GiftExperience.module.css";
import { readPublicGiftCatalog } from "@/lib/giftPublicReadModel";
import { giftPageMetadata } from "@/lib/giftPresentation";
import { isStoreSeoPublicEnabled } from "@/lib/storeSeoPublication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return giftPageMetadata(isStoreSeoPublicEnabled(), (await readGiftCmsState()).landing?.seo);
}
export default async function GiftsPage() {
  const [model, cms] = await Promise.all([readPublicGiftCatalog(), readGiftCmsState()]);
  return <div id="top" className={styles.shell}>
    <a className={styles.skipLink} href="#gifts-main">跳至送禮專區內容</a>
    <Header />
    <GiftExperience model={model} cms={cms.landing} />
    <Footer />
  </div>;
}
