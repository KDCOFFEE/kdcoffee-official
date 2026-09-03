"use client";

import {
  VISUAL_COLOR_PRESETS,
  hasLowContrast,
  visualColorHex,
  type VisualColorValue,
} from "@/lib/pageBuilderVisualStyle";
import type { WorksPageCmsConfig } from "@/lib/worksPageCms";
import styles from "./WorksPageManager.module.css";

type WorksColors = Required<NonNullable<WorksPageCmsConfig["colors"]>>;
type ColorKey = keyof WorksColors;

const presetLabels: Record<(typeof VISUAL_COLOR_PRESETS)[number], string> = {
  ink: "深墨",
  coffee: "咖啡",
  "warm-gray": "暖灰",
  ivory: "象牙白",
  gold: "金棕",
  white: "柔白",
};

const groups: Array<{ title: string; description: string; fields: Array<[ColorKey, string]> }> = [
  { title: "頁面與首屏", description: "控制整體底色、首屏文字與月份小標。", fields: [["pageBackground", "頁面背景"], ["heroBackground", "首屏背景"], ["heroText", "主標題文字"], ["heroSecondaryText", "首屏說明文字"], ["accent", "小標／重點色"]] },
  { title: "主要按鈕", description: "讓行動按鈕維持清楚、好閱讀。", fields: [["primaryCtaBackground", "按鈕背景"], ["primaryCtaText", "按鈕文字"]] },
  { title: "作品列表", description: "調整作品區與商品卡片的安全配色。", fields: [["catalogBackground", "作品區背景"], ["catalogText", "作品區文字"], ["cardSurface", "商品卡背景"], ["cardText", "商品卡文字"], ["border", "邊框色"]] },
];

export default function WorksVisualStylePanel({ value, onChange }: { value: WorksColors; onChange: (value: WorksColors) => void }) {
  const patch = (key: ColorKey, color: VisualColorValue) => onChange({ ...value, [key]: color });
  const warnings = [
    hasLowContrast(value.heroText, value.heroBackground) ? "首屏主標題與背景的對比可能不夠清楚。" : "",
    hasLowContrast(value.heroSecondaryText, value.heroBackground) ? "首屏說明與背景的對比可能不夠清楚。" : "",
    hasLowContrast(value.primaryCtaText, value.primaryCtaBackground) ? "主要按鈕文字與背景的對比可能不夠清楚。" : "",
    hasLowContrast(value.catalogText, value.catalogBackground) ? "作品區文字與背景的對比可能不夠清楚。" : "",
    hasLowContrast(value.cardText, value.cardSurface) ? "商品卡文字與背景的對比可能不夠清楚。" : "",
  ].filter(Boolean);

  return <div className={styles.studioPanel}>
    <header className={styles.panelIntro}><div><p>VISUAL STYLE</p><h2>視覺風格</h2><span>使用 KD Coffee 的安全色票或有效六碼色彩，不接受 CSS 或程式碼。</span></div></header>
    {groups.map((group) => <section className={styles.colorGroup} key={group.title}>
      <header><h3>{group.title}</h3><p>{group.description}</p></header>
      <div className={styles.colorGrid}>{group.fields.map(([key, label]) => <WorksColorControl key={key} label={label} value={value[key]} onChange={(color) => patch(key, color)} />)}</div>
    </section>)}
    {warnings.length ? <aside className={styles.contrastWarning} role="status"><strong>可讀性提醒</strong>{warnings.map((warning) => <p key={warning}>{warning}</p>)}</aside> : <p className={styles.contrastOkay}>目前主要文字與背景組合通過基本對比檢查。</p>}
  </div>;
}

function WorksColorControl({ label, value, onChange }: { label: string; value: VisualColorValue; onChange: (value: VisualColorValue) => void }) {
  const resolved = visualColorHex(value);
  function commitHex(input: HTMLInputElement) {
    if (/^#[0-9a-f]{6}$/iu.test(input.value)) onChange(input.value.toLowerCase() as `#${string}`);
    else input.value = resolved;
  }

  return <fieldset className={styles.colorControl}>
    <legend>{label}</legend>
    <div className={styles.colorCurrent}><i style={{ background: resolved }} /><span><b>{resolved.toUpperCase()}</b><small>{value.startsWith("#") ? "自訂顏色" : presetLabels[value as keyof typeof presetLabels]}</small></span></div>
    <div className={styles.swatchRow}>{VISUAL_COLOR_PRESETS.map((preset) => <button type="button" key={preset} title={presetLabels[preset]} aria-label={`${label}：${presetLabels[preset]}`} aria-pressed={value === preset} className={value === preset ? styles.selectedSwatch : ""} onClick={() => onChange(preset)}><i style={{ background: visualColorHex(preset) }} /></button>)}</div>
    <div className={styles.customColor}><label><span>選色</span><input aria-label={`${label}色彩選擇`} type="color" value={resolved} onChange={(event) => onChange(event.target.value as `#${string}`)} /></label><label><span>HEX</span><input key={resolved} aria-label={`${label} HEX`} defaultValue={resolved} maxLength={7} onBlur={(event) => commitHex(event.currentTarget)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitHex(event.currentTarget); } }} /></label></div>
  </fieldset>;
}
