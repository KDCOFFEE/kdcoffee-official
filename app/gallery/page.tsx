import { readPageStore } from '@/lib/pageBuilderStore';
import { getAssetLibrary } from '@/lib/assets';
import { resolveGalleryAtmosphere } from '@/lib/galleryAtmosphere';
import { galleryMetadata, galleryStructuredData, serializeGalleryStructuredData } from '@/lib/gallerySeo';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import GalleryExperience from '@/components/gallery/GalleryExperience';
import { getLiveWebsiteData } from '@/data/websiteData';
import { resolveGalleryActiveIndex } from '@/lib/galleryNavigation';
import { resolveGalleryWorks } from '@/lib/galleryWorks';
import { getCanonicalPublicSiteOrigin } from '@/lib/publicSiteOrigin';
import css from '@/components/gallery/GalleryExperience.module.css';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  const [store, library] = await Promise.all([readPageStore().catch(() => null), getAssetLibrary().catch(() => null)]);
  return galleryMetadata(getCanonicalPublicSiteOrigin(), library?.assets.find(asset => asset.id === 'LOGO001'), store?.systemPages?.gallery?.seo, library?.assets || []);
}
export default async function GalleryPage({ searchParams }: { searchParams: Promise<{ work?: string | string[] }> }) {
  const query = await searchParams;
  const [site, pageStore, library] = await Promise.all([getLiveWebsiteData(), readPageStore().catch(() => null), getAssetLibrary().catch(() => null)]);
  const atmosphere = resolveGalleryAtmosphere(pageStore?.systemPages?.gallery?.atmosphere, library?.assets || []);
  const works = resolveGalleryWorks(site.menu.products);
  return <><div className={css.headerChrome}><Header publicProductsOnly/></div><main className={css.page}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeGalleryStructuredData(galleryStructuredData(getCanonicalPublicSiteOrigin(), works, pageStore?.systemPages?.gallery?.seo)) }}/><div className={css.room}>
    <div className={css.atmosphere} aria-hidden="true">{atmosphere.imageUrl ? <span className={css.atmosphereImage} style={{ backgroundImage: `url("${atmosphere.imageUrl}")`, opacity: atmosphere.strength / 100, filter: `blur(${atmosphere.blur}px) brightness(${1 - atmosphere.darkness / 100})` }}/> : null}<span className={css.arch}/><span className={css.arch}/></div>
    <div className={css.shell}>
    <section className={css.hero} aria-label="作品詮釋">
      <div><p className={css.eyebrow}>WORKS</p><h1>每一支作品，<span>都有自己的情緒與風景。</span></h1><p className={css.introduction}>KD Coffee 作品詮釋，慢慢閱讀咖啡與藝術的風景。</p></div>
    </section>
    <GalleryExperience works={works} initialWorkSlug={works[resolveGalleryActiveIndex(works, query.work)]?.slug}/>
  </div></div></main><Footer/></>;
}
