/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolveProductPageContent } from "@/lib/productPageContent";
import { PRODUCT_PAGE_CONTENT_MAX_PROOFS, type ProductPageContent } from "@/lib/productPageContentValidation";

type Props = { product: Record<string, any>; patch: (change: Record<string, unknown>) => void };

export default function CleanRoastingContentEditor({ product, patch }: Props) {
  const resolved = resolveProductPageContent(product)["clean-roasting"];
  const content = (product.productPageContent && typeof product.productPageContent === "object" ? product.productPageContent : {}) as ProductPageContent;
  const override = content["clean-roasting"] || {};

  const update = (change: Record<string, unknown>) => {
    const nextSection = { ...override, ...change } as Record<string, unknown>;
    for (const [key, value] of Object.entries(nextSection)) if (typeof value === "string" && !value.trim()) delete nextSection[key];
    const nextContent = { ...content, ...(Object.keys(nextSection).length ? { "clean-roasting": nextSection } : {}) } as Record<string, unknown>;
    if (!Object.keys(nextSection).length) delete nextContent["clean-roasting"];
    patch({ productPageContent: nextContent });
  };
  const proofs = override.proofs?.length ? override.proofs : resolved.proofs;
  const updateProofs = (nextProofs: typeof proofs) => update({ proofs: nextProofs });

  return <div className="product-content-field-group clean-roasting-content-editor">
    <div className="product-content-group-heading"><strong>【前台文案】</strong><small>{content["clean-roasting"] ? "目前使用：商品覆寫" : "目前使用：全站預設；編輯後才建立覆寫"}</small></div>
    <div className="cms-grid two">
      <label>英文小標<input value={override.eyebrow ?? resolved.eyebrow} maxLength={60} onChange={(event) => update({ eyebrow: event.target.value })} /></label>
      <label>中文標題<input value={override.heading ?? resolved.heading} maxLength={120} onChange={(event) => update({ heading: event.target.value })} /></label>
      <label className="span-two">區塊說明<textarea value={override.description ?? resolved.description} maxLength={400} onChange={(event) => update({ description: event.target.value })} placeholder="可留空；清除商品覆寫後會恢復目前預設" /></label>
    </div>
    <div className="product-content-repeatable-heading"><strong>烘焙重點</strong><button type="button" disabled={proofs.length >= PRODUCT_PAGE_CONTENT_MAX_PROOFS} onClick={() => updateProofs([...proofs, { id: `proof-${Date.now()}`, title: "新重點", body: "請輸入說明內容。", icon: "air" }])}>＋ 新增重點</button></div>
    <div className="product-content-repeatable-list">{proofs.map((proof, index) => <article key={proof.id}>
      <b>重點 {String(index + 1).padStart(2, "0")}</b>
      <label>標題<input value={proof.title} maxLength={120} onChange={(event) => updateProofs(proofs.map((item) => item.id === proof.id ? { ...item, title: event.target.value } : item))} /></label>
      <label>說明內容<textarea value={proof.body} maxLength={1200} onChange={(event) => updateProofs(proofs.map((item) => item.id === proof.id ? { ...item, body: event.target.value } : item))} /></label>
      <button type="button" disabled={proofs.length <= 1} onClick={() => updateProofs(proofs.filter((item) => item.id !== proof.id))}>移除</button>
    </article>)}</div>
    <div className="product-content-locked-note"><strong>【媒體】</strong><span>CLEAN ROASTING 影片、照片、Slider 與 Cloudinary 設定由下方「B｜媒體與播放設定」管理。</span></div>
  </div>;
}
