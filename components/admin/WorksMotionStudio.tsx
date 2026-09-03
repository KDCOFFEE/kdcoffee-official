"use client";

import { useState } from "react";

import type { HomepageMotionPreset } from "@/lib/homepageCms";
import type { ResolvedWorksPageCms, WorksEntranceMotion, WorksPageCmsConfig } from "@/lib/worksPageCms";
import styles from "./WorksPageManager.module.css";

export type WorksMotionPreviewTarget = "hero" | "heroMedia" | "catalogIntro" | "productGrid";
type WorksMotion = ResolvedWorksPageCms["motion"];
type MotionKey = Exclude<keyof NonNullable<WorksPageCmsConfig["motion"]>, "cardHover">;

const presets: Array<[HomepageMotionPreset, string, string]> = [
  ["none", "無", "內容直接顯示"], ["fade", "淡入", "安靜地浮現"], ["fade-up", "向上淡入", "輕柔向上帶入"],
  ["slide-left", "由左進入", "從左側進入畫面"], ["slide-right", "由右進入", "從右側進入畫面"], ["scale-reveal", "縮放揭示", "由小至大顯現"], ["editorial", "編輯式揭示", "文字與內容依序出現"],
];

const groupMeta: Array<[MotionKey, string, string]> = [
  ["hero", "Hero 文字／內容動畫", "控制月份小標、標題、說明與按鈕的進場。"],
  ["heroMedia", "Hero 圖片／媒體動畫", "只控制 Hero 圖片或影片，不影響文字與按鈕。"],
  ["catalogIntro", "作品列表標題／說明", "控制作品數量與輔助說明的進場。"],
  ["productGrid", "商品列表", "控制商品卡片列表的進場與依序節奏。"],
];

export default function WorksMotionStudio({ value, onChange, onPreview }: { value: WorksMotion; onChange: (value: WorksMotion) => void; onPreview: (target: WorksMotionPreviewTarget) => void }) {
  const [active, setActive] = useState<MotionKey>("hero");
  const [key, title, description] = groupMeta.find(([group]) => group === active)!;
  const current = value[key];
  const patch = (next: Partial<WorksEntranceMotion>) => onChange({ ...value, [key]: { ...current, ...next } });
  const selectPreset = (preset: HomepageMotionPreset) => patch({ enabled: preset !== "none", preset });

  return <div className={styles.studioPanel}>
    <header className={styles.panelIntro}><div><p>MOTION STUDIO</p><h2>動畫效果</h2><span>只使用 KD Coffee 的安全動畫語彙；公開頁尚未接線。</span></div></header>
    <nav className={styles.subTabs} aria-label="動畫區域">{groupMeta.map(([group, label]) => <button type="button" key={group} className={active === group ? styles.activeSubTab : ""} onClick={() => setActive(group)}>{label}</button>)}</nav>
    <section className={styles.motionCard}>
      <header><div><h3>{title}</h3><p>{description}</p></div><button type="button" className="cms-secondary-button" onClick={() => onPreview(key)}>預覽動畫</button></header>
      <div className={styles.motionChoices} role="group" aria-label={`${title}動畫效果`}>{presets.map(([preset, label, helper]) => <button type="button" key={preset} className={(current.enabled ? current.preset : "none") === preset ? styles.selectedMotion : ""} aria-pressed={(current.enabled ? current.preset : "none") === preset} onClick={() => selectPreset(preset)}><strong>{label}</strong><small>{helper}</small></button>)}</div>
      <details className={styles.advancedSettings}><summary>進階設定</summary>
        <div className={styles.rangeGrid}>
          <MotionNumber label="速度" unit="秒" value={current.durationMs} min={100} max={5000} step={100} display={(current.durationMs / 1000).toFixed(1)} onChange={(durationMs) => patch({ durationMs })} />
          <MotionNumber label="延遲" unit="秒" value={current.delayMs} min={0} max={10000} step={100} display={(current.delayMs / 1000).toFixed(1)} onChange={(delayMs) => patch({ delayMs })} />
          <MotionNumber label="移動距離" unit="px" value={current.distancePx} min={0} max={80} step={1} display={String(current.distancePx)} onChange={(distancePx) => patch({ distancePx })} />
          <MotionNumber label="卡片／項目間隔" unit="秒" value={current.staggerMs} min={0} max={2000} step={100} display={(current.staggerMs / 1000).toFixed(1)} onChange={(staggerMs) => patch({ staggerMs })} />
        </div>
        {key === "productGrid" ? <label className={styles.staggerToggle}><input type="checkbox" checked={current.staggerMs > 0} onChange={(event) => patch({ staggerMs: event.target.checked ? 100 : 0 })} /><span><strong>商品卡依序出現</strong><small>關閉時所有卡片同時顯示。</small></span></label> : null}
      </details>
      <label className={styles.staggerToggle}><input type="checkbox" checked={current.triggerOnViewport} onChange={(event) => patch({ triggerOnViewport: event.target.checked })} /><span><strong>滑到此區塊時才播放動畫</strong><small>關閉時於頁面載入後播放一次。</small></span></label>
    </section>
    <CardHoverEditor value={value.cardHover} onChange={(cardHover) => onChange({ ...value, cardHover })} />
  </div>;
}

function MotionNumber({ label, unit, value, min, max, step, display, onChange }: { label: string; unit: string; value: number; min: number; max: number; step: number; display: string; onChange: (value: number) => void }) {
  return <label className={styles.motionRange}><span><strong>{label}</strong><b>{display} {unit}</b></span><input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function CardHoverEditor({ value, onChange }: { value: WorksMotion["cardHover"]; onChange: (value: WorksMotion["cardHover"]) => void }) {
  return <section className={styles.motionCard}><header><div><h3>商品卡滑鼠效果</h3><p>控制桌機游標移到商品卡時的反應；手機不依賴 hover。</p></div></header><div className={styles.motionChoices} role="group" aria-label="商品卡滑鼠效果"><button type="button" className={!value.enabled || value.preset === "none" ? styles.selectedMotion : ""} onClick={() => onChange({ ...value, enabled: false, preset: "none" })}><strong>無</strong><small>卡片保持靜止</small></button><button type="button" className={value.enabled && value.preset === "current-scale" ? styles.selectedMotion : ""} onClick={() => onChange({ ...value, enabled: true, preset: "current-scale" })}><strong>目前輕微縮放</strong><small>保留現有 Works 卡片行為</small></button></div><details className={styles.advancedSettings}><summary>進階設定</summary><MotionNumber label="反應速度" unit="秒" value={value.durationMs} min={100} max={2000} step={100} display={(value.durationMs / 1000).toFixed(1)} onChange={(durationMs) => onChange({ ...value, durationMs })} /></details></section>;
}
