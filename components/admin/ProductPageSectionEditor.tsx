"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import ProductPageContentFields from "@/components/admin/ProductPageContentFields";
import ProductPageContentPreview, { productSectionChineseName } from "@/components/admin/ProductPageContentPreview";
import {
  DEFAULT_OPTIONAL_SECTION_LAYOUT,
  PRODUCT_SECTION_PLACEMENTS,
  PRODUCT_SECTION_REGISTRY,
  normalizeProductSectionOrder,
  normalizeProductSectionPlacement,
  type ProductSectionPlacement,
  type ProductSectionKey,
} from "@/lib/productPageSections";
import {
  PRODUCT_ANIMATION_EFFECTS,
  PRODUCT_ANIMATION_THRESHOLDS,
  PRODUCT_ANIMATION_TRIGGERS,
  getProductAnimationAdminDefault,
  normalizeProductSectionAnimation,
  type ProductAnimationChildConfig,
  type ProductAnimationChildKey,
  type ProductPageAnimations,
  type ProductSectionAnimationConfig,
} from "@/lib/productPageAnimations";

type Product = Record<string, any>;
type LayoutChange = { enabled?: boolean; placement?: ProductSectionPlacement; order?: number };
type LayoutRow = { key: ProductSectionKey; fixed: boolean; enabled?: boolean; placement?: ProductSectionPlacement; order?: number; update?: (change: LayoutChange) => void };
type Props = { selected: Product; products: Product[]; patch: (change: Record<string, unknown>) => void };

const placementLabels: Record<ProductSectionPlacement, string> = {
  after_purchase: "購買區之後",
  after_profile: "Coffee Profile 之後",
  after_clean_roasting: "Clean Roasting 之後",
  before_before_you_order: "Before You Order 之前",
  page_bottom: "頁面底部",
};
const animationEffectLabels = Object.fromEntries([
  ["none", "無效果"], ["fade", "淡入"], ["slide-left", "由左滑入"], ["slide-right", "由右滑入"], ["slide-up", "向上浮現"], ["scale-fade", "輕微縮放淡入"],
]) as Record<(typeof PRODUCT_ANIMATION_EFFECTS)[number], string>;
const animationTriggerLabels = Object.fromEntries([
  ["none", "無動畫"], ["page-load", "頁面載入時"], ["viewport", "滑到此區塊時"],
]) as Record<(typeof PRODUCT_ANIMATION_TRIGGERS)[number], string>;
const animationThresholdLabels = Object.fromEntries([
  ["entry", "剛進入畫面"], ["slight", "進入一點"], ["quarter", "進入四分之一"], ["half", "進入一半"],
]) as Record<(typeof PRODUCT_ANIMATION_THRESHOLDS)[number], string>;

export default function ProductPageSectionEditor({ selected, products, patch }: Props) {
  const campaignDefault = DEFAULT_OPTIONAL_SECTION_LAYOUT.campaigns;
  const relatedDefault = DEFAULT_OPTIONAL_SECTION_LAYOUT["related-products"];
  const campaignSource = selected.campaignDisplay && typeof selected.campaignDisplay === "object" ? selected.campaignDisplay : {};
  const relatedSource = selected.relatedProducts && typeof selected.relatedProducts === "object" ? selected.relatedProducts : null;
  const legacyRelatedIds = products.filter((product) => product.slug !== selected.slug && product.status !== "hidden" && product.inMonthlyMenu).slice(0, 3).map((product) => product.slug);
  const campaignDisplay = { enabled: campaignSource.enabled === true, campaignIds: Array.isArray(campaignSource.campaignIds) ? campaignSource.campaignIds : [], placement: normalizeProductSectionPlacement(campaignSource.placement, campaignDefault.placement), order: normalizeProductSectionOrder(campaignSource.order, campaignDefault.order) };
  const relatedProducts = { enabled: relatedSource ? relatedSource.enabled !== false : selected.pageLayout?.showRelatedWorks !== false, title: relatedSource?.title || "也可以比較這三款", productIds: relatedSource && Array.isArray(relatedSource.productIds) ? relatedSource.productIds : legacyRelatedIds, placement: normalizeProductSectionPlacement(relatedSource?.placement, relatedDefault.placement), order: normalizeProductSectionOrder(relatedSource?.order, relatedDefault.order) };
  const optional: LayoutRow[] = [
    { key: "campaigns", fixed: false, ...campaignDisplay, update: (change) => patch({ campaignDisplay: { ...campaignDisplay, ...change } }) },
    { key: "related-products", fixed: false, ...relatedProducts, update: (change) => patch({ relatedProducts: { ...relatedProducts, ...change } }) },
  ];
  const labels = Object.fromEntries(PRODUCT_SECTION_REGISTRY.map((section) => [section.key, section.label])) as Record<ProductSectionKey, string>;
  const animationSource = selected.productPageAnimations && typeof selected.productPageAnimations === "object" ? selected.productPageAnimations as ProductPageAnimations : {};
  const animationFor = (sectionKey: ProductSectionKey) => normalizeProductSectionAnimation(animationSource[sectionKey], getProductAnimationAdminDefault(selected.slug || "", sectionKey));
  const updateAnimation = (sectionKey: ProductSectionKey, change: Partial<ProductSectionAnimationConfig>) => patch({ productPageAnimations: { ...animationSource, [sectionKey]: { ...animationFor(sectionKey), ...change } } });
  const updateChildAnimation = (sectionKey: ProductSectionKey, childKey: ProductAnimationChildKey, change: Record<string, unknown>) => {
    const current = animationFor(sectionKey);
    const child = current.children?.[childKey] || {};
    updateAnimation(sectionKey, { children: { ...(current.children || {}), [childKey]: { ...child, ...change } } });
  };
  const optionalAt = (placement: ProductSectionPlacement) => optional.filter((section) => section.placement === placement).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.key === "campaigns" ? -1 : 1));
  const rows: LayoutRow[] = [
    { key: "product-hero", fixed: true }, { key: "select-your-coffee", fixed: true }, ...optionalAt("after_purchase"),
    { key: "flavor-notes", fixed: true }, { key: "coffee-profile", fixed: true }, ...optionalAt("after_profile"),
    { key: "clean-roasting", fixed: true }, ...optionalAt("after_clean_roasting"), ...optionalAt("before_before_you_order"),
    { key: "before-you-order", fixed: true }, ...optionalAt("page_bottom"),
  ];

  return <section className="cms-panel product-section-layout-editor">
    <div className="cms-panel-head"><div><h2>前台 Section 順序、文案與動畫</h2><p>依實際前台順序顯示。展開 Section 可編輯安全文案；版位與動畫沿用既有控制。</p></div></div>
    <datalist id="product-animation-duration-presets">{[300, 400, 500, 600, 700, 800, 1000].map((value) => <option key={value} value={value} />)}</datalist>
    <datalist id="product-animation-delay-presets">{[0, 100, 200, 300, 400, 500, 600].map((value) => <option key={value} value={value} />)}</datalist>
    <div className="product-section-layout-list">{rows.map((row, index) => {
      const animation = animationFor(row.key);
      return <article key={row.key} className={row.fixed ? "is-fixed" : "is-movable"}>
        <span className="product-section-layout-index">{String(index + 1).padStart(2, "0")}</span>
        <div className="product-section-layout-identity"><strong>{productSectionChineseName(row.key)}</strong><span>{labels[row.key]}</span><small>#{row.key}</small></div>
        {row.fixed ? <em>FIXED</em> : <><label className="product-section-layout-toggle"><input type="checkbox" checked={row.enabled === true} onChange={(event) => row.update?.({ enabled: event.target.checked })} />{row.enabled === true ? "顯示" : "隱藏"}</label><label>版位<select value={row.placement} onChange={(event) => row.update?.({ placement: event.target.value as ProductSectionPlacement })}>{PRODUCT_SECTION_PLACEMENTS.map((placement) => <option key={placement} value={placement}>{placementLabels[placement]}</option>)}</select></label><label>同位置排序<input type="number" min="0" max="20" step="1" value={row.order} onChange={(event) => row.update?.({ order: Number(event.target.value) })} /></label></>}
        <ProductPageContentPreview product={selected} sectionKey={row.key} />
        <details className="product-section-editor-details">
          <summary>編輯此 Section</summary>
          <ProductPageContentFields product={selected} products={products} sectionKey={row.key} patch={patch} />
          <div className="product-section-animation-admin"><div className="product-content-group-heading"><strong>【動畫】</strong><small>{Object.prototype.hasOwnProperty.call(animationSource, row.key) ? "已使用此商品的 Admin 設定" : "目前使用相容預設；未儲存任何動畫資料"}</small></div><div className="product-animation-status"><label><input type="checkbox" checked={animation.enabled === true} onChange={(event) => updateAnimation(row.key, { enabled: event.target.checked })} />啟用區塊動畫</label></div><div className="product-animation-control-grid"><label>動畫效果<select value={animation.effect} onChange={(event) => updateAnimation(row.key, { effect: event.target.value as ProductSectionAnimationConfig["effect"] })}>{PRODUCT_ANIMATION_EFFECTS.map((effect) => <option key={effect} value={effect}>{animationEffectLabels[effect]}</option>)}</select></label><label>觸發方式<select value={animation.trigger} onChange={(event) => updateAnimation(row.key, { trigger: event.target.value as ProductSectionAnimationConfig["trigger"] })}>{PRODUCT_ANIMATION_TRIGGERS.map((trigger) => <option key={trigger} value={trigger}>{animationTriggerLabels[trigger]}</option>)}</select></label><label>動畫時間<input type="number" min="200" max="1500" step="100" list="product-animation-duration-presets" value={animation.durationMs} onChange={(event) => updateAnimation(row.key, { durationMs: Number(event.target.value) })} /><small>200–1500 ms</small></label><label>延遲時間<input type="number" min="0" max="2000" step="100" list="product-animation-delay-presets" value={animation.delayMs} onChange={(event) => updateAnimation(row.key, { delayMs: Number(event.target.value) })} /><small>0–2000 ms</small></label>{animation.trigger === "viewport" ? <label>進入畫面程度<select value={animation.threshold} onChange={(event) => updateAnimation(row.key, { threshold: event.target.value as ProductSectionAnimationConfig["threshold"] })}>{PRODUCT_ANIMATION_THRESHOLDS.map((threshold) => <option key={threshold} value={threshold}>{animationThresholdLabels[threshold]}</option>)}</select></label> : null}<label>播放方式<select value={animation.once === false ? "repeat" : "once"} onChange={(event) => updateAnimation(row.key, { once: event.target.value !== "repeat" })}><option value="once">只播放一次</option><option value="repeat">每次重新進入區塊</option></select></label></div>
          {row.key === "product-hero" ? <p className="product-animation-safety-note">Hero 採 enhancement-only：原始 Hero、Product Identity 與購買內容永遠先保持可見、可操作。</p> : null}
          {row.key === "select-your-coffee" ? <div className="product-animation-child-grid"><AnimationChildControls label="LEFT content／標題" config={animation.children?.left} onChange={(change) => updateChildAnimation(row.key, "left", change)} /><AnimationChildControls label="RIGHT content／購買控制" config={animation.children?.right} onChange={(change) => updateChildAnimation(row.key, "right", change)} /></div> : null}
          {row.key === "clean-roasting" ? <div className="clean-animation-sequence"><strong>章節順序延遲</strong>{([["heading", "Heading"], ["media-stage", "Media Stage"], ["proof-1", "01"], ["proof-2", "02"], ["proof-3", "03"]] as Array<[ProductAnimationChildKey, string]>).map(([childKey, label]) => <label key={childKey}>{label}<input type="number" min="0" max="2000" step="50" list="product-animation-delay-presets" value={animation.children?.[childKey]?.delayMs ?? 0} onChange={(event) => updateChildAnimation(row.key, childKey, { delayMs: Number(event.target.value) })} /><small>ms</small></label>)}</div> : null}
        </div>
        </details>
      </article>;
    })}</div>
    <p className="product-section-layout-note">未設定文案不需 migration；清除商品覆寫後會立即恢復既有商品資料或安全預設。Campaigns 與 Related Products 仍只引用既有共享資料。</p>
  </section>;
}

function AnimationChildControls({ label, config, onChange }: { label: string; config?: ProductAnimationChildConfig; onChange: (change: Record<string, unknown>) => void }) {
  const child = config || {};
  return <fieldset><legend>{label}</legend><label>動畫效果<select value={child.effect || "none"} onChange={(event) => onChange({ effect: event.target.value })}>{PRODUCT_ANIMATION_EFFECTS.map((effect) => <option key={effect} value={effect}>{animationEffectLabels[effect]}</option>)}</select></label><label>動畫時間<input type="number" min="200" max="1500" step="100" value={child.durationMs ?? 500} onChange={(event) => onChange({ durationMs: Number(event.target.value) })} /></label><label>延遲時間<input type="number" min="0" max="2000" step="100" value={child.delayMs ?? 0} onChange={(event) => onChange({ delayMs: Number(event.target.value) })} /></label></fieldset>;
}
