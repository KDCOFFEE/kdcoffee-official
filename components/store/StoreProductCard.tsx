import Link from "next/link";
import { storeProductHref } from "@/lib/storePublicMetadata";
import type { PublicStoreProductCard } from "@/lib/storePublicSelectors";
import styles from "./StorePublic.module.css";

const money = new Intl.NumberFormat("zh-TW", { maximumSignificantDigits: 21 });

export default function StoreProductCard({ product }: { product: PublicStoreProductCard }) {
  const media = product.heroMedia;
  const imageUrl = media?.type === "image" ? media.url : media?.type === "video" ? media.posterUrl : undefined;
  const alt = media?.alt.trim() ? media.alt : product.name;
  const onSale = product.salePrice !== undefined && product.salePrice < product.price;
  const currentPrice = product.salePrice !== undefined && product.salePrice < product.price ? product.salePrice : product.price;
  return (
    <article className={styles.card}>
      <div className={styles.cardMedia}>
        {imageUrl ? (
          <img src={imageUrl} alt={alt} loading="lazy" decoding="async" />
        ) : (
          <>
            <div className={styles.placeholder} aria-hidden="true"><span>KD COFFEE</span><small>STORE</small></div>
            <span className={styles.srOnly}>商品圖片尚未提供</span>
          </>
        )}
      </div>
      <div className={styles.cardBody}>
        {product.featured ? <p className={styles.featured}>精選</p> : null}
        <p className={styles.cardContext}>{product.section.name}{product.category ? ` ／ ${product.category.name}` : ""}</p>
        <h3><Link className={styles.textLink} href={storeProductHref(product.slug)}>{product.name}</Link></h3>
        {product.shortDescription.trim() ? <p className={styles.cardDescription}>{product.shortDescription}</p> : null}
        <div className={styles.cardBottom}>
          <p className={styles.price}>
            {onSale ? <span className={styles.srOnly}>目前售價：</span> : null}
            <strong>NT$ {money.format(currentPrice)}</strong>
            {onSale ? <><span className={styles.srOnly}>原價：</span><del>NT$ {money.format(product.price)}</del></> : null}
          </p>
          <p className={styles.availability}>{product.inStock ? "有庫存" : "目前無庫存"}</p>
        </div>
      </div>
    </article>
  );
}
