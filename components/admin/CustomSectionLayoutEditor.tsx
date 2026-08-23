"use client";

import { PRODUCT_SECTION_PLACEMENTS, type ProductSectionPlacement } from "@/lib/productPageSections";
import {
  PRODUCT_CUSTOM_FEATURE_LAYOUTS,
  PRODUCT_CUSTOM_TEXT_LAYOUTS,
  productCustomSectionAnchor,
  type ProductCustomSection,
} from "@/lib/productCustomSections";
import {
  customSectionLayoutDescriptions,
  customSectionLayoutLabels,
  customSectionPlacementLabels,
} from "./productCustomSectionAdminLabels";

export default function CustomSectionLayoutEditor({ section, onChange }: { section: ProductCustomSection; onChange: (next: ProductCustomSection) => void }) {
  const layouts = section.type === "text" ? PRODUCT_CUSTOM_TEXT_LAYOUTS : PRODUCT_CUSTOM_FEATURE_LAYOUTS;
  return <fieldset className="custom-section-editor-group"><legend>版型與版位</legend>
    <label>版型<select value={section.layout} onChange={(event) => onChange({ ...section, layout: event.target.value } as ProductCustomSection)}>{layouts.map((layout) => <option key={layout} value={layout}>{customSectionLayoutLabels[layout]}</option>)}</select><small>{customSectionLayoutDescriptions[section.layout]}</small></label>
    <label>顯示位置<select value={section.placement} onChange={(event) => onChange({ ...section, placement: event.target.value as ProductSectionPlacement })}>{PRODUCT_SECTION_PLACEMENTS.map((placement) => <option key={placement} value={placement}>{customSectionPlacementLabels[placement]}</option>)}</select></label>
    <label>同位置排序<input type="number" min="0" max="1000" step="1" value={section.order} onChange={(event) => onChange({ ...section, order: Number(event.target.value) })} /><small>當多個自訂 Section 放在相同位置時，數字越小越前面。</small></label>
    <details className="custom-section-advanced"><summary>進階資訊</summary><p>系統自動建立，通常不需要修改。</p><label>前台錨點<input value={productCustomSectionAnchor(section.id)} readOnly /></label><label>Section ID<input value={section.id} readOnly /></label></details>
  </fieldset>;
}
