import Link from "next/link";
import { notFound } from "next/navigation";
import { getLiveWebsiteData } from "@/data/websiteData";
import AddToCart from "@/components/commerce/AddToCart";
import CartLink from "@/components/commerce/CartLink";
import MobilePurchaseReturnButton from "@/components/commerce/MobilePurchaseReturnButton";
import ProductPageEntrance from "@/components/commerce/ProductPageEntrance";
import RoastedBeanViewer from "@/components/commerce/RoastedBeanViewer";
import ProductSectionReveals from "@/components/commerce/ProductSectionReveals";
import ProductVisualMedia from "@/components/commerce/ProductVisualMedia";
import KdMedia from "@/components/media/KdMedia";
import {
  getProductMediaAsset,
  resolveGalleryAssets,
  resolveHeroAsset,
  resolveListAsset,
  resolveProductAsset,
  resolveProductAssetPath,
  resolveStaticProductAssetImage,
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

type EditorialIconName = "flavor" | "origin" | "process" | "roast" | "air" | "heat" | "cupping";

function EditorialIcon({ name }: { name: EditorialIconName }) {
  const paths: Record<EditorialIconName, React.ReactNode> = {
    flavor: <><circle cx="12" cy="12" r="2.5" /><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2.1 2.1M15.9 15.9 18 18M18 6l-2.1 2.1M8.1 15.9 6 18" /></>,
    origin: <><path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z" /><circle cx="12" cy="10" r="2" /></>,
    process: <><path d="M4 8.5c2.3-2 4.8-2 7 0s4.7 2 9 0M4 15.5c2.3-2 4.8-2 7 0s4.7 2 9 0" /><path d="M7 4.5v15M17 4.5v15" /></>,
    roast: <><path d="M7 4.5c4.8 0 8 3.4 8 7.5s-3.2 7.5-8 7.5c-1.3-2.2-1.3-4.8 0-7.5-1.3-2.7-1.3-5.3 0-7.5Z" /><path d="M7 12h8" /></>,
    air: <><path d="M4 9c2.5-2.6 5.3-2.6 8.3 0 2.4 2 4.9 2 7.7 0" /><path d="M4 15c2.5-2.6 5.3-2.6 8.3 0 2.4 2 4.9 2 7.7 0" /></>,
    heat: <><path d="M12 4v10" /><path d="M8.5 8.5a5 5 0 1 0 7 0" /><circle cx="12" cy="17" r="1" /></>,
    cupping: <><path d="M5 8h11v4.5a5.5 5.5 0 0 1-11 0V8Z" /><path d="M16 9.5h1.2a2.3 2.3 0 0 1 0 4.6H16M4 20h14" /></>,
  };

  return <svg className="editorial-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const CLEAN_ROASTING_PROOFS = [
  { icon: "air" as const, title: "流床式熱風烘焙", text: "讓咖啡豆均勻翻動，呈現乾淨清楚的風味。" },
  { icon: "heat" as const, title: "紅外線熱顯像", text: "精準控溫。" },
  { icon: "cupping" as const, title: "杯測確認", text: "透過實際品飲確認香氣、甜感與整體平衡。" },
];

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
  const artworkCoverPath = resolveStaticProductAssetImage(product, "artworkCover");
  const artworkCoverAlt = product.assets?.artworkCover?.alt || `${product.name} Artwork Cover`;
  const roastedBeanPhotoPath = resolveStaticProductAssetImage(product, "roastedBeanPhoto");
  const showRoastedBeanViewer = product.showRoastedBeanPhoto === true && Boolean(roastedBeanPhotoPath);
  const roastedBeanPhotoAlt = product.assets?.roastedBeanPhoto?.alt || `${product.name} 實際烘焙咖啡豆`;
  const gallery = resolveGalleryAssets(product);
  const related = live.menu.products.filter((p: any) => p.slug !== product.slug && p.status !== "hidden" && p.inMonthlyMenu).slice(0, 3);
  const facts = [
    ["origin", "產區", product.origin],
    ["process", "處理法", product.process],
    ["roast", "烘焙度", product.roast],
  ].filter(([key, , value]) => d[key as string] !== false && value && value !== "待確認");
  const storyLead = product.mood || product.shortCopy || product.subtitle || "一杯乾淨、清楚，而且容易親近的精品咖啡。";
  const storySupportingCopy = product.shortCopy && product.shortCopy !== storyLead ? product.shortCopy : "";
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

      <ProductPageEntrance enabled={isGiottoPrototype}>
      <section className={`revenue-hero ${heroVideo || heroPath ? "has-wide-hero" : ""}`} id="top-purchase">
        <div className="revenue-media">
          <div className="product-hero-sticky">
            <div className={`revenue-image-stage ${heroVideo || heroPath ? "wide-hero-stage" : "product-stage"} page-entrance-hero`}>
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
                {!isGiottoPrototype ? <><div className="wide-hero-shade" /><div className="wide-hero-copy"><small>KD COFFEE ARTWORK</small><strong>{product.name}</strong><span>{product.flavors?.slice(0, 3).join("・")}</span></div></> : null}
              </>
            ) : heroPath ? (
              <>
                <img className="wide-hero-image" src={heroPath} alt={presentationHeroAsset?.alt || `${product.name} 商品形象主視覺`} />
                {!isGiottoPrototype ? <><div className="wide-hero-shade" /><div className="wide-hero-copy"><small>KD COFFEE ARTWORK</small><strong>{product.name}</strong><span>{product.flavors?.slice(0, 3).join("・")}</span></div></> : null}
              </>
            ) : productPath ? (
              <img className="product-photo" src={productPath} alt={productAsset?.alt || `${product.name} 商品照片`} />
            ) : (
              <ProductBagFallback product={product} />
            )}
              {isGiottoPrototype ? <div className="giotto-hero-light-veil" aria-hidden="true" /> : null}
            </div>
          </div>
          {!isGiottoPrototype ? <div className="revenue-media-caption"><span>{heroVideo || heroPath ? "商品情境主視覺" : "實際商品包裝"}</span><b>實際出貨內容以所選規格為準</b></div> : null}
        </div>

        <div className="revenue-buybox product-hero-commerce">
          <div className="product-hero-identity">
          <p className="revenue-kicker product-entrance-eyebrow">KD COFFEE · {product.artist}</p>
          <div className="revenue-badges product-entrance-badge">
            {product.tag ? <span>{product.tag}</span> : null}
            {product.stock && product.stock <= 5 ? <span className="stock-alert">少量供應</span> : null}
          </div>
          <h1 className="product-entrance-title">{product.name}</h1>
          <p className="revenue-lead product-entrance-summary">{product.shortCopy || product.subtitle}</p>
          <p className="revenue-order-promise product-entrance-summary">第一次購買也安心：選規格、填取貨資料，收到商品再付款。</p>

          <div className="revenue-quickfacts product-entrance-profile">
            {product.origin ? <span><small>產區</small><b>{product.origin}</b></span> : null}
            {product.process ? <span><small>處理法</small><b>{product.process}</b></span> : null}
            {product.roast ? <span><small>烘焙度</small><b>{product.roast}</b></span> : null}
          </div>

          <div className="revenue-fit product-entrance-profile">
            <b>適合這樣的你</b>
            <span>✓ {suitable}</span>
            <span>✓ 想喝乾淨、清楚、不焦苦的咖啡</span>
          </div>

          {product.flavors?.length ? <div className="revenue-flavors product-entrance-profile">{product.flavors.slice(0, 5).map((f: string) => <span key={f}>{f}</span>)}</div> : null}
          {minPrice !== null && !isGiottoPrototype ? <div className="revenue-price product-entrance-price"><small>售價</small><strong>NT$ {minPrice.toLocaleString("zh-TW")} 起</strong></div> : null}
          </div>

          <div className="product-purchase-chapter">
          {isGiottoPrototype ? <p className="giotto-purchase-heading">SELECT YOUR COFFEE</p> : null}
          <AddToCart product={product} />
          </div>
        </div>
      </section>
      </ProductPageEntrance>
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

      <ProductSectionReveals calibrated={isGiottoPrototype}>
      <section className="revenue-content-section product-story-section">
        <div className={`product-story-grid${artworkCoverPath ? "" : " without-artwork"}`}>
          <div className="product-story-intro revenue-section-title">
            <p data-section-reveal>THE ARTWORK</p>
            <h2 data-section-reveal data-reveal-delay="80">{product.name}</h2>
            <span data-section-reveal data-reveal-delay="160">{storyLead}</span>
            {storySupportingCopy ? <p className="product-story-supporting-copy" data-section-reveal data-reveal-delay="220">{storySupportingCopy}</p> : null}
          </div>
          {artworkCoverPath ? <figure className="product-story-artwork" data-section-reveal data-reveal-delay="180" data-reveal-variant="artwork-cover"><img src={artworkCoverPath} alt={artworkCoverAlt} /></figure> : null}
        </div>
        <div className="product-story-details">
          {product.flavors?.length ? <section className="flavor-notes" aria-labelledby="flavor-notes-title"><div className="story-detail-heading" data-section-reveal><EditorialIcon name="flavor" /><div><p>FLAVOR NOTES</p><h3 id="flavor-notes-title">風味筆記</h3></div></div><div className="flavor-notes-list">{product.flavors.map((flavor: string, index: number) => <span key={flavor} data-section-reveal data-reveal-delay={String(index * 80)}>{flavor}</span>)}</div></section> : null}
          {facts.length ? <section className="coffee-profile" aria-labelledby="coffee-profile-title"><div className="story-detail-heading" data-section-reveal><div><p>COFFEE PROFILE</p><h3 id="coffee-profile-title">咖啡資料</h3></div></div><dl>{facts.map(([key, label, value], index) => <div key={String(key)} data-section-reveal data-reveal-delay={String(index * 80)}><dt><EditorialIcon name={key as "origin" | "process" | "roast"} /><span>{label}</span></dt><dd>{value}</dd></div>)}</dl></section> : null}
          {showRoastedBeanViewer ? <section className="roasted-bean-viewer-entry" data-section-reveal data-reveal-delay="180" aria-label="烘焙豆照片"><RoastedBeanViewer productName={product.name} imageSrc={roastedBeanPhotoPath} imageAlt={roastedBeanPhotoAlt} /></section> : null}
        </div>
      </section>

      <section className="revenue-content-section clean-roasting-section" aria-labelledby="clean-roasting-title">
        <div className="clean-roasting-intro">
          <p data-section-reveal>CLEAN ROASTING</p>
          <h2 id="clean-roasting-title" data-section-reveal data-reveal-delay="80">乾淨的烘焙</h2>
          <strong data-section-reveal data-reveal-delay="120">流床式熱風烘焙</strong>
          <span data-section-reveal data-reveal-delay="180">讓咖啡豆均勻翻動，呈現乾淨清楚的風味。</span>
        </div>
        <div className="clean-roasting-proofs">{CLEAN_ROASTING_PROOFS.map((proof, index) => <article key={proof.title} data-section-reveal data-reveal-delay={String(isGiottoPrototype ? 220 + (index * 110) : index * 80)}><EditorialIcon name={proof.icon} /><div><h3>{proof.title}</h3><p>{proof.text}</p></div></article>)}</div>
      </section>

      <section className="revenue-content-section revenue-faq">
        <div className="revenue-section-title" data-section-reveal={isGiottoPrototype ? undefined : "true"}>
          <p data-section-reveal={isGiottoPrototype ? "true" : undefined}>BEFORE YOU ORDER</p>
          <h2 data-section-reveal={isGiottoPrototype ? "true" : undefined} data-reveal-delay={isGiottoPrototype ? "80" : undefined}>{isGiottoPrototype ? <>第一次選咖啡，<br className="giotto-faq-mobile-break" />我們陪你慢慢選。</> : "第一次購買也不用擔心"}</h2>
          {isGiottoPrototype ? <span className="giotto-faq-supporting-copy" data-section-reveal="true" data-reveal-delay="160">不用先懂產區、處理法或烘焙度，從你喜歡的味道開始就好。</span> : null}
        </div>
        <div className="revenue-faq-list" data-section-reveal={isGiottoPrototype ? "true" : undefined}>
          <details open><summary>這款會不會很酸？</summary><p>精品咖啡的果酸更接近水果或果茶的明亮感，不是尖銳的酸敗味。仍不確定時，可在訂單備註平常喜歡的口感。</p></details>
          <details><summary>咖啡豆可以幫我磨粉嗎？</summary><p>可以。請在訂單備註填寫手沖、咖啡機或其他沖煮方式，我們會在確認訂單時核對研磨需求。</p></details>
          <details><summary>付款與取貨怎麼進行？</summary><p>可選擇 7-ELEVEN 取貨付款，或預約至 KD Coffee 工作室自取。送單後我們會確認庫存與取貨資料。</p></details>
        </div>
      </section>

      {layout.showGallery !== false && gallery.length ? <section className="revenue-content-section revenue-gallery"><div className="revenue-section-title"><p>PRODUCT DETAILS</p><h2>包裝與作品細節</h2></div><div className="revenue-gallery-grid">{gallery.map((item: any) => <figure key={item.key}><img src={item.path} alt={item.alt || `${product.name} ${item.key}`} />{item.caption ? <figcaption>{item.caption}</figcaption> : null}</figure>)}</div></section> : null}

      {layout.showRelatedWorks !== false && related.length ? <section className="revenue-content-section revenue-related"><div className="revenue-section-title" data-section-reveal><p>YOU MAY ALSO LIKE</p><h2>也可以比較這三款</h2></div><div className="revenue-related-grid" data-section-reveal>{related.map((item: any) => { const listAsset = resolveListAsset(item); const price = item.purchase?.length ? Math.min(...item.purchase.map((o: any) => o.price)) : null; return <Link key={item.slug} href={`/works/${item.slug}`} className="revenue-related-card"><div className="related-thumb"><ProductVisualMedia src={listAsset?.path} alt={listAsset?.alt || item.name} className="product-list-image" loading="lazy" decoding="async" fallback={<ProductBagFallback product={item} compact />}/></div><div><small>{item.tag || item.artist}</small><h3>{item.name}</h3><p>{item.flavors?.slice(0, 3).join("、")}</p>{price !== null ? <b>NT$ {price.toLocaleString("zh-TW")} 起</b> : null}<span>查看與購買 →</span></div></Link>; })}</div></section> : null}
      </ProductSectionReveals>

      {minPrice !== null && product.purchasable !== false && product.status !== "sold_out" ? <MobilePurchaseReturnButton /> : null}
    </main>
  );
}
