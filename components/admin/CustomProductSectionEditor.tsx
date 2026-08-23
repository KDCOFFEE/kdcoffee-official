"use client";

import type { ProductCustomSection } from "@/lib/productCustomSections";
import CustomSectionAnimationEditor from "./CustomSectionAnimationEditor";
import CustomSectionContentEditor from "./CustomSectionContentEditor";
import CustomSectionLayoutEditor from "./CustomSectionLayoutEditor";
import CustomSectionMediaEditor from "./CustomSectionMediaEditor";

export default function CustomProductSectionEditor({ section, productSlug, onChange, onDelete }: { section: ProductCustomSection; productSlug: string; onChange: (next: ProductCustomSection) => void; onDelete: () => void }) {
  return <div className="custom-product-section-editor">
    <fieldset className="custom-section-editor-group"><legend>基本設定</legend>
      <label>後台名稱<input data-custom-section-admin-name maxLength={80} value={section.adminName} onChange={(event) => onChange({ ...section, adminName: event.target.value })} /><small>只供後台辨識，不會顯示在網站前台。</small></label>
      <label>Section 類型<input value={section.type === "text" ? "純文案" : "重點特色"} readOnly /></label>
      <label className="custom-section-check"><input type="checkbox" checked={section.enabled} onChange={(event) => onChange({ ...section, enabled: event.target.checked })} /><span>顯示於前台<small>取消勾選後，內容仍會保留，只是不顯示在網站上。</small></span></label>
    </fieldset>
    <CustomSectionContentEditor section={section} onChange={onChange} />
    <CustomSectionMediaEditor section={section} productSlug={productSlug} onChange={onChange} />
    <CustomSectionLayoutEditor section={section} onChange={onChange} />
    <CustomSectionAnimationEditor section={section} onChange={onChange} />
    <div className="custom-section-danger"><strong>刪除 Section</strong><p>刪除只會先更新目前商品的編輯狀態；確認視窗會摘要此 Section 的文案、媒體與動畫。</p><button type="button" onClick={onDelete}>刪除此 Section</button></div>
  </div>;
}
