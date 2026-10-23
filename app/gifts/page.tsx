import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import GiftExperience from "@/components/gifts/GiftExperience";
import styles from "@/components/gifts/GiftExperience.module.css";
import { readPublicGiftCatalog } from "@/lib/giftPublicReadModel";
import { giftPageMetadata } from "@/lib/giftPresentation";
import { isStoreSeoPublicEnabled } from "@/lib/storeSeoPublication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function generateMetadata() {
  return giftPageMetadata(isStoreSeoPublicEnabled());
}
export default async function GiftsPage() {
  const model = await readPublicGiftCatalog();
  return <div id="top" className={styles.shell}>
    <a className={styles.skipLink} href="#gifts-main">跳至送禮專區內容</a>
    <Header />
    <GiftExperience model={model} />
    <Footer />
  </div>;
}
