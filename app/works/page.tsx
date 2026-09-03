import Link from "next/link";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import CmsLink from "@/components/CmsLink";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ProductVisualMedia from "@/components/commerce/ProductVisualMedia";
import WorksHeroMedia from "@/components/works/WorksHeroMedia";
import WorksMotionRuntime from "@/components/works/WorksMotionRuntime";
import { getLiveWebsiteData, type CoffeeArtwork } from "@/data/websiteData";
import { publishedPageRegistry } from "@/lib/pageBuilder";
import { readPageStore } from "@/lib/pageBuilderStore";
import { resolveListAsset } from "@/lib/productVisualAssets";
import { resolveWorksProductListing } from "@/lib/productListing";
import { DEFAULT_WORKS_PAGE_CMS_CONFIG, resolveWorksPageCms, resolveWorksPublicColorBindings, resolveWorksPublicMotionBindings } from "@/lib/worksPageCms";

export const dynamic="force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [live, pageStore] = await Promise.all([getLiveWebsiteData(), readPageStore()]);
  const works = resolveWorksPageCms(pageStore.systemPages?.works, { monthLabel: live.menu.monthLabel, intro: live.menu.intro });
  const seoTitle = works.seo.title.trim() || DEFAULT_WORKS_PAGE_CMS_CONFIG.seo!.title!;
  const seoDescription = works.seo.description.trim() || DEFAULT_WORKS_PAGE_CMS_CONFIG.seo!.description!;
  const image = works.seo.shareImage;
  const images = image ? [{ url: image.media.url, alt: image.alt || seoTitle }] : undefined;
  return {
    title: { absolute: seoTitle },
    description: seoDescription,
    alternates: { canonical: "/works" },
    openGraph: {
      title: seoTitle,
      description: seoDescription,
      url: "/works",
      type: "website",
      images,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: seoTitle,
      description: seoDescription,
      images: image ? [image.media.url] : undefined,
    },
  };
}

export default async function WorksPage(){
  const [live,pageStore]=await Promise.all([getLiveWebsiteData(),readPageStore()]);
  const products=resolveWorksProductListing(live.menu.products);
  const works=resolveWorksPageCms(pageStore.systemPages?.works,{monthLabel:live.menu.monthLabel,intro:live.menu.intro});
  const presentation=works.catalog.presentation;
  const colorsEnabled=pageStore.systemPages?.works?.colors!==undefined;
  const colorBindings=colorsEnabled?resolveWorksPublicColorBindings(works.colors):undefined;
  const motionEnabled=pageStore.systemPages?.works?.motion!==undefined;
  const motionBindings=motionEnabled?resolveWorksPublicMotionBindings(works.motion):undefined;
  const motionPending=(value:typeof works.motion.hero)=>value.enabled&&value.preset!=="none";
  const ctaRegistry={products:products.map((product:CoffeeArtwork)=>({slug:product.slug,name:product.name,active:product.active,status:product.status})),pages:publishedPageRegistry(pageStore)};
  return <main className="works-page" data-works-colors={colorsEnabled?"enabled":undefined} data-works-motion-root style={colorBindings?.root as CSSProperties}><WorksMotionRuntime motion={works.motion}/><Header/>
    {works.hero.enabled?<section className="works-hero sales-catalog-hero" style={colorBindings?.hero}><WorksHeroMedia desktop={works.hero.desktopMedia} mobile={works.hero.mobileMedia} overlay={works.hero.overlayPreset} motionPending={motionPending(works.motion.heroMedia)} motionClassName={motionBindings?.heroMedia.className} motionStyle={motionBindings?.heroMedia.style as CSSProperties}/><p data-works-motion-target="hero" data-works-motion-state={motionPending(works.motion.hero)?"pre-reveal":undefined} className={`eyebrow ${motionBindings?.hero.className || ""}`} style={mergeStyles(colorBindings?.eyebrow,motionBindings?.hero.style)}>{works.hero.eyebrow}</p><h1 data-works-motion-target="hero" data-works-motion-state={motionPending(works.motion.hero)?"pre-reveal":undefined} className={motionBindings?.hero.className} style={mergeStyles(colorBindings?.heroHeading,motionBindings?.hero.style)}>{works.hero.headlineLines[0]}<br/>{works.hero.headlineLines[1]}</h1><p data-works-motion-target="hero" data-works-motion-state={motionPending(works.motion.hero)?"pre-reveal":undefined} className={motionBindings?.hero.className} style={mergeStyles(colorBindings?.heroDescription,motionBindings?.hero.style)}>{works.hero.description}</p>{works.hero.primaryCta.enabled||works.hero.secondaryCta.enabled?<div data-works-motion-target="hero" data-works-motion-state={motionPending(works.motion.hero)?"pre-reveal":undefined} className={`catalog-jump-links ${motionBindings?.hero.className || ""}`} style={motionBindings?.hero.style as CSSProperties}>{works.hero.primaryCta.enabled?<CmsLink value={works.hero.primaryCta.link} registry={ctaRegistry} style={colorBindings?.primaryCta}>{works.hero.primaryCta.label}</CmsLink>:null}{works.hero.secondaryCta.enabled?<CmsLink value={works.hero.secondaryCta.link} registry={ctaRegistry}>{works.hero.secondaryCta.label}</CmsLink>:null}</div>:null}</section>:null}
    <section className="works-catalog section-light" style={colorBindings?.catalog}>{works.catalog.introEnabled?<div data-works-motion-target="catalogIntro" data-works-motion-state={motionPending(works.motion.catalogIntro)?"pre-reveal":undefined} className={`works-catalog-head ${motionBindings?.catalogIntro.className || ""}`} style={mergeStyles(colorBindings?.catalogHead,motionBindings?.catalogIntro.style)}><span>{works.catalog.countPrefix} {products.length} {works.catalog.countSuffix}</span><p style={colorBindings?.cardText}>{works.catalog.helperText}</p></div>:null}
      <div id="catalog" className="works-grid sales-catalog-grid conversion-catalog-grid">{products.map((product:CoffeeArtwork,index:number)=>{
        const d=product.displayFields||{};
        const facts=[d.origin!==false?product.origin:null,d.process!==false?product.process:null,d.roast!==false?product.roast:null].filter(Boolean);
        const minPrice=product.purchase?.length?Math.min(...product.purchase.map((option)=>option.price)):null;
        const soldOut=product.status==='sold_out'||product.purchasable===false;
        const listAsset=resolveListAsset(product);
        return <article data-works-motion-target="productGrid" data-works-motion-state={motionPending(works.motion.productGrid)?"pre-reveal":undefined} className={`catalog-card sales-catalog-card conversion-catalog-card works-card-preset-${presentation.cardPreset} ${motionBindings?.productGrid.className || ""} ${motionBindings?.cardHover.className || ""} ${soldOut?'is-sold-out':''}`} key={product.slug} style={mergeStyles(colorBindings?.card,motionBindings?.productGrid.cardStyle(index),motionBindings?.cardHover.style)}>
          <Link className={`catalog-cover visual-${product.visualTone}`} href={`/works/${product.slug}`}><ProductVisualMedia src={listAsset?.path} alt={listAsset?.alt||`${product.name} 主視覺`} className="product-list-image"/>{presentation.showIndex?<span className="cover-index">{String(index+1).padStart(2,'0')}</span>:null}{presentation.showArtist?<span className="cover-artist">{product.artist}</span>:null}<div className="cover-art" aria-hidden="true"><i/><b/><em/></div>{presentation.showTag&&product.tag?<span className="cover-tag">{product.tag}</span>:null}{presentation.showCommerceSummary&&soldOut?<span className="sold-out-overlay">暫時售完</span>:null}</Link>
          <div className="catalog-copy"><div><h2>{product.name}</h2>{d.shortCopy!==false?<p style={colorBindings?.cardText}>{product.shortCopy || product.subtitle}</p>:null}{presentation.showFlavors&&product.flavors?.length?<div className="catalog-flavors">{product.flavors.slice(0,4).map((flavor:string)=><span key={flavor} style={colorBindings?.border}>{flavor}</span>)}</div>:null}{presentation.showFacts&&facts.length?<small style={colorBindings?.cardText}>{facts.join(' · ')}</small>:null}</div><div className={`catalog-commerce conversion-card-commerce ${presentation.showCommerceSummary?'':'is-action-only'}`} style={colorBindings?.border}>{presentation.showCommerceSummary?<p><span style={colorBindings?.cardText}>{soldOut ? "供應狀態" : "售價"}</span><strong>{soldOut ? "暫時售完" : minPrice!==null ? `NT$ ${minPrice.toLocaleString('zh-TW')} 起` : "歡迎詢問"}</strong></p>:null}<Link href={`/works/${product.slug}`} style={colorBindings?.cardCta}>查看作品 <i>→</i></Link></div></div>
        </article>})}</div>
      {!products.length&&works.catalog.emptyStateText?<p className="works-catalog-empty" style={colorBindings?.emptyState}>{works.catalog.emptyStateText}</p>:null}
    </section><Footer/></main>
}

function mergeStyles(...styles: Array<Record<string, string> | undefined>) {
  const values=styles.filter((style): style is Record<string, string> => Boolean(style));
  return values.length ? Object.assign({},...values) as CSSProperties : undefined;
}
