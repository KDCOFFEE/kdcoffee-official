import Link from "next/link";
import { storeProductHref } from "@/lib/storePublicMetadata";
import type { PublicStoreProductCard } from "@/lib/storePublicSelectors";
import styles from "./StorePublic.module.css";

const money = new Intl.NumberFormat("zh-TW", { maximumSignificantDigits: 21 });

type StoreCardEditorial = { label?: string; summary?: string; cta?: string; compact?: boolean; priceText?: string; pointsText?: string };
export default function StoreProductCard({ product, className = "", editorial, id }: { product: PublicStoreProductCard; className?: string; editorial?: StoreCardEditorial; id?: string }) {
  const media = product.heroMedia;
  const imageUrl = media?.type === "image" ? media.url : media?.type === "video" ? media.posterUrl : undefined;
  const alt = media?.alt.trim() ? media.alt : product.name;
  const onSale = product.salePrice !== undefined && product.salePrice < product.price;
  const currentPrice = product.salePrice !== undefined && product.salePrice < product.price ? product.salePrice : product.price;
  return (
    <article id={id} className={`${styles.card} ${className}`.trim()}>
      <div className={styles.cardMedia}>
        <Link className={styles.cardImageLink} href={storeProductHref(product.slug)} aria-label={`查看 ${product.name}`}>
        {imageUrl ? (
          <img src={imageUrl} alt={alt} loading="lazy" decoding="async" />
        ) : (
          <>
            <div className={styles.placeholder} aria-hidden="true"><span>KD COFFEE</span><small>STORE</small></div>
            <span className={styles.srOnly}>商品圖片尚未提供</span>
          </>
        )}
        </Link>
      </div>
      <div className={styles.cardBody}>
        {editorial?.label ? <p className={styles.featured}>{editorial.label}</p> : product.featured ? <p className={styles.featured}>精選</p> : null}
        {!editorial?.compact ? <p className={styles.cardContext}>{product.section.name}{product.category ? ` ／ ${product.category.name}` : ""}</p> : null}
        <h3><Link className={styles.textLink} href={storeProductHref(product.slug)}>{editorial?.cta ? <span>{editorial.cta}</span> : null}{product.name}</Link></h3>
        {editorial?.summary ? <p className={styles.cardContext}>{editorial.summary}</p> : null}
        {!editorial?.compact && product.shortDescription.trim() ? <p className={styles.cardDescription}>{product.shortDescription}</p> : null}
        <div className={styles.cardBottom}>
          <p className={styles.price}>
            {onSale ? <span className={styles.srOnly}>目前售價：</span> : null}
            {editorial?.priceText ? <strong>{editorial.priceText}</strong> : <strong>NT$ {money.format(currentPrice)}</strong>}
            {onSale ? <><span className={styles.srOnly}>原價：</span><del>NT$ {money.format(product.price)}</del></> : null}
          </p>
          {editorial?.pointsText ? <p className={styles.availability}>{editorial.pointsText}</p> : null}
          {!editorial?.compact ? <p className={styles.availability}>{product.inStock ? "有庫存" : "目前無庫存"}</p> : null}
        </div>
      </div>
    </article>
  );
}
