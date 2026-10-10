import Link from "next/link";
import type { Metadata } from "next";
import StoreFilters from "@/components/store/StoreFilters";
import StoreProductCard from "@/components/store/StoreProductCard";
import styles from "@/components/store/StorePublic.module.css";
import { readPublicStoreIndex } from "@/lib/storePublicReadModel";
import { parseStorePublicQuery, storeBrowseHref, storeLandingMetadata } from "@/lib/storePublicMetadata";
import type { StoreSearchParams } from "@/lib/storePublicMetadata";
import { publicStoreHero, storeHeroStyle } from "@/lib/storeHero";
import heroMotionStyles from "@/components/store/StoreHeroMotion.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type StorePageProps = { searchParams: Promise<StoreSearchParams> };

export async function generateMetadata({ searchParams }: StorePageProps): Promise<Metadata> {
  return storeLandingMetadata(await searchParams);
}

export default async function StorePage({ searchParams }: StorePageProps) {
  const query = await searchParams;
  const model = await readPublicStoreIndex(parseStorePublicQuery(query));
  const { items, page, totalItems, totalPages } = model.products;
  const hero = model.hero || publicStoreHero();
  const messages = {
    "unknown-section": "找不到此銷售專區。",
    "category-requires-section": "請先選擇銷售專區。",
    "unknown-category": "找不到此商品分類。",
  };
  const invalidMessage = model.filterStatus === "valid" ? null : messages[model.filterStatus];
  const browseOptions = {
    ...(model.selectedSection ? { sectionSlug: model.selectedSection.slug } : {}),
    ...(model.selectedCategory ? { categorySlug: model.selectedCategory.slug } : {}),
  };
  const clearHref = model.filterStatus === "unknown-category" && model.selectedSection
    ? storeBrowseHref({ sectionSlug: model.selectedSection.slug }) : "/store";

  return (
    <main id="store-main" tabIndex={-1} className={styles.main}>
      <header className={`${styles.hero} ${heroMotionStyles.motion}`} data-store-hero-motion={hero.motionEnabled ? "on" : "off"} style={storeHeroStyle(hero)}>
        <img className={styles.heroImage} src={hero.backgroundImage.url} alt={hero.backgroundImage.alt} fetchPriority="high" decoding="async" />
        <img className={styles.heroMobileImage} src={hero.mobileBackgroundImage.url} alt={hero.mobileBackgroundImage.alt} loading="lazy" decoding="async" />
        <div className={styles.heroContent}>
          <h1>{hero.title}</h1>
          <p className={styles.heroCopy}>{hero.subtitle}</p>
        </div>
      </header>
      <StoreFilters model={model} />
      <section className={styles.results} aria-labelledby="store-results-heading">
        <header className={styles.resultsHeader}>
          <div><h2 id="store-results-heading">{model.selectedCategory?.name || "商品一覽"}</h2></div>
          <p className={styles.resultCount} aria-live="polite">{totalItems} 件商品</p>
        </header>
        {invalidMessage ? (
          <div className={styles.state} role="status">
            <p>{invalidMessage}</p>
            <Link className={styles.textLink} href={clearHref}>{model.filterStatus === "unknown-category" ? "查看此專區全部商品" : "查看全部商品"}</Link>
          </div>
        ) : totalItems === 0 ? (
          <div className={styles.state}><p>{model.selectedSection ? "此分類目前沒有商品。" : "目前尚無公開商品。"}</p></div>
        ) : (
          <div className={styles.grid}>{items.map(product => <StoreProductCard key={product.slug} product={product} />)}</div>
        )}
        {model.filterStatus === "valid" && totalPages > 1 ? (
          <nav className={styles.pagination} aria-label="商品分頁">
            <div>{page > 1 ? <Link className={styles.pageLink} rel="prev" href={storeBrowseHref({ ...browseOptions, page: page - 1 })}>上一頁</Link> : null}</div>
            <p aria-current="page">第 {page} / {totalPages} 頁</p>
            <div>{page < totalPages ? <Link className={styles.pageLink} rel="next" href={storeBrowseHref({ ...browseOptions, page: page + 1 })}>下一頁</Link> : null}</div>
          </nav>
        ) : null}
      </section>
    </main>
  );
}
