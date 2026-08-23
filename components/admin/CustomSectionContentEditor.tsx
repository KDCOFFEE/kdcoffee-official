"use client";

import {
  PRODUCT_CUSTOM_FEATURE_ICONS,
  PRODUCT_CUSTOM_FEATURE_MAX_ITEMS,
  createProductCustomFeatureId,
  type ProductCustomFeaturesSection,
  type ProductCustomSection,
  type ProductCustomTextSection,
} from "@/lib/productCustomSections";

export default function CustomSectionContentEditor({ section, onChange }: { section: ProductCustomSection; onChange: (next: ProductCustomSection) => void }) {
  if (section.type === "text") return <TextFields section={section} onChange={onChange} />;
  return <FeatureFields section={section} onChange={onChange} />;
}

function TextFields({ section, onChange }: { section: ProductCustomTextSection; onChange: (next: ProductCustomSection) => void }) {
  const update = (change: Partial<ProductCustomTextSection["content"]>) => onChange({ ...section, content: { ...section.content, ...change } });
  return <fieldset className="custom-section-editor-group"><legend>前台文案</legend>
    <label>英文小標<input maxLength={60} value={section.content.eyebrow || ""} onChange={(event) => update({ eyebrow: event.target.value })} /></label>
    <label>主標題<input maxLength={120} value={section.content.heading || ""} onChange={(event) => update({ heading: event.target.value })} /></label>
    <label>內文<textarea maxLength={2000} rows={7} value={section.content.body || ""} onChange={(event) => update({ body: event.target.value })} /></label>
  </fieldset>;
}

function FeatureFields({ section, onChange }: { section: ProductCustomFeaturesSection; onChange: (next: ProductCustomSection) => void }) {
  const updateCopy = (change: Partial<Omit<ProductCustomFeaturesSection["content"], "items">>) => onChange({ ...section, content: { ...section.content, ...change } });
  const updateItems = (items: ProductCustomFeaturesSection["content"]["items"]) => onChange({ ...section, content: { ...section.content, items } });
  const move = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= section.content.items.length) return;
    const items = [...section.content.items];
    [items[index], items[destination]] = [items[destination], items[index]];
    updateItems(items);
  };
  return <fieldset className="custom-section-editor-group"><legend>重點特色內容</legend>
    <label>英文小標<input maxLength={60} value={section.content.eyebrow || ""} onChange={(event) => updateCopy({ eyebrow: event.target.value })} /></label>
    <label>主標題<input maxLength={120} value={section.content.heading || ""} onChange={(event) => updateCopy({ heading: event.target.value })} /></label>
    <label>說明<textarea maxLength={400} rows={3} value={section.content.description || ""} onChange={(event) => updateCopy({ description: event.target.value })} /></label>
    <div className="custom-feature-admin-list">{section.content.items.map((item, index) => <article key={item.id}>
      <div className="custom-feature-admin-head"><strong>重點項目 {index + 1}</strong><code>{item.id}</code><span><button type="button" onClick={() => move(index, -1)} disabled={index === 0}>↑</button><button type="button" onClick={() => move(index, 1)} disabled={index === section.content.items.length - 1}>↓</button><button type="button" onClick={() => updateItems(section.content.items.filter((entry) => entry.id !== item.id))}>移除</button></span></div>
      <label>圖示<select value={item.icon || ""} onChange={(event) => updateItems(section.content.items.map((entry) => entry.id === item.id ? { ...entry, icon: event.target.value ? event.target.value as typeof item.icon : undefined } : entry))}><option value="">不顯示</option>{PRODUCT_CUSTOM_FEATURE_ICONS.map((icon) => <option key={icon} value={icon}>{icon}</option>)}</select></label>
      <label>標題<input maxLength={120} value={item.title} onChange={(event) => updateItems(section.content.items.map((entry) => entry.id === item.id ? { ...entry, title: event.target.value } : entry))} /></label>
      <label>內容<textarea maxLength={1200} rows={4} value={item.body} onChange={(event) => updateItems(section.content.items.map((entry) => entry.id === item.id ? { ...entry, body: event.target.value } : entry))} /></label>
    </article>)}</div>
    <button type="button" className="cms-secondary-button" disabled={section.content.items.length >= PRODUCT_CUSTOM_FEATURE_MAX_ITEMS} onClick={() => updateItems([...section.content.items, { id: createProductCustomFeatureId(), title: "新特色", body: "請輸入特色內容。" }])}>＋新增重點項目</button>
    <small>每個 Section 最多 {PRODUCT_CUSTOM_FEATURE_MAX_ITEMS} 筆。</small>
  </fieldset>;
}
