import Link from "next/link";
import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StoreProductGallery from "@/components/store/StoreProductGallery";
import styles from "@/components/store/StoreProductDetail.module.css";
import { readPublicStoreProductBySlug } from "@/lib/storePublicReadModel";
import { isStoreProductSlug, storeBrowseHref, storeProductMetadata } from "@/lib/storePublicMetadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type DetailProps = { params: Promise<{ slug: string }> };

// React cache shares this read only within an RSC request, never across requests.
const loadProduct = cache(async (slug: string) => {
  if (!isStoreProductSlug(slug)) notFound();
  const model = await readPublicStoreProductBySlug(slug);
  if (!model) notFound();
  return model;
});

export async function generateMetadata({ params }: DetailProps): Promise<Metadata> {
  const { slug } = await params;
  return storeProductMetadata(await loadProduct(slug));
}

const money = new Intl.NumberFormat("zh-TW", { maximumSignificantDigits: 21 });

export default async function StoreProductPage({ params }: DetailProps) {
  const { slug } = await params;
  const { product } = await loadProduct(slug);
  const sectionHref = storeBrowseHref({ sectionSlug: product.section.slug });
  const categoryHref = product.category
    ? storeBrowseHref({ sectionSlug: product.section.slug, categorySlug: product.category.slug })
    : sectionHref;
  const onSale = product.salePrice !== undefined && product.salePrice < product.price;
  const currentPrice = onSale ? product.salePrice! : product.price;
  const paragraphs = product.description.split(/\r?\n\s*\r?\n/u).filter(paragraph => paragraph.trim());

  return (
    <main id="store-main" tabIndex={-1} className={styles.main}>
      <nav className={styles.breadcrumb} aria-label="商品路徑">
        <ol>
          <li><Link href="/store">商店</Link></li>
          <li><Link href={sectionHref}>{product.section.name}</Link></li>
          {product.category ? <li><Link href={categoryHref}>{product.category.name}</Link></li> : null}
          <li aria-current="page">{product.name}</li>
        </ol>
      </nav>
      <div className={styles.presentation}>
        <StoreProductGallery key={product.slug} name={product.name} heroMedia={product.heroMedia} gallery={product.gallery} />
        <div className={styles.info}>
          <h1>{product.name}</h1>
          {product.shortDescription.trim() ? <p className={styles.lead}>{product.shortDescription}</p> : null}
          <section className={styles.purchase} aria-label="商品價格與供應狀態">
            <p className={styles.price}>
              {onSale ? <span className={styles.srOnly}>目前售價：</span> : null}
              <strong>NT$ {money.format(currentPrice)}</strong>
              {onSale ? <><span className={styles.srOnly}>原價：</span><del>NT$ {money.format(product.price)}</del></> : null}
            </p>
            <p className={styles.availability}>{product.inStock ? "有庫存" : "目前無庫存"}</p>
          </section>
        </div>
      </div>
      <div className={styles.content}>
        {product.specifications.length > 0 ? (
          <section className={styles.specifications} aria-labelledby="store-specifications-heading">
            <h2 id="store-specifications-heading">商品規格</h2>
            <dl>{product.specifications.map((spec, index) => (
              <div key={index}><dt>{spec.label}</dt><dd>{spec.value}</dd></div>
            ))}</dl>
          </section>
        ) : null}
        {paragraphs.length > 0 ? (
          <section className={styles.description} aria-labelledby="store-description-heading">
            <h2 id="store-description-heading">關於這件商品</h2>
            {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </section>
        ) : null}
      </div>
      <nav className={styles.backLinks} aria-label="繼續瀏覽商品">
        <Link href="/store">返回商店</Link>
        <Link href={categoryHref}>瀏覽{product.category?.name || product.section.name}</Link>
      </nav>
    </main>
  );
}
