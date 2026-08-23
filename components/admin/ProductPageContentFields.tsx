/* eslint-disable @typescript-eslint/no-explicit-any */
import CleanRoastingContentEditor from "@/components/admin/CleanRoastingContentEditor";
import { resolveProductPageContent } from "@/lib/productPageContent";
import type { ProductPageContent } from "@/lib/productPageContentValidation";
import type { ProductSectionKey } from "@/lib/productPageSections";

type Props = { product: Record<string, any>; products?: Array<Record<string, any>>; sectionKey: ProductSectionKey; patch: (change: Record<string, unknown>) => void };

export default function ProductPageContentFields({ product, products = [], sectionKey, patch }: Props) {
  if (sectionKey === "clean-roasting") return <CleanRoastingContentEditor product={product} patch={patch} />;

  const resolved = resolveProductPageContent(product);
  const content = (product.productPageContent && typeof product.productPageContent === "object" ? product.productPageContent : {}) as ProductPageContent;
  const override = (content[sectionKey] || {}) as Record<string, any>;
  const updateOverride = (change: Record<string, unknown>) => {
    const nextSection = { ...override, ...change };
    for (const [key, value] of Object.entries(nextSection)) if (typeof value === "string" && !value.trim()) delete nextSection[key];
    const nextContent = { ...content, ...(Object.keys(nextSection).length ? { [sectionKey]: nextSection } : {}) } as Record<string, unknown>;
    if (!Object.keys(nextSection).length) delete nextContent[sectionKey];
    patch({ productPageContent: nextContent });
  };
  const source = <small>{content[sectionKey] ? "目前使用：商品覆寫" : "目前使用：既有商品資料／全站預設；編輯後才建立覆寫"}</small>;

  if (sectionKey === "product-hero") return <div className="product-content-field-group">
    <div className="product-content-group-heading"><strong>【商品資料】</strong><small>沿用既有商品欄位，不複製資料</small></div>
    <div className="cms-grid two">
      <label>中文作品名稱<input value={product.name || ""} onChange={(event) => patch({ name: event.target.value })} /></label>
      <label>英文作品名稱<input value={product.nameEn || ""} onChange={(event) => patch({ nameEn: event.target.value })} /></label>
      <label>藝術家／靈感來源<input value={product.artist || ""} onChange={(event) => patch({ artist: event.target.value })} /></label>
      <label>商品標籤<input value={product.tag || ""} onChange={(event) => patch({ tag: event.target.value })} /></label>
      <label className="span-two">商品短文案<textarea value={product.shortCopy || ""} onChange={(event) => patch({ shortCopy: event.target.value })} /></label>
      <label className="span-two">情緒／作品故事<textarea value={product.mood || ""} onChange={(event) => patch({ mood: event.target.value })} /></label>
    </div>
    <div className="product-content-group-heading"><strong>【前台文案】</strong>{source}</div>
    <div className="cms-grid two">
      <label>適合對象標題<input value={override.suitabilityHeading ?? resolved[sectionKey].suitabilityHeading} onChange={(event) => updateOverride({ suitabilityHeading: event.target.value })} /></label>
      <label>作品故事英文小標<input value={override.storyEyebrow ?? resolved[sectionKey].storyEyebrow} onChange={(event) => updateOverride({ storyEyebrow: event.target.value })} /></label>
      <label>Gallery 英文小標<input value={override.galleryEyebrow ?? resolved[sectionKey].galleryEyebrow} onChange={(event) => updateOverride({ galleryEyebrow: event.target.value })} /></label>
      <label>Gallery 中文標題<input value={override.galleryHeading ?? resolved[sectionKey].galleryHeading} onChange={(event) => updateOverride({ galleryHeading: event.target.value })} /></label>
    </div>
  </div>;

  if (sectionKey === "select-your-coffee") return <div className="product-content-field-group">
    <div className="product-content-group-heading"><strong>【前台文案】</strong>{source}</div>
    <div className="cms-grid two"><label>英文小標<input value={override.eyebrow ?? resolved[sectionKey].eyebrow} onChange={(event) => updateOverride({ eyebrow: event.target.value })} /></label><label>中文標題（選填）<input value={override.heading ?? resolved[sectionKey].heading} onChange={(event) => updateOverride({ heading: event.target.value })} /></label><label className="span-two">區塊說明<textarea value={override.description ?? resolved[sectionKey].description} onChange={(event) => updateOverride({ description: event.target.value })} /></label></div>
    <div className="product-content-locked-note"><strong>【系統購買規則｜唯讀】</strong><span>商品規格、價格、庫存、數量、豆／粉、專屬烘焙資格、付款與取貨規則仍由 Commerce 與 Checkout 控制。</span></div>
  </div>;

  if (sectionKey === "flavor-notes") return <div className="product-content-field-group">
    <div className="product-content-group-heading"><strong>【商品資料】</strong><small>風味名稱沿用 Product.flavors</small></div>
    <label>風味（以、分隔）<input value={(product.flavors || []).join("、")} onChange={(event) => patch({ flavors: event.target.value.split(/[、,，]/).map((value) => value.trim()).filter(Boolean) })} /></label>
    <CopyFields override={override} resolved={resolved[sectionKey]} update={updateOverride} source={source} />
  </div>;

  if (sectionKey === "coffee-profile") {
    const displayFields = product.displayFields || {};
    return <div className="product-content-field-group">
      <div className="product-content-group-heading"><strong>【商品資料】</strong><small>沿用既有產區、處理法、烘焙度與顯示設定</small></div>
      <div className="cms-grid three">{[["origin", "產區"], ["process", "處理法"], ["roast", "烘焙度"]].map(([key, label]) => <label key={key}>{label}<input value={product[key] || ""} onChange={(event) => patch({ [key]: event.target.value })} /><small><input type="checkbox" checked={displayFields[key] !== false} onChange={(event) => patch({ displayFields: { ...displayFields, [key]: event.target.checked } })} /> 前台顯示</small></label>)}</div>
      <CopyFields override={override} resolved={resolved[sectionKey]} update={updateOverride} source={source} />
      <div className="cms-grid two"><label>烘焙豆入口標題<input value={override.roastedBeanHeading ?? resolved[sectionKey].roastedBeanHeading} onChange={(event) => updateOverride({ roastedBeanHeading: event.target.value })} /></label><label>烘焙豆入口文字<input value={override.roastedBeanCta ?? resolved[sectionKey].roastedBeanCta} onChange={(event) => updateOverride({ roastedBeanCta: event.target.value })} /></label></div>
    </div>;
  }

  if (sectionKey === "related-products") {
    const legacyProductIds = products.filter((item) => item.slug !== product.slug && item.status !== "hidden" && item.inMonthlyMenu).slice(0, 3).map((item) => item.slug);
    const relation = product.relatedProducts && typeof product.relatedProducts === "object" ? product.relatedProducts : { enabled: product.pageLayout?.showRelatedWorks !== false, productIds: legacyProductIds };
    return <div className="product-content-field-group">
      <div className="product-content-group-heading"><strong>【商品資料】</strong><small>推薦商品本身仍由 Relations 引用</small></div>
      <label>比較區標題<input value={relation.title || resolved[sectionKey].heading} onChange={(event) => patch({ relatedProducts: { ...relation, title: event.target.value } })} /></label>
      <div className="product-content-group-heading"><strong>【前台文案】</strong>{source}</div>
      <div className="cms-grid two"><label>英文小標<input value={override.eyebrow ?? resolved[sectionKey].eyebrow} onChange={(event) => updateOverride({ eyebrow: event.target.value })} /></label><label>卡片 CTA<input value={override.cardCtaLabel ?? resolved[sectionKey].cardCtaLabel} onChange={(event) => updateOverride({ cardCtaLabel: event.target.value })} /></label><label className="span-two">區塊說明<textarea value={override.description ?? resolved[sectionKey].description} onChange={(event) => updateOverride({ description: event.target.value })} /></label></div>
    </div>;
  }

  if (sectionKey === "before-you-order") {
    const faqs = override.editorialFaqs || resolved[sectionKey].editorialFaqs;
    const updateFaqs = (next: typeof faqs) => updateOverride({ editorialFaqs: next });
    return <div className="product-content-field-group">
      <CopyFields override={override} resolved={resolved[sectionKey]} update={updateOverride} source={source} />
      <div className="product-content-repeatable-heading"><strong>商品文案 FAQ</strong><button type="button" disabled={faqs.length >= 10} onClick={() => updateFaqs([...faqs, { id: `faq-${Date.now()}`, question: "新問題", answer: "請輸入回答。" }])}>＋ 新增 FAQ</button></div>
      <div className="product-content-repeatable-list">{faqs.map((faq: any, index: number) => <article key={faq.id}><b>FAQ {String(index + 1).padStart(2, "0")}</b><label>問題<input value={faq.question} onChange={(event) => updateFaqs(faqs.map((item: any) => item.id === faq.id ? { ...item, question: event.target.value } : item))} /></label><label>回答<textarea value={faq.answer} onChange={(event) => updateFaqs(faqs.map((item: any) => item.id === faq.id ? { ...item, answer: event.target.value } : item))} /></label><button type="button" onClick={() => updateFaqs(faqs.filter((item: any) => item.id !== faq.id))}>移除</button></article>)}</div>
      <div className="product-content-locked-note"><strong>【系統購買規則｜唯讀】</strong>{resolved[sectionKey].lockedFaqs.map((faq) => <span key={faq.id}>{faq.question}｜{faq.answer}</span>)}</div>
    </div>;
  }

  return <div className="product-content-field-group"><CopyFields override={override} resolved={resolved[sectionKey] as Record<string, string>} update={updateOverride} source={source} />{sectionKey === "campaigns" ? <div className="product-content-locked-note"><strong>【共享活動資料｜唯讀】</strong><span>活動標題、說明、細節、CTA 與媒體仍由首頁「活動管理」維護；此處只編輯作品頁 Section 外框文案。</span></div> : null}</div>;
}

function CopyFields({ override, resolved, update, source }: { override: Record<string, any>; resolved: Record<string, any>; update: (change: Record<string, unknown>) => void; source: React.ReactNode }) {
  return <><div className="product-content-group-heading"><strong>【前台文案】</strong>{source}</div><div className="cms-grid two"><label>英文小標<input value={override.eyebrow ?? resolved.eyebrow ?? ""} maxLength={60} onChange={(event) => update({ eyebrow: event.target.value })} /></label><label>中文標題<input value={override.heading ?? resolved.heading ?? ""} maxLength={120} onChange={(event) => update({ heading: event.target.value })} /></label><label className="span-two">區塊說明<textarea value={override.description ?? resolved.description ?? ""} maxLength={400} onChange={(event) => update({ description: event.target.value })} /></label></div></>;
}
