import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import CmsLink from "@/components/CmsLink";
import HomepageMotion from "@/components/home/HomepageMotion";
import Home004ProductMedia from "@/components/home/Home004ProductMedia";
import KdMedia from "@/components/media/KdMedia";
import type { CmsLinkRegistryInput } from "@/lib/cmsLinks";
import { homepageMotionCssVariables, resolveHomepageMotion } from "@/lib/homepageCms";
import { resolveMobileMediaLayout, resolveSectionPresentation, type PageBuilderMedia, type PageBuilderSection, type PageDraft } from "@/lib/pageBuilder";
import { blockVisualStyleVariables, resolveBlockVisualStyle, resolveHeroPlaybackMode, resolveWebsiteVisualStyle, websiteVisualStyleVariables, type WebsiteVisualStyle } from "@/lib/pageBuilderVisualStyle";
import { resolveListAsset } from "@/lib/productVisualAssets";

type Product = {
  slug: string;
  name: string;
  artist?: string;
  shortCopy?: string;
  subtitle?: string;
  cover?: string;
  poster?: string;
  active?: boolean;
  status?: string;
  stock?: number;
  purchasable?: boolean;
  purchase?: Array<{ price?: number }>;
  assets?: unknown;
  pageLayout?: unknown;
};

function MotionSection({ section, children, className = "" }: { section: PageBuilderSection; children: ReactNode; className?: string }) {
  const motion = resolveHomepageMotion(section.motion, "home002");
  const presentation = resolveSectionPresentation(section);
  const visualStyle = resolveBlockVisualStyle(section.visualStyle);
  return <section className={`page-builder-section page-builder-${section.type} theme-${section.theme} ${className}`.trim()} data-presentation={presentation} data-home-motion={motion.activePreset} data-text-align={visualStyle?.alignment || "inherit"} data-heading-wrap={visualStyle?.headingWrap || "inherit"} style={{...homepageMotionCssVariables(motion),...blockVisualStyleVariables(visualStyle)} as CSSProperties}><div className="page-builder-section-inner">{children}</div></section>;
}

function Copy({ section, hero = false }: { section: PageBuilderSection; hero?: boolean }) {
  const Heading = hero ? "h1" : "h2";
  if (!section.eyebrow.trim() && !section.title.trim() && !section.body.trim()) return null;
  return <div className="page-builder-copy" data-home-motion-part style={{ "--home-motion-index": 0 } as CSSProperties}>{section.eyebrow.trim() ? <p className="page-builder-eyebrow">{section.eyebrow}</p> : null}{section.title.trim() ? <Heading>{section.title}{section.headlineLine2?.trim() ? <><br/><span>{section.headlineLine2}</span></> : null}</Heading> : null}{section.body.trim() ? <div className="page-builder-body">{section.body}</div> : null}</div>;
}

function Ctas({ section, registry }: { section: PageBuilderSection; registry: CmsLinkRegistryInput }) {
  const ctas = section.ctas.filter((cta) => cta.enabled !== false && cta.label.trim());
  return ctas.length ? <div className="page-builder-ctas" data-count={ctas.length}>{ctas.map((cta) => <CmsLink key={cta.id} value={cta.link} registry={registry} className={`page-builder-button is-${cta.stylePreset}`}>{cta.label}</CmsLink>)}</div> : null;
}

function orientation(item: PageBuilderMedia) {
  const { width = 0, height = 0 } = item.media;
  return height > width * 1.12 ? "portrait" : width > height * 1.25 ? "landscape" : "standard";
}

function MediaFigure({ item, section, index, eager = false, backgroundVideo = false, showPlayAffordance = false }: { item: PageBuilderMedia; section: PageBuilderSection; index: number; eager?: boolean; backgroundVideo?: boolean; showPlayAffordance?: boolean }) {
  return <figure className="pb-media" data-orientation={orientation(item)} data-kind={item.media.type} data-playback={backgroundVideo ? "autoplay-loop" : showPlayAffordance ? "click-to-play" : undefined} data-home-motion-item style={{ "--home-motion-index": index + 1 } as CSSProperties}><div className="pb-media-frame"><KdMedia key={backgroundVideo?"background-playback":"visitor-playback"} media={item.media} alt={item.alt || item.title || section.title} eager={eager} backgroundVideo={backgroundVideo} showPlayAffordance={showPlayAffordance} playLabel="播放影片"/></div>{item.title?.trim() ? <figcaption>{item.title}</figcaption> : null}</figure>;
}

function MediaCollection({ section, eager = false, className = "" }: { section: PageBuilderSection; eager?: boolean; className?: string }) {
  const items = section.media.filter((item) => item.enabled !== false);
  return items.length ? <div className={`pb-media-collection ${className}`.trim()} data-count={items.length} tabIndex={items.length > 1 ? 0 : undefined}>{items.map((item,index) => <MediaFigure key={item.id} item={item} section={section} index={index} eager={eager && index === 0}/>)}</div> : null;
}

function Hero({ section, registry, eager }: { section: PageBuilderSection; registry: CmsLinkRegistryInput; eager: boolean }) {
  const media = section.media.filter((item) => item.enabled !== false)[0];
  const playbackMode = resolveHeroPlaybackMode(section.playbackMode);
  const hasCopy = Boolean(section.eyebrow.trim() || section.title.trim() || section.body.trim());
  if (!media && !hasCopy && !section.ctas.some((cta) => cta.enabled !== false)) return null;
  const backgroundVideo = media?.media.type === "video" && playbackMode === "autoplay-loop";
  const showPlayAffordance = media?.media.type === "video" && playbackMode === "click-to-play";
  return <MotionSection section={section} className="pb-hero"><div className="pb-hero-stage" data-has-media={Boolean(media)} data-has-copy={hasCopy}>{media ? <div className="pb-hero-visual"><MediaFigure item={media} section={section} index={0} eager={eager} backgroundVideo={backgroundVideo} showPlayAffordance={showPlayAffordance}/></div> : null}<div className="pb-hero-shade" aria-hidden="true"/><div className="pb-hero-content"><Copy section={section} hero/><Ctas section={section} registry={registry}/></div></div></MotionSection>;
}

function Story({ section, registry }: { section: PageBuilderSection; registry: CmsLinkRegistryInput }) {
  const hasMedia = section.media.some((item) => item.enabled !== false);
  const hasCopy = Boolean(section.eyebrow.trim() || section.title.trim() || section.body.trim());
  if (!hasMedia && !hasCopy) return null;
  return <MotionSection section={section} className="pb-story-section"><div className="pb-story" data-has-media={hasMedia} data-has-copy={hasCopy} data-mobile-layout={resolveMobileMediaLayout(section)}><div className="pb-story-copy"><Copy section={section}/><Ctas section={section} registry={registry}/></div><MediaCollection section={section} className="pb-story-media"/></div></MotionSection>;
}

function Gallery({ section }: { section: PageBuilderSection }) {
  const items = section.media.filter((item) => item.enabled !== false);
  const hasCopy = Boolean(section.eyebrow.trim() || section.title.trim() || section.body.trim());
  if (!items.length && !hasCopy) return null;
  return <MotionSection section={section} className="pb-gallery-section"><div className="pb-section-intro"><Copy section={section}/></div><MediaCollection section={section} className="pb-gallery"/></MotionSection>;
}

function Features({ section, registry }: { section: PageBuilderSection; registry: CmsLinkRegistryInput }) {
  const items = section.items.filter((item) => item.enabled !== false);
  const hasCopy = Boolean(section.eyebrow.trim() || section.title.trim() || section.body.trim());
  if (!items.length && !hasCopy) return null;
  return <MotionSection section={section} className="pb-features-section"><div className="pb-section-intro"><Copy section={section}/></div>{items.length ? <div className="pb-feature-list" data-count={items.length}>{items.map((item,index) => <article key={item.id} data-home-motion-item style={{ "--home-motion-index": index + 1 } as CSSProperties}>{item.media ? <div className="pb-feature-media"><KdMedia media={item.media} alt={item.title}/></div> : null}<span>{String(index + 1).padStart(2,"0")}</span><div><h3>{item.title}</h3>{item.body.trim() ? <p>{item.body}</p> : null}</div></article>)}</div> : null}<Ctas section={section} registry={registry}/></MotionSection>;
}

function Products({ section, products }: { section: PageBuilderSection; products: Product[] }) {
  const selected = section.products.filter((item) => item.enabled !== false).map((item) => products.find((product) => product.slug === item.productSlug)).filter((item): item is Product => Boolean(item));
  const hasCopy = Boolean(section.eyebrow.trim() || section.title.trim() || section.body.trim());
  if (!selected.length && !hasCopy) return null;
  return <MotionSection section={section} className="pb-products-section"><div className="pb-section-intro"><Copy section={section}/></div>{selected.length ? <div className="pb-product-list" data-count={selected.length}>{selected.map((product,index) => { const asset = resolveListAsset(product); const prices = (product.purchase || []).map((option) => Number(option.price)).filter((price) => Number.isFinite(price) && price > 0); const soldOut = product.status === "sold-out" || product.stock === 0 || product.purchasable === false; return <Link href={`/works/${product.slug}`} key={product.slug} data-sold-out={soldOut||undefined} data-home-motion-item style={{ "--home-motion-index": index + 1 } as CSSProperties}><div className="pb-product-media"><Home004ProductMedia src={asset?.path || product.cover || product.poster || ""} alt={asset?.alt || product.name}/>{soldOut ? <span className="pb-product-state">暫時售完</span> : null}</div><div className="pb-product-copy"><small>{product.artist || "KD COFFEE ARTWORK"}</small><h3>{product.name}</h3>{product.shortCopy || product.subtitle ? <p>{product.shortCopy || product.subtitle}</p> : null}<div>{prices.length ? <b>NT$ {Math.min(...prices).toLocaleString("zh-TW")} 起</b> : <b>查看作品</b>}<span>探索作品 →</span></div></div></Link>; })}</div> : null}</MotionSection>;
}

function Closing({ section, registry }: { section: PageBuilderSection; registry: CmsLinkRegistryInput }) {
  const hasCopy = Boolean(section.eyebrow.trim() || section.title.trim() || section.body.trim());
  const hasCta = section.ctas.some((cta) => cta.enabled !== false && cta.label.trim());
  if (!hasCopy && !hasCta) return null;
  return <MotionSection section={section} className="pb-closing"><div className="pb-closing-content"><Copy section={section}/><Ctas section={section} registry={registry}/></div></MotionSection>;
}

function EditorialText({ section, registry }: { section: PageBuilderSection; registry: CmsLinkRegistryInput }) {
  const hasCopy = Boolean(section.eyebrow.trim() || section.title.trim() || section.body.trim());
  if (!hasCopy) return null;
  return <MotionSection section={section} className="pb-editorial-text"><Copy section={section}/><Ctas section={section} registry={registry}/></MotionSection>;
}

export default function PageBuilderRenderer({ page, products, registry, visualStyle }: { page: PageDraft; products: Product[]; registry: CmsLinkRegistryInput; visualStyle?: WebsiteVisualStyle; preview?: boolean }) {
  const resolvedStyle=resolveWebsiteVisualStyle(visualStyle);
  return <main className="page-builder-page page-builder-v2" data-page-title={page.title} data-heading-wrap={resolvedStyle.headingWrap} data-secondary-heading-wrap={resolvedStyle.secondaryHeadingWrap} style={websiteVisualStyleVariables(resolvedStyle)}><HomepageMotion/>{page.sections.filter((section) => section.enabled !== false).map((section,sectionIndex) => {
    if (section.type === "hero") return <Hero key={section.id} section={section} registry={registry} eager={sectionIndex === 0}/>;
    if (section.type === "mediaText") return <Story key={section.id} section={section} registry={registry}/>;
    if (section.type === "gallery") return <Gallery key={section.id} section={section}/>;
    if (section.type === "features") return <Features key={section.id} section={section} registry={registry}/>;
    if (section.type === "products") return <Products key={section.id} section={section} products={products}/>;
    if (section.type === "cta") return <Closing key={section.id} section={section} registry={registry}/>;
    if (section.type === "text") return <EditorialText key={section.id} section={section} registry={registry}/>;
    return null;
  })}</main>;
}
