import type { Metadata } from "next";
import Link from "next/link";
import ProductVisualMedia from "@/components/commerce/ProductVisualMedia";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import MonthlyMenuPrintButton, {
  type MonthlyMenuDownloadArtwork,
} from "@/components/monthly-menu/MonthlyMenuPrintButton";
import { getLiveWebsiteData, type CoffeeArtwork } from "@/data/websiteData";
import { isProductListedInWorks } from "@/lib/productListing";
import { resolveListAsset } from "@/lib/productVisualAssets";
import { normalizeMonthlyMenuBackground } from "@/lib/monthlyMenuBackground";
import styles from "./monthly-menu.module.css";

export const metadata: Metadata = {
  title: "本月豆單｜每月咖啡作品選集",
  description:
    "KD Coffee 本月精品咖啡豆單：一次閱讀本月作品、風味、規格與參考售價。",
};

export const dynamic = "force-dynamic";

type MonthlyArtwork = CoffeeArtwork & { originalIndex: number };

type MenuPurchaseOption = {
  label: string;
  detail: string;
  price: number;
};

function getMonthlyArtworks(products: CoffeeArtwork[]): MonthlyArtwork[] {
  return products
    .filter((product) => product.inMonthlyMenu === true)
    .map((product, originalIndex) => ({ ...product, originalIndex }))
    .sort((a, b) => {
      const aSort = Number.isFinite(Number(a.sort)) ? Number(a.sort) : Number.MAX_SAFE_INTEGER;
      const bSort = Number.isFinite(Number(b.sort)) ? Number(b.sort) : Number.MAX_SAFE_INTEGER;
      return aSort - bSort || a.originalIndex - b.originalIndex;
    });
}

function getMonthPresentation(monthKey?: string, monthLabel?: string) {
  const match = monthKey?.match(/^(\d{4})-(0[1-9]|1[0-2])$/);

  if (!match) {
    return {
      label: monthLabel?.trim() || "MONTHLY SELECTION",
      issue: "MONTHLY EDITION",
      title: "本月豆單",
    };
  }

  const [, year, month] = match;
  return {
    label: monthLabel?.trim() || `${year} / ${month}`,
    issue: `${year} / ${month}`,
    title: `${Number(month)} 月豆單`,
  };
}

function getDisplayPurchases(product: CoffeeArtwork): MenuPurchaseOption[] {
  return (product.purchase || [])
    .filter((option) => option.enabled !== false)
    .map((option) => ({
      label: option.label.trim(),
      detail: option.detail.trim(),
      price: Number(option.price),
    }))
    .filter((option) => option.label && Number.isFinite(option.price) && option.price > 0);
}

function isSoldOut(product: CoffeeArtwork) {
  return (
    !isProductListedInWorks(product) ||
    product.status === "sold_out" ||
    product.purchasable === false
  );
}

const backgroundPositions = {
  auto: "center",
  center: "center",
  "top-left": "left top",
  "top-right": "right top",
  "bottom-left": "left bottom",
  "bottom-right": "right bottom",
} as const;

export default async function MonthlyMenuPage() {
  const live = await getLiveWebsiteData();
  const products = getMonthlyArtworks(live.menu.products);
  const month = getMonthPresentation(live.menu.monthKey, live.menu.monthLabel);
  const background = normalizeMonthlyMenuBackground(live.menu.background);
  const downloadArtworks: MonthlyMenuDownloadArtwork[] = products.map((product, index) => ({
    number: String(index + 1).padStart(2, "0"),
    tag: product.tag?.trim() || undefined,
    availability: isSoldOut(product) ? "暫時售完" : undefined,
    imageSrc: resolveListAsset(product)?.path,
    name: product.name,
    artist: product.artist,
    flavors: product.flavors?.filter(Boolean).slice(0, 4) || [],
    origin: product.origin,
    process: product.process,
    roast: product.roast,
    purchases: getDisplayPurchases(product),
  }));

  return (
    <main id="top" className={styles.page}>
      <Header />

      <div className={styles.sheetStage}>
        <div className={styles.sheetPreview}>
          <article className={styles.sheet} aria-labelledby="monthly-menu-title">
            {background.image ? (
              <span
                className={styles.backgroundArtwork}
                aria-hidden="true"
                style={{
                  backgroundImage: `url(${background.image})`,
                  backgroundPosition: backgroundPositions[background.position],
                  backgroundSize: background.fit,
                  opacity: background.opacity,
                }}
              />
            ) : null}
            <header className={styles.sheetHeader}>
              <div className={styles.headerCopy}>
                <p>KD COFFEE</p>
                <span>MONTHLY SELECTION</span>
                <h1 id="monthly-menu-title">{month.title}</h1>
                <small aria-label={month.label}>{month.issue} · {products.length} 件作品</small>
              </div>
            </header>

            <section className={styles.menuTable} aria-label={`${month.title}作品清單`}>
              <div className={styles.tableHeader} aria-hidden="true">
                <span>NO.</span>
                <span>ARTWORK</span>
                <span>FLAVOR</span>
                <span>ORIGIN / PROCESS / ROAST</span>
                <span>PRICE</span>
                <span>MORE</span>
              </div>

              <div className={styles.tableRows}>
                {products.map((product, index) => {
                  const listAsset = resolveListAsset(product);
                  const flavors = product.flavors?.filter(Boolean).slice(0, 4) || [];
                  const purchases = getDisplayPurchases(product);
                  const soldOut = isSoldOut(product);
                  const headingId = `monthly-artwork-${product.slug}`;

                  return (
                    <article className={styles.artwork} aria-labelledby={headingId} key={product.slug}>
                    <div className={styles.numberCell}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      {product.tag?.trim() ? <em>{product.tag.trim()}</em> : null}
                    </div>

                    <div className={styles.artworkCell}>
                      <div className={styles.thumbnail}>
                        <ProductVisualMedia
                          src={listAsset?.path}
                          alt={listAsset?.alt || `${product.name} 咖啡作品`}
                          className={styles.image}
                          loading="eager"
                          decoding="async"
                          fallback={<span aria-hidden="true">KD</span>}
                        />
                      </div>
                      <Link href={`/works/${product.slug}`}>
                        <h2 id={headingId}>{product.name}</h2>
                        <span>{product.artist}</span>
                      </Link>
                    </div>

                    <div className={styles.flavorCell}>
                      <b>FLAVOR</b>
                      <p>{flavors.map((flavor, flavorIndex) => (
                        <span key={`${product.slug}-${flavor}`}>
                          {flavor}{flavorIndex < flavors.length - 1 ? " · " : ""}
                        </span>
                      ))}</p>
                    </div>

                    <div className={styles.factsCell}>
                      <b>ORIGIN / PROCESS / ROAST</b>
                      <p>
                        <span>{product.origin}</span>
                        <span>{product.process}</span>
                        <span>{product.roast}</span>
                      </p>
                    </div>

                    <div className={styles.priceCell}>
                      <b>PRICE</b>
                      {purchases.length ? (
                        <ul aria-label={`${product.name}規格與參考售價`}>
                          {purchases.map((option) => (
                            <li key={`${product.slug}-${option.label}-${option.detail}`}>
                              <span>{option.label} {option.detail}</span>
                              <strong>NT$ {option.price.toLocaleString("zh-TW")}</strong>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>

                    <div className={styles.moreCell}>
                      <b>MORE</b>
                      {soldOut ? <span>暫時售完</span> : null}
                      <Link href={`/works/${product.slug}`}>查看作品 <i aria-hidden="true">→</i></Link>
                    </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <footer className={styles.sheetFooter}>
              <div>
                <span>KD COFFEE · 1962</span>
                <span>www.kdcoffee1962.com</span>
              </div>
              <Link href="/works">查看全部咖啡 <span aria-hidden="true">→</span></Link>
            </footer>
          </article>
        </div>

        <div className={styles.printActions}>
          <MonthlyMenuPrintButton
            monthKey={live.menu.monthKey}
            monthTitle={month.title}
            monthIssue={month.issue}
            artworks={downloadArtworks}
            background={background}
          />
          <Link href="/works">查看全部咖啡 <span aria-hidden="true">→</span></Link>
        </div>
      </div>

      <Footer />
    </main>
  );
}
