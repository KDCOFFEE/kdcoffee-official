"use client";

import type { CSSProperties } from "react";

import ProductVisualMedia from "@/components/commerce/ProductVisualMedia";
import KdMedia from "@/components/media/KdMedia";
import { visualColorHex } from "@/lib/pageBuilderVisualStyle";
import type { WorksPreviewProduct } from "@/lib/worksPageAdminStore";
import type { HomepageSectionMotion } from "@/lib/homepageCms";
import {
  resolveWorksPagePreviewMedia,
  type ResolvedWorksPageCms,
  type WorksHeroOverlayPreset,
  type WorksPageCmsConfig,
} from "@/lib/worksPageCms";
import type { WorksMotionPreviewTarget } from "./WorksMotionStudio";
import styles from "./WorksPageManager.module.css";

const overlays: Record<WorksHeroOverlayPreset, string> = {
  "current-gradient": "linear-gradient(90deg, rgba(20,14,11,.96) 0%, rgba(20,14,11,.82) 50%, rgba(20,14,11,.35) 100%)",
  soft: "rgba(20,14,11,.42)", strong: "rgba(20,14,11,.78)", none: "transparent",
};

const motionClasses = {
  fade: styles.motionFade,
  "fade-up": styles.motionFadeUp,
  "slide-left": styles.motionSlideLeft,
  "slide-right": styles.motionSlideRight,
  "scale-reveal": styles.motionScale,
  editorial: styles.motionEditorial,
  none: "",
};

export default function WorksPagePreview({ value, draftHero, products, device, onDevice, target, replayKey, onReplay, compact = false }: { value: ResolvedWorksPageCms; draftHero: NonNullable<WorksPageCmsConfig["hero"]>; products: WorksPreviewProduct[]; device: "desktop" | "mobile"; onDevice: (device: "desktop" | "mobile") => void; target: WorksMotionPreviewTarget; replayKey: number; onReplay: () => void; compact?: boolean }) {
  const selected = resolveWorksPagePreviewMedia(draftHero, device);
  const targetMotion = value.motion[target];
  const motionStyle = animationVariables(targetMotion);
  const heroMotionClass = target === "hero" ? motionClass(targetMotion) : "";
  const catalogMotionClass = target === "catalogIntro" ? motionClass(targetMotion) : "";
  const gridMotionClass = target === "productGrid" ? motionClass(targetMotion) : "";
  const colors = Object.fromEntries(Object.entries(value.colors).map(([key, color]) => [key, visualColorHex(color)])) as Record<keyof typeof value.colors, string>;
  const previewWidth = device === "mobile" ? "min(100%, 390px)" : "100%";

  return <section className={`${styles.previewStudio} ${compact ? styles.compactPreview : ""}`}>
    <header><div><p>LIVE PREVIEW</p><h2>即時預覽</h2><span>直接顯示尚未儲存的內容、素材、色彩與動畫。</span></div><button type="button" className="cms-secondary-button" onClick={onReplay}>↻ 重新播放</button></header>
    <div className="visual-device-switch"><button type="button" className={device === "desktop" ? "is-selected" : ""} onClick={() => onDevice("desktop")}>▰ 桌機</button><button type="button" className={device === "mobile" ? "is-selected" : ""} onClick={() => onDevice("mobile")}>▯ 手機</button></div>
    <div className={styles.previewCanvas} style={{ width: previewWidth, background: colors.pageBackground }}>
      {value.hero.enabled ? <div className={styles.previewHero} style={{ background: colors.heroBackground }}>
        {selected ? <KdMedia media={selected.media} alt={selected.alt || "Works Hero 媒體預覽"} className={styles.previewHeroMedia} backgroundVideo eager /> : null}
        <div className={styles.previewOverlay} style={{ background: overlays[value.hero.overlayPreset] }} />
        <div key={`hero-${replayKey}`} className={`${styles.previewHeroCopy} ${heroMotionClass}`} style={{ ...motionStyle, color: colors.heroText }}>
          <small style={{ color: colors.accent }}>{value.hero.eyebrow}</small>
          <h2>{value.hero.headlineLines[0]}<br />{value.hero.headlineLines[1]}</h2>
          <p style={{ color: colors.heroSecondaryText }}>{value.hero.description}</p>
          <div>{value.hero.primaryCta.enabled ? <span style={{ background: colors.primaryCtaBackground, color: colors.primaryCtaText }}>{value.hero.primaryCta.label}</span> : null}{value.hero.secondaryCta.enabled ? <span className={styles.secondaryCta}>{value.hero.secondaryCta.label}</span> : null}</div>
        </div>
      </div> : <div className={styles.hiddenPreview}>首屏目前設為隱藏</div>}
      <div className={styles.previewCatalog} style={{ background: colors.catalogBackground, color: colors.catalogText }}>
        {value.catalog.introEnabled ? <div key={`catalog-${replayKey}`} className={`${styles.previewCatalogIntro} ${catalogMotionClass}`} style={motionStyle}><strong>{value.catalog.countPrefix} {products.length} {value.catalog.countSuffix}</strong><p>{value.catalog.helperText}</p></div> : null}
        {products.length ? <div className={styles.previewCards}>{products.map((product, index) => <article key={`${replayKey}-${product.slug}`} className={gridMotionClass} style={{ ...motionStyle, animationDelay: `${targetMotion.delayMs + index * targetMotion.staggerMs}ms`, background: colors.cardSurface, color: colors.cardText, borderColor: colors.border }}><div className={styles.previewProductMedia}><ProductVisualMedia src={product.listMedia?.path} alt={product.listMedia?.alt || `${product.name} 主視覺`} fallback={<i aria-hidden="true" />} /></div><b>{product.name}</b><small>{product.tag || product.artist}</small></article>)}</div> : <p className={styles.previewEmpty}>{value.catalog.emptyStateText}</p>}
      </div>
    </div>
    <small className={styles.previewNote}>動畫預覽遵守裝置的「減少動態效果」設定。公開 `/works` 尚未套用這些設定。</small>
  </section>;
}

function animationVariables(motion: HomepageSectionMotion): CSSProperties {
  return {
    "--works-motion-duration": `${motion.durationMs}ms`,
    "--works-motion-delay": `${motion.delayMs}ms`,
    "--works-motion-distance": `${motion.distancePx}px`,
  } as CSSProperties;
}

function motionClass(motion: HomepageSectionMotion) {
  return motion.enabled ? motionClasses[motion.preset] : "";
}
