import { StudioText } from "@/components/store/StudioResponsiveContent";
import { studioPresentationProps } from "@/lib/storeContentPresentation";
import studioStyles from "@/components/store/StoreContentPresentation.module.css";
import { cloneElement, type CSSProperties, type ReactElement } from "react";
import StoreProductCard from "@/components/store/StoreProductCard";
import type { GiftCatalog } from "@/lib/giftPresentation";
import { DEFAULT_GIFT_LANDING, DEFAULT_GIFT_CUSTOM_BODY, giftTargetHref, giftContactHref, type GiftLandingDocument, type GiftSectionId } from "@/lib/giftCms";
import styles from "./GiftExperience.module.css";

const pointNumber = new Intl.NumberFormat("zh-TW", { maximumSignificantDigits: 21 });
export default function GiftExperience({ model, cms = DEFAULT_GIFT_LANDING }: { model: GiftCatalog; cms?: GiftLandingDocument }) {
  const presentation=(id:GiftSectionId)=>cms.sections.find(s=>s.id===id)?.presentation;
  const slugs = model.groups.flatMap(g => g.gifts.map(gift => gift.product.slug));
  const heroImage = cms.hero.image ?? (model.hero?.type === "image" ? model.hero : undefined);
  const sections: Record<GiftSectionId, ReactElement<{ className: string; style?: CSSProperties }>> = {
    hero: <header className={styles.hero}>
      <div className={styles.heroVisual}>
        {heroImage ? <img src={heroImage.url} alt={cms.hero.alt || heroImage.alt || "KD Coffee 咖啡禮盒"} fetchPriority="high" decoding="async" /> : <div className={styles.heroPlaceholder} aria-hidden="true" />}
      </div>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}><StudioText value={cms.hero.eyebrow} presentation={presentation("hero")} field="eyebrow"/></p>
        <h1><StudioText value={cms.hero.title} presentation={presentation("hero")} field="heading"/></h1>
        <p><StudioText value={cms.hero.description} presentation={presentation("hero")} field="body"/></p>
        <a {...(cms.sections.find(s=>s.id==="hero")?.presentation?{"data-studio-cta":true}:{})} className={styles.primary} href={giftTargetHref(cms.hero.target, slugs)}><StudioText value={cms.hero.ctaLabel} presentation={presentation("hero")} field="ctaLabel"/> <span aria-hidden="true">↓</span></a>
      </div>
    </header>,
    categories: <section id="gift-categories" className={styles.selector} aria-labelledby="gift-category-heading">
      <h2 id="gift-category-heading"><StudioText value={cms.categories.heading} presentation={presentation("categories")} field="heading"/></h2>
      <nav className={styles.categories} aria-label="依禮盒類型挑選">
        {model.groups.map(group => <a key={group.slug} href={group.slug === "custom-gift" ? "#custom-gifting" : "#" + group.slug}>{cms.categories.labels[group.slug]}</a>)}
      </nav>
    </section>,
    curated: <section id="curated-gifts" className={styles.section} aria-labelledby="curated-heading">
      <h2 id="curated-heading"><StudioText value={cms.curated.heading} presentation={presentation("curated")} field="heading"/></h2>
      {model.total === 0 && <div className={styles.empty}><p>{cms.curated.emptyTitle}</p><p>{cms.curated.emptyBody}</p><a className={styles.textLink} href="#custom-gifting">{cms.curated.emptyCta}</a></div>}
      {model.groups.filter(group => group.slug !== "custom-gift").map(group => <section id={group.slug} key={group.slug} className={styles.productGroup} aria-labelledby={group.slug + "-heading"}>
        <h3 id={group.slug + "-heading"}>{cms.curated.groupHeadings[group.slug]}</h3>
        {group.gifts.length > 0 ? <div className={styles.productGrid}>{group.gifts.map(gift =>
          <StoreProductCard key={gift.product.slug} product={gift.product} id={"gift-" + gift.product.slug} className={styles.giftCard}
            editorial={{ compact: true, label: gift.label, summary: gift.summary, cta: cms.curated.cardCta,
              priceText: gift.product.price === 0 && !gift.product.inStock ? cms.curated.zeroPrice : undefined,
              pointsText: gift.pvValue > 0 && model.pointDisplayName ? "可獲得 " + pointNumber.format(gift.pvValue) + " " + model.pointDisplayName : undefined,
            }} />
        )}</div> : <p className={styles.groupEmpty}>{cms.curated.groupEmpty}</p>}
      </section>)}
    </section>,
    help: <section id="gift-selection-help" className={styles.help} aria-labelledby="help-heading">
      <h2 id="help-heading"><StudioText value={cms.help.heading} presentation={presentation("help")} field="heading"/></h2>
      <div className={styles.guidance}>{cms.help.items.filter(item => item.enabled).map(item => <a key={item.id} href={giftTargetHref(item.target, slugs)}><h3>{item.title}</h3><p>{item.body}</p></a>)}</div>
    </section>,
    custom: <section id="custom-gifting" className={styles.custom} aria-labelledby="custom-heading">
      <span id="custom-gift" className={styles.scrollAlias} aria-hidden="true" />
      <div><p className={styles.eyebrow}><StudioText value={cms.custom.eyebrow} presentation={presentation("custom")} field="eyebrow"/></p><h2 id="custom-heading"><StudioText value={cms.custom.title} presentation={presentation("custom")} field="heading"/></h2>
        <p><StudioText value={cms.custom.body ?? (model.custom?.shortDescription || DEFAULT_GIFT_CUSTOM_BODY)} presentation={presentation("custom")} field="body"/></p><p className={styles.inquiry}>{cms.custom.inquiry}</p>
      </div>
      <a {...(cms.sections.find(s=>s.id==="custom")?.presentation?{"data-studio-cta":true}:{})} className={styles.primary} href={giftContactHref(cms.custom.target)} target="_blank" rel="noopener noreferrer"><StudioText value={cms.custom.ctaLabel} presentation={presentation("custom")} field="ctaLabel"/></a>
    </section>,
  };
  return <main id="gifts-main" tabIndex={-1} className={styles.main}>{cms.sections.filter(s => s.enabled).map(s => {
    const element = sections[s.id];
    const extra = [s.background === "soft" ? styles.surfaceSoft : s.background === "contrast" ? styles.surfaceContrast : "", s.width === "wide" ? styles.sectionWide : "", s.presentation ? studioStyles.frame : ""].filter(Boolean).join(" ");
    return cloneElement(element, { key: s.id, className: extra ? element.props.className + " " + extra : element.props.className, ...(s.alignment === "center" ? { style: { textAlign: "center" } } : {}), ...studioPresentationProps(s.presentation,s.id==="hero"?48:34) });
  })}</main>;
}
