"use client";

import {
  WORKS_MARKETING_MARKER_TYPES, WORKS_MARKETING_MARKER_LABELS, resolveWorksMarketingPreset,
  type WorksCardMarkersConfig, type WorksCardMarkerPresentation, type WorksMarketingMarkerType,
} from "@/lib/worksPageCms";
import { resolveWorksMarketingTag } from "@/lib/worksCardMarker";
import type { MediaAsset } from "@/lib/media";
import WorksCardMarkerSettings from "./WorksCardMarkerSettings";
import styles from "./WorksPageManager.module.css";

export type WorksMarkerCatalogEntry = { slug: string; name: string; tag?: string; soldOut: boolean };
export default function WorksCardMarkerStudio({ value, products, onChange, uploadImage, onEditSystem, selected, onSelect }: {
  selected: WorksMarketingMarkerType; onSelect: (type: WorksMarketingMarkerType) => void;
  value?: WorksCardMarkersConfig; products: WorksMarkerCatalogEntry[];
  onChange: (value: WorksCardMarkersConfig) => void; uploadImage: (file: File) => Promise<MediaAsset>;
  onEditSystem: () => void;
}) {
  const presentation = resolveWorksMarketingPreset(value, selected);
  function change(next: WorksCardMarkerPresentation) {
    const stored = { ...next };
    if (selected === "CUSTOM") delete (stored as Partial<WorksCardMarkerPresentation>).text;
    onChange({ contractVersion: 1, marketing: { presets: { ...value?.marketing?.presets, [selected]: stored } } });
  }
  return <>
    <section className={styles.contentCard}>
      <header><div><h3>作品卡標示</h3><p>完售為系統狀態，永遠優先於行銷標籤。每張作品卡最多一個標示。</p></div></header>
      <h4>系統狀態</h4><button type="button" onClick={onEditSystem}>編輯完售顯示方式</button>
      <h4>行銷標示預設</h4>
      <div className={styles.subTabs} aria-label="行銷標示類型">{WORKS_MARKETING_MARKER_TYPES.map(type =>
        <button type="button" key={type} aria-pressed={selected === type} onClick={() => onSelect(type)}>{WORKS_MARKETING_MARKER_LABELS[type]}</button>)}</div>
      <p>選擇一個預設編輯。文字與圖片擇一，暗帶不影響商品供應狀態。</p>
    </section>
    <WorksCardMarkerSettings value={presentation} onChange={change} uploadImage={uploadImage}
      title={WORKS_MARKETING_MARKER_LABELS[selected] + "標示"} textEditable={selected !== "CUSTOM"} />
    <section className={styles.contentCard}>
      <header><div><h3>作品卡標示指派來源</h3>
        <p>沿用既有 Product.tag，不建立第二份指派。請至作品管理的「作品標籤」使用新品／推薦快速選項或自訂文字；活動、限量、本月精選會自動對應類型，其他文字為自訂。</p></div></header>
      <a href="/admin/products">前往既有作品標籤編輯</a>
      <p>既有標籤最多 12 字；留空即為無標示。此處只讀取來源，不提交 Product 或 Commerce 變更。</p>
      <div style={{ overflowX: "auto" }}><table><caption>Canonical 作品清單</caption><thead><tr><th>作品</th><th>slug</th><th>目前標示</th><th>系統狀態</th></tr></thead>
        <tbody>{products.map(product => {
          const assignment = resolveWorksMarketingTag(product.tag);
          return <tr key={product.slug}><td>{product.name}</td><td>{product.slug}</td>
            <td>{assignment ? WORKS_MARKETING_MARKER_LABELS[assignment.type] + " · " + product.tag : "無"}</td>
            <td>{product.soldOut ? "完售優先；標籤保留，恢復供應後再顯示" : "可顯示行銷標籤"}</td></tr>;
        })}</tbody>
      </table></div>
    </section>
  </>;
}
