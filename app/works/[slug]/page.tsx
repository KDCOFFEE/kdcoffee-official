import Link from "next/link";
import { notFound } from "next/navigation";
import { getLiveWebsiteData } from "@/data/websiteData";
import AddToCart from "@/components/commerce/AddToCart";
import CartLink from "@/components/commerce/CartLink";
import MobilePurchaseReturnButton from "@/components/commerce/MobilePurchaseReturnButton";
import ProductVisualMedia from "@/components/commerce/ProductVisualMedia";
import KdMedia from "@/components/media/KdMedia";
import {
  getProductMediaAsset,
  resolveGalleryAssets,
  resolveHeroAsset,
  resolveListAsset,
  resolveProductAsset,
  resolveProductAssetPath,
  resolveStaticProductImage,
} from "@/lib/productVisualAssets";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const live = await getLiveWebsiteData();
  const product: any = live.menu.products.find((p: any) => p.slug === slug);
  const image = product
    ? resolveHeroAsset(product) || resolveProductAsset(product) || resolveListAsset(product)
    : null;
  return {
    title: product ? `${product.name}｜KD Coffee 咖啡藝術工坊` : "咖啡作品｜KD Coffee",
    description: product?.shortCopy || product?.mood,
    openGraph: image ? { images: [{ url: image.path, alt: image.alt || product.name }] } : undefined,
  };
}

function ProductBagFallback({ product, compact = false }: { product: any; compact?: boolean }) {
  return (
    <div className={`product-bag-fallback ${compact ? "compact" : ""}`} aria-label={`${product.name} 商品包裝示意`}>
      <div className="fallback-bag">
        <span className="fallback-seal">PULL TAB TO OPEN</span>
        <div className="fallback-valve" />
        <div className="fallback-label">
          <small>KD COFFEE · {product.artist}</small>
          <strong>{product.name}</strong>
          <span>{product.flavors?.slice(0, 3).join(" · ") || "精品咖啡作品"}</span>
          <i>{product.origin || "KD Coffee"}　{product.roast || "小量烘焙"}</i>
        </div>
      </div>
      {!compact ? <p>尚未上傳商品照片，目前以包裝示意呈現</p> : null}
    </div>
  );
}

export default async function WorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const live = await getLiveWebsiteData();
  const product: any = live.menu.products.find((item: any) => item.slug === slug);
  if (!product || product.status === "hidden") notFound();

  const isGiottoPrototype = product.slug === "giotto-awakening";

  const d = product.displayFields || {};
  const layout = {
    heroAsset: "hero",
    productAsset: "productPhoto",
    listAsset: "mainVisual",
    galleryAssets: ["label"],
    showGallery: true,
    showRelatedWorks: true,
    ...(product.pageLayout || {}),
  };
  const heroAsset = resolveHeroAsset(product);
  const presentationHeroAsset = heroAsset || (isGiottoPrototype ? resolveListAsset(product) : null);
  const productAsset = resolveProductAsset(product);
  const heroMedia = getProductMediaAsset(product, "hero");
  const heroVideo = heroMedia?.type === "video" ? heroMedia : undefined;
  const legacyHeroPath = resolveProductAssetPath(product, "hero");
  const staticProductFallback = resolveStaticProductImage(product);
  const heroPath = presentationHeroAsset?.path || "";
  const productPath = productAsset?.path || "";
  const gallery = resolveGalleryAssets(product);
  const related = live.menu.products.filter((p: any) => p.slug !== product.slug && p.status !== "hidden" && p.inMonthlyMenu).slice(0, 3);
  const facts = [
    ["origin", "產區", product.origin],
    ["process", "處理法", product.process],
    ["roast", "烘焙度", product.roast],
    ["variety", "品種", product.variety],
    ["altitude", "海拔", product.altitude],
  ].filter(([key, , value]) => d[key as string] !== false && value && value !== "待確認");
  const minPrice = product.purchase?.length ? Math.min(...product.purchase.map((o: any) => o.price)) : null;
  const suitable = product.tag?.includes("入門")
    ? "第一次喝精品咖啡的人"
    : product.flavors?.length
      ? `喜歡${product.flavors.slice(0, 2).join("、")}風味的人`
      : "想探索不同風味的人";

  return (
    <main className={`revenue-product-page${isGiottoPrototype ? " giotto-art-direction" : ""}`}>
      <header className="revenue-product-nav">
        <Link href="/works">← 返回本月作品</Link>
        <Link className="brand" href="/"><span>KD</span><b>COFFEE</b></Link>
        <CartLink compact />
      </header>

      <section className={`revenue-hero ${heroVideo || heroPath ? "has-wide-hero" : ""}`} id="top-purchase">
        <div className="revenue-media">
          <div className={`revenue-image-stage ${heroVideo || heroPath ? "wide-hero-stage" : "product-stage"}`}>
            {heroVideo ? (
              <>
                <KdMedia
                  media={heroVideo}
                  alt={presentationHeroAsset?.alt || `${product.name} 商品形象主視覺`}
                  className="wide-hero-image"
                  backgroundVideo
                  eager
                  fallbackImageUrl={legacyHeroPath}
                  fallback={
                    staticProductFallback ? (
                      <ProductVisualMedia
                        src={staticProductFallback}
                        alt={`${product.name} 商品形象主視覺`}
                        className="wide-hero-image"
                        loading="eager"
                        fallback={<ProductBagFallback product={product} />}
                      />
                    ) : (
                      <ProductBagFallback product={product} />
                    )
                  }
                />
                <div className="wide-hero-shade" />
                <div className="wide-hero-copy">
                  <small>{isGiottoPrototype ? "KD COFFEE · COFFEE ARTWORK" : "KD COFFEE ARTWORK"}</small>
                  {isGiottoPrototype ? <span>{product.artist} · {product.flavors?.slice(0, 3).join("・")}</span> : <><strong>{product.name}</strong><span>{product.flavors?.slice(0, 3).join("・")}</span></>}
                </div>
              </>
            ) : heroPath ? (
              <>
                <img className="wide-hero-image" src={heroPath} alt={presentationHeroAsset?.alt || `${product.name} 商品形象主視覺`} />
                <div className="wide-hero-shade" />
                <div className="wide-hero-copy">
                  <small>{isGiottoPrototype ? "KD COFFEE · COFFEE ARTWORK" : "KD COFFEE ARTWORK"}</small>
                  {isGiottoPrototype ? <span>{product.artist} · {product.flavors?.slice(0, 3).join("・")}</span> : <><strong>{product.name}</strong><span>{product.flavors?.slice(0, 3).join("・")}</span></>}
                </div>
              </>
            ) : productPath ? (
              <img className="product-photo" src={productPath} alt={productAsset?.alt || `${product.name} 商品照片`} />
            ) : (
              <ProductBagFallback product={product} />
            )}
          </div>
          <div className="revenue-media-caption"><span>{heroVideo || heroPath ? "商品情境主視覺" : "實際商品包裝"}</span><b>實際出貨內容以所選規格為準</b></div>
        </div>

        <div className="revenue-buybox">
          <p className="revenue-kicker">KD COFFEE · {product.artist}</p>
          <div className="revenue-badges">
            {product.tag ? <span>{product.tag}</span> : null}
            {product.stock && product.stock <= 5 ? <span className="stock-alert">少量供應</span> : null}
          </div>
          <h1>{product.name}</h1>
          <p className="revenue-lead">{product.shortCopy || product.subtitle}</p>
          <p className="revenue-order-promise">第一次購買也安心：選規格、填取貨資料，收到商品再付款。</p>

          <div className="revenue-quickfacts">
            {product.origin ? <span><small>產區</small><b>{product.origin}</b></span> : null}
            {product.process ? <span><small>處理法</small><b>{product.process}</b></span> : null}
            {product.roast ? <span><small>烘焙度</small><b>{product.roast}</b></span> : null}
          </div>

          <div className="revenue-fit">
            <b>適合這樣的你</b>
            <span>✓ {suitable}</span>
            <span>✓ 想喝乾淨、清楚、不焦苦的咖啡</span>
          </div>

          {product.flavors?.length ? <div className="revenue-flavors">{product.flavors.slice(0, 5).map((f: string) => <span key={f}>{f}</span>)}</div> : null}
          {minPrice !== null ? <div className="revenue-price"><small>售價</small><strong>NT$ {minPrice.toLocaleString("zh-TW")} 起</strong></div> : null}
          {isGiottoPrototype ? <p className="giotto-purchase-heading">SELECT YOUR COFFEE</p> : null}
          <AddToCart product={product} />
        </div>
      </section>
      <div
        id="purchase-end-sentinel"
        className="purchase-end-sentinel"
        aria-hidden="true"
      />

      <section className="revenue-proof-strip">
        <div><b>自製熱風烘焙</b><span>風味乾淨，降低焦苦與雜味</span></div>
        <div><b>小量新鮮製作</b><span>依實際供應安排烘焙與包裝</span></div>
        <div><b>7-ELEVEN 取貨付款</b><span>收到商品再付款，第一次購買更安心</span></div>
      </section>

      <section className="revenue-content-section revenue-taste">
        <div className="revenue-section-title">
          <p>{isGiottoPrototype ? "THE ARTWORK" : "WHAT IT TASTES LIKE"}</p>
          <h2>{isGiottoPrototype ? product.name : "喝起來是什麼感覺？"}</h2>
          <span>{product.mood || "一杯乾淨、清楚，而且容易親近的精品咖啡。"}</span>
        </div>
        <div className="revenue-taste-card">
          <div className="taste-main"><small>主要風味</small><strong>{product.flavors?.slice(0, 3).join("、") || "乾淨甜感"}</strong><p>{product.subtitle || product.shortCopy}</p></div>
          {facts.length ? <dl>{facts.map(([key, label, value]) => <div key={String(key)}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
        </div>
      </section>

      <section className="revenue-content-section revenue-faq">
        <div className="revenue-section-title"><p>BEFORE YOU ORDER</p><h2>第一次購買也不用擔心</h2></div>
        <div className="revenue-faq-list">
          <details open><summary>這款會不會很酸？</summary><p>精品咖啡的果酸更接近水果或果茶的明亮感，不是尖銳的酸敗味。仍不確定時，可在訂單備註平常喜歡的口感。</p></details>
          <details><summary>咖啡豆可以幫我磨粉嗎？</summary><p>可以。請在訂單備註填寫手沖、咖啡機或其他沖煮方式，我們會在確認訂單時核對研磨需求。</p></details>
          <details><summary>付款與取貨怎麼進行？</summary><p>可選擇 7-ELEVEN 取貨付款，或預約至 KD Coffee 工作室自取。送單後我們會確認庫存與取貨資料。</p></details>
        </div>
      </section>

      {layout.showGallery !== false && gallery.length ? <section className="revenue-content-section revenue-gallery"><div className="revenue-section-title"><p>PRODUCT DETAILS</p><h2>包裝與作品細節</h2></div><div className="revenue-gallery-grid">{gallery.map((item: any) => <figure key={item.key}><img src={item.path} alt={item.alt || `${product.name} ${item.key}`} />{item.caption ? <figcaption>{item.caption}</figcaption> : null}</figure>)}</div></section> : null}

      {layout.showRelatedWorks !== false && related.length ? <section className="revenue-content-section revenue-related"><div className="revenue-section-title"><p>YOU MAY ALSO LIKE</p><h2>也可以比較這三款</h2></div><div className="revenue-related-grid">{related.map((item: any) => { const listAsset = resolveListAsset(item); const price = item.purchase?.length ? Math.min(...item.purchase.map((o: any) => o.price)) : null; return <Link key={item.slug} href={`/works/${item.slug}`} className="revenue-related-card"><div className="related-thumb"><ProductVisualMedia src={listAsset?.path} alt={listAsset?.alt || item.name} className="product-list-image" fallback={<ProductBagFallback product={item} compact />}/></div><div><small>{item.tag || item.artist}</small><h3>{item.name}</h3><p>{item.flavors?.slice(0, 3).join("、")}</p>{price !== null ? <b>NT$ {price.toLocaleString("zh-TW")} 起</b> : null}<span>查看與購買 →</span></div></Link>; })}</div></section> : null}

      {minPrice !== null && product.purchasable !== false && product.status !== "sold_out" ? <MobilePurchaseReturnButton /> : null}
    </main>
  );
}
