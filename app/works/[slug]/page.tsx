import Link from "next/link";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { notFound } from "next/navigation";
import { getLiveWebsiteData, type CoffeeArtwork } from "@/data/websiteData";
import AddToCart from "@/components/commerce/AddToCart";
import CartLink from "@/components/commerce/CartLink";
import CleanRoastingChapter from "@/components/commerce/CleanRoastingChapter";
import MobilePurchaseReturnButton from "@/components/commerce/MobilePurchaseReturnButton";
import ProductPageEntrance from "@/components/commerce/ProductPageEntrance";
import ProductCampaignSection from "@/components/commerce/ProductCampaignSection";
import PurchaseChapterReveal from "@/components/commerce/PurchaseChapterReveal";
import RoastedBeanViewer from "@/components/commerce/RoastedBeanViewer";
import ProductSectionReveals from "@/components/commerce/ProductSectionReveals";
import ProductVisualMedia from "@/components/commerce/ProductVisualMedia";
import CustomProductSectionSlot from "@/components/commerce/CustomProductSectionSlot";
import KdMedia from "@/components/media/KdMedia";
import { getHomepageData, resolveProductCampaigns } from "@/data/homepageData";
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
import {
  DEFAULT_OPTIONAL_SECTION_LAYOUT,
  normalizeProductSectionOrder,
  normalizeProductSectionPlacement,
} from "@/lib/productPageSections";
import {
  getProductAnimationAttributes,
  resolveProductSectionAnimation,
  type ProductPageAnimations,
  type ProductSectionAnimationConfig,
} from "@/lib/productPageAnimations";
import {
  CLEAN_ROASTING_LEGACY_CONFIG,
  normalizeCleanRoastingMedia,
} from "@/lib/cleanRoastingMedia";
import { resolveProductPageContent } from "@/lib/productPageContent";
import { resolveProductCustomSections } from "@/lib/productCustomSectionsValidation";
import { getActiveMembershipRules } from "@/lib/membershipBusinessRules";

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

function RelatedProductsSection({ products, eyebrow, title, description, cardCtaLabel, animation }: { products: CoffeeArtwork[]; eyebrow: string; title: string; description: string; cardCtaLabel: string; animation: ProductSectionAnimationConfig | null }) {
  return (
    <section {...getProductAnimationAttributes(animation)} id="related-products" className="revenue-content-section revenue-related">
      <div className="revenue-section-title" data-section-reveal>
        <p>{eyebrow}</p>
        <h2>{title}</h2>
        {description ? <span>{description}</span> : null}
      </div>
      <div className="revenue-related-grid" data-section-reveal>
        {products.map((item) => {
          const listAsset = resolveListAsset(item);
          const price = item.purchase?.length ? Math.min(...item.purchase.map((option) => option.price)) : null;
          return (
            <Link key={item.slug} href={`/works/${item.slug}`} className="revenue-related-card">
              <div className="related-thumb">
                <ProductVisualMedia
                  src={listAsset?.path}
                  alt={listAsset?.alt || item.name}
                  className="product-list-image"
                  loading="lazy"
                  decoding="async"
                  fallback={<ProductBagFallback product={item} compact />}
                />
              </div>
              <div>
                <small>{item.tag || item.artist}</small>
                <h3>{item.name}</h3>
                <p>{item.flavors?.slice(0, 3).join("、")}</p>
                {price !== null ? <b>NT$ {price.toLocaleString("zh-TW")} 起</b> : null}
                <span>{cardCtaLabel}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
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

export default async function WorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [live, homepageData, membershipRules] = await Promise.all([getLiveWebsiteData(), getHomepageData(), getActiveMembershipRules()]);
  const product: any = live.menu.products.find((item: any) => item.slug === slug);
  if (!product || product.status === "hidden") notFound();
  const pageContent = resolveProductPageContent(product);
  const customSections = resolveProductCustomSections(product.productCustomSections);
  const heroContent = pageContent["product-hero"];
  const purchaseContent = pageContent["select-your-coffee"];
  const flavorContent = pageContent["flavor-notes"];
  const profileContent = pageContent["coffee-profile"];
  const roastingContent = pageContent["clean-roasting"];
  const campaignContent = pageContent.campaigns;
  const relatedContent = pageContent["related-products"];
  const beforeOrderContent = pageContent["before-you-order"];

  const isGiottoPrototype = product.slug === "giotto-awakening";
  const hasCleanRoastingMediaConfig = product.cleanRoastingMedia && typeof product.cleanRoastingMedia === "object";
  const cleanRoastingMedia = normalizeCleanRoastingMedia(
    product.cleanRoastingMedia,
    isGiottoPrototype ? CLEAN_ROASTING_LEGACY_CONFIG : undefined,
  );

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
  const relatedSettings = product.relatedProducts && typeof product.relatedProducts === "object" ? product.relatedProducts : null;
  const productBySlug = new Map(live.menu.products.map((item: any) => [item.slug, item]));
  const seenRelatedSlugs = new Set<string>();
  const related = relatedSettings
    ? (Array.isArray(relatedSettings.productIds) ? relatedSettings.productIds : [])
        .filter((relatedSlug: string) => {
          if (seenRelatedSlugs.has(relatedSlug)) return false;
          seenRelatedSlugs.add(relatedSlug);
          return true;
        })
        .map((relatedSlug: string) => productBySlug.get(relatedSlug))
        .filter((item: any) => item && item.slug !== product.slug && item.status !== "hidden" && item.active !== false)
        .slice(0, 3)
    : live.menu.products.filter((p: any) => p.slug !== product.slug && p.status !== "hidden" && p.inMonthlyMenu).slice(0, 3);
  const showRelated = relatedSettings ? relatedSettings.enabled !== false : layout.showRelatedWorks !== false;
  const productCampaigns = product.campaignDisplay?.enabled === true
    ? resolveProductCampaigns(homepageData, product.campaignDisplay.campaignIds)
    : [];
  const productPageAnimations = product.productPageAnimations as ProductPageAnimations | undefined;
  const sectionAnimation = (sectionKey: Parameters<typeof resolveProductSectionAnimation>[1]) =>
    resolveProductSectionAnimation(productPageAnimations, sectionKey);
  const campaignLayout = DEFAULT_OPTIONAL_SECTION_LAYOUT.campaigns;
  const relatedLayout = DEFAULT_OPTIONAL_SECTION_LAYOUT["related-products"];
  const optionalSections = [
    {
      id: "campaigns",
      placement: normalizeProductSectionPlacement(product.campaignDisplay?.placement, campaignLayout.placement),
      order: normalizeProductSectionOrder(product.campaignDisplay?.order, campaignLayout.order),
      node: productCampaigns.length ? <ProductCampaignSection campaigns={productCampaigns} products={live.menu.products} eyebrow={campaignContent.eyebrow} heading={campaignContent.heading} description={campaignContent.description} animation={sectionAnimation("campaigns")} /> : null,
    },
    {
      id: "related-products",
      placement: normalizeProductSectionPlacement(relatedSettings?.placement, relatedLayout.placement),
      order: normalizeProductSectionOrder(relatedSettings?.order, relatedLayout.order),
      node: showRelated && related.length ? <RelatedProductsSection products={related} eyebrow={relatedContent.eyebrow} title={relatedContent.heading} description={relatedContent.description} cardCtaLabel={relatedContent.cardCtaLabel} animation={sectionAnimation("related-products")} /> : null,
    },
  ] as const;
  const facts = [
    ["origin", "產區", product.origin],
    ["process", "處理法", product.process],
    ["roast", "烘焙度", product.roast],
  ].filter(([key, , value]) => d[key as string] !== false && value && value !== "待確認");
  const minPrice = product.purchase?.length ? Math.min(...product.purchase.map((o: any) => o.price)) : null;
  const useLegacyGiottoFaqBreak = isGiottoPrototype && !pageContent.raw["before-you-order"]?.heading;

  return (
    <main className={`revenue-product-page${isGiottoPrototype ? " giotto-art-direction" : ""}`}>
      <header className="revenue-product-nav">
        <Link href="/works">← 返回本月作品</Link>
        <Link className="brand" href="/"><span>KD</span><b>COFFEE</b></Link>
        <CartLink compact />
      </header>

      <ProductSectionReveals key={product.slug} calibrated={isGiottoPrototype}>
      <ProductPageEntrance>
      <div id="top-purchase" aria-hidden="true" />
      <section {...getProductAnimationAttributes(sectionAnimation("product-hero"))} className={`revenue-hero ${heroVideo || heroPath ? "has-wide-hero" : ""}`} id="product-hero">
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
          <p className="revenue-kicker product-entrance-eyebrow">KD COFFEE · {heroContent.artist}</p>
          <div className="revenue-badges product-entrance-badge">
            {product.tag ? <span>{product.tag}</span> : null}
            {product.stock && product.stock <= 5 ? <span className="stock-alert">少量供應</span> : null}
          </div>
          <h1 className="product-entrance-title">{heroContent.title}</h1>
          <p className="revenue-lead product-entrance-summary">{heroContent.lead}</p>
          <p className="revenue-order-promise product-entrance-summary">第一次購買也安心：選規格、填取貨資料，收到商品再付款。</p>

          <div className="revenue-quickfacts product-entrance-profile">
            {product.origin ? <span><small>產區</small><b>{product.origin}</b></span> : null}
            {product.process ? <span><small>處理法</small><b>{product.process}</b></span> : null}
            {product.roast ? <span><small>烘焙度</small><b>{product.roast}</b></span> : null}
          </div>

          <div className="revenue-fit product-entrance-profile">
            <b>{heroContent.suitabilityHeading}</b>
            {heroContent.suitabilityItems.map((item) => <span key={item.id}>✓ {item.text}</span>)}
          </div>

          {product.flavors?.length ? <div className="revenue-flavors product-entrance-profile">{product.flavors.slice(0, 5).map((f: string) => <span key={f}>{f}</span>)}</div> : null}
          {minPrice !== null && !isGiottoPrototype ? <div className="revenue-price product-entrance-price"><small>售價</small><strong>NT$ {minPrice.toLocaleString("zh-TW")} 起</strong></div> : null}
          </div>

          {isGiottoPrototype ? (
            <PurchaseChapterReveal animation={sectionAnimation("select-your-coffee")}>
              <p className="giotto-purchase-heading">{purchaseContent.eyebrow}</p>
              {purchaseContent.heading ? <h2 className="product-purchase-title">{purchaseContent.heading}</h2> : null}
              {purchaseContent.description ? <p className="product-purchase-description">{purchaseContent.description}</p> : null}
              <AddToCart product={product} showPv={membershipRules.rules.referral.showProductPV} />
            </PurchaseChapterReveal>
          ) : (
            <div {...getProductAnimationAttributes(sectionAnimation("select-your-coffee"))} id="select-your-coffee" className="product-purchase-chapter">
              {pageContent.raw["select-your-coffee"] ? <div className="product-purchase-copy"><p className="giotto-purchase-heading">{purchaseContent.eyebrow}</p>{purchaseContent.heading ? <h2 className="product-purchase-title">{purchaseContent.heading}</h2> : null}{purchaseContent.description ? <span>{purchaseContent.description}</span> : null}</div> : null}
              <AddToCart product={product} showPv={membershipRules.rules.referral.showProductPV} />
            </div>
          )}
        </div>
      </section>
      </ProductPageEntrance>
      <div
        id="purchase-end-sentinel"
        className="purchase-end-sentinel"
        aria-hidden="true"
      />

      <CustomProductSectionSlot placement="after_purchase" sections={customSections} systemSections={optionalSections} />

      <section className="revenue-proof-strip">
        {purchaseContent.trustItems.map((item) => <div key={item.id}><b>{item.title}</b><span>{item.body}</span></div>)}
      </section>

      <section className="revenue-content-section product-story-section">
        <div className={`product-story-grid${artworkCoverPath ? "" : " without-artwork"}`}>
          <div className="product-story-intro revenue-section-title">
            <p data-section-reveal>{heroContent.storyEyebrow}</p>
            <h2 data-section-reveal data-reveal-delay="80">{heroContent.title}</h2>
            <span data-section-reveal data-reveal-delay="160">{heroContent.storyLead}</span>
            {heroContent.storySupportingCopy ? <p className="product-story-supporting-copy" data-section-reveal data-reveal-delay="220">{heroContent.storySupportingCopy}</p> : null}
          </div>
          {artworkCoverPath ? <figure className="product-story-artwork" data-section-reveal data-reveal-delay="180" data-reveal-variant="artwork-cover"><img src={artworkCoverPath} alt={artworkCoverAlt} /></figure> : null}
        </div>
        <div className="product-story-details">
          {flavorContent.flavors.length ? <section {...getProductAnimationAttributes(sectionAnimation("flavor-notes"))} id="flavor-notes" className="flavor-notes" aria-labelledby="flavor-notes-title"><div className="story-detail-heading" data-section-reveal><EditorialIcon name="flavor" /><div><p>{flavorContent.eyebrow}</p><h3 id="flavor-notes-title">{flavorContent.heading}</h3>{flavorContent.description ? <span>{flavorContent.description}</span> : null}</div></div><div className="flavor-notes-list">{flavorContent.flavors.map((flavor: string, index: number) => <span key={flavor} data-section-reveal data-reveal-delay={String(index * 80)}>{flavor}</span>)}</div></section> : null}
          {facts.length ? <section {...getProductAnimationAttributes(sectionAnimation("coffee-profile"))} id="coffee-profile" className="coffee-profile" aria-labelledby="coffee-profile-title"><div className="story-detail-heading" data-section-reveal><div><p>{profileContent.eyebrow}</p><h3 id="coffee-profile-title">{profileContent.heading}</h3>{profileContent.description ? <span>{profileContent.description}</span> : null}</div></div><dl>{facts.map(([key, label, value], index) => <div key={String(key)} data-section-reveal data-reveal-delay={String(index * 80)}><dt><EditorialIcon name={key as "origin" | "process" | "roast"} /><span>{label}</span></dt><dd>{value}</dd></div>)}</dl></section> : null}
          {showRoastedBeanViewer ? <section className="roasted-bean-viewer-entry" data-section-reveal data-reveal-delay="180" aria-label="烘焙豆照片"><RoastedBeanViewer productName={heroContent.title} imageSrc={roastedBeanPhotoPath} imageAlt={roastedBeanPhotoAlt} heading={profileContent.roastedBeanHeading} cta={profileContent.roastedBeanCta} /></section> : null}
        </div>
      </section>

      <CustomProductSectionSlot placement="after_profile" sections={customSections} systemSections={optionalSections} />

      {isGiottoPrototype || hasCleanRoastingMediaConfig ? (
        <CleanRoastingChapter proofs={roastingContent.proofs} eyebrow={roastingContent.eyebrow} heading={roastingContent.heading} description={roastingContent.description} animation={sectionAnimation("clean-roasting")} mediaConfig={cleanRoastingMedia} />
      ) : (
        <section {...getProductAnimationAttributes(sectionAnimation("clean-roasting"))} id="clean-roasting" className="revenue-content-section clean-roasting-section" aria-labelledby="clean-roasting-title">
            <div className="clean-roasting-intro">
              <p data-section-reveal>{roastingContent.eyebrow}</p>
              <h2 id="clean-roasting-title" data-section-reveal data-reveal-delay="80">{roastingContent.heading}</h2>
              {roastingContent.proofs[0] ? <strong data-section-reveal data-reveal-delay="120">{roastingContent.proofs[0].title}</strong> : null}
              {roastingContent.description ? <span data-section-reveal data-reveal-delay="180">{roastingContent.description}</span> : null}
            </div>
            <div className="clean-roasting-proofs">{roastingContent.proofs.map((proof, index) => <article key={proof.id} data-section-reveal data-reveal-delay={String(index * 80)}><EditorialIcon name={proof.icon || "air"} /><div><h3>{proof.title}</h3><p>{proof.body}</p></div></article>)}</div>
        </section>
      )}

      <CustomProductSectionSlot placement="after_clean_roasting" sections={customSections} systemSections={optionalSections} />
      <CustomProductSectionSlot placement="before_before_you_order" sections={customSections} systemSections={optionalSections} />

      <section {...getProductAnimationAttributes(sectionAnimation("before-you-order"))} id="before-you-order" className="revenue-content-section revenue-faq">
        <div className="revenue-section-title" data-section-reveal={isGiottoPrototype ? undefined : "true"}>
          <p data-section-reveal={isGiottoPrototype ? "true" : undefined}>{beforeOrderContent.eyebrow}</p>
          <h2 data-section-reveal={isGiottoPrototype ? "true" : undefined} data-reveal-delay={isGiottoPrototype ? "80" : undefined}>{useLegacyGiottoFaqBreak ? <>第一次選咖啡，<br className="giotto-faq-mobile-break" />我們陪你慢慢選。</> : beforeOrderContent.heading}</h2>
          {beforeOrderContent.description ? <span className={isGiottoPrototype ? "giotto-faq-supporting-copy" : undefined} data-section-reveal={isGiottoPrototype ? "true" : undefined} data-reveal-delay={isGiottoPrototype ? "160" : undefined}>{beforeOrderContent.description}</span> : null}
        </div>
        <div className="revenue-faq-list" data-section-reveal={isGiottoPrototype ? "true" : undefined}>
          {[...beforeOrderContent.lockedFaqs, ...beforeOrderContent.editorialFaqs].map((faq, index) => <details key={faq.id} open={index === 0}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}
        </div>
      </section>

      {layout.showGallery !== false && gallery.length ? <section className="revenue-content-section revenue-gallery"><div className="revenue-section-title"><p>{heroContent.galleryEyebrow}</p><h2>{heroContent.galleryHeading}</h2></div><div className="revenue-gallery-grid">{gallery.map((item: any) => <figure key={item.key}><img src={item.path} alt={item.alt || `${heroContent.title} ${item.key}`} />{item.caption ? <figcaption>{item.caption}</figcaption> : null}</figure>)}</div></section> : null}

      <CustomProductSectionSlot placement="page_bottom" sections={customSections} systemSections={optionalSections} />
      </ProductSectionReveals>

      {minPrice !== null && product.purchasable !== false && product.status !== "sold_out" ? <MobilePurchaseReturnButton /> : null}
    </main>
  );
}
