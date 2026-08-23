"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import {
  PRODUCT_CUSTOM_SECTION_MAX_COUNT,
  createProductCustomFeatureId,
  createProductCustomSectionId,
  sortProductCustomSections,
  type ProductCustomSection,
  type ProductCustomSectionType,
} from "@/lib/productCustomSections";
import { normalizeProductSectionAnimation } from "@/lib/productPageAnimations";
import CustomProductSectionEditor from "./CustomProductSectionEditor";
import {
  customSectionAnimationSummary,
  customSectionLayoutLabels,
  customSectionPlacementLabels,
} from "./productCustomSectionAdminLabels";

export default function CustomProductSectionManager({ selected, patch }: { selected: Record<string, any>; patch: (change: Record<string, unknown>) => void }) {
  const [newType, setNewType] = useState<ProductCustomSectionType>("text");
  const sections = (Array.isArray(selected.productCustomSections) ? selected.productCustomSections : []) as ProductCustomSection[];
  const updateSections = (next: ProductCustomSection[]) => patch({ productCustomSections: next.length ? next : undefined });
  const createSection = () => {
    if (sections.length >= PRODUCT_CUSTOM_SECTION_MAX_COUNT) return;
    const order = Math.min(1000, Math.max(0, ...sections.filter((section) => section.placement === "page_bottom").map((section) => section.order)) + 10);
    const base = { id: createProductCustomSectionId(), enabled: false, placement: "page_bottom" as const, order };
    const section: ProductCustomSection = newType === "text"
      ? { ...base, type: "text", adminName: "新純文案 Section", layout: "standard", content: { heading: "新自訂 Section" } }
      : { ...base, type: "features", adminName: "新重點特色 Section", layout: "grid", content: { heading: "重點特色", items: [{ id: createProductCustomFeatureId(), title: "新特色", body: "請輸入特色內容。" }] } };
    updateSections([...sections, section]);
  };

  return <section className="custom-product-section-manager" aria-labelledby="custom-product-sections-title">
    <div className="custom-product-section-manager-head"><div><h3 id="custom-product-sections-title">自訂 Section</h3><p>可建立純文案或重點特色；不支援圖片、影片或任意 HTML。新增項目預設不顯示於前台。</p></div><span>{sections.length} / {PRODUCT_CUSTOM_SECTION_MAX_COUNT}</span></div>
    <div className="custom-product-section-toolbar"><label>Section 類型<select value={newType} onChange={(event) => setNewType(event.target.value as ProductCustomSectionType)}><option value="text">純文案</option><option value="features">重點特色</option></select></label><button type="button" onClick={createSection} disabled={sections.length >= PRODUCT_CUSTOM_SECTION_MAX_COUNT}>＋新增 Section</button></div>
    {sections.length ? <div className="custom-product-section-admin-list">{sortProductCustomSections(sections).map((section) => {
      const animation = normalizeProductSectionAnimation(section.animation);
      return <article key={section.id} className={section.enabled ? "is-enabled" : "is-disabled"}>
        <div className="custom-product-section-card-head"><div><span className="custom-section-status">{section.enabled ? "顯示" : "隱藏"}</span><strong>{section.adminName}</strong><small>{section.type === "text" ? "純文案" : "重點特色"}</small></div></div>
        <dl><div><dt>版位</dt><dd>{customSectionPlacementLabels[section.placement]}</dd></div><div><dt>排序</dt><dd>{section.order}</dd></div><div><dt>版型</dt><dd>{customSectionLayoutLabels[section.layout]}</dd></div><div><dt>前台標題</dt><dd>{section.content.heading || "（未設定）"}</dd></div><div><dt>動畫</dt><dd>{section.animation?.enabled ? customSectionAnimationSummary(animation.effect || "fade", animation.trigger || "viewport", animation.durationMs || 500) : "未啟用"}</dd></div></dl>
        <details><summary>編輯此自訂 Section</summary><CustomProductSectionEditor section={section} onChange={(next) => updateSections(sections.map((entry) => entry.id === section.id ? next : entry))} onDelete={() => updateSections(sections.filter((entry) => entry.id !== section.id))} /></details>
      </article>;
    })}</div> : <p className="custom-product-section-empty">此商品尚未建立自訂 Section；前台維持既有呈現。</p>}
  </section>;
}
