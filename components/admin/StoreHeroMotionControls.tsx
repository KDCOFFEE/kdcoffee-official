"use client";
import { DEFAULT_STORE_HERO, resolveStoreHeroTiming } from "@/lib/storeHero";
import { changeStoreHeroTiming, type StoreHeroMotionDraft } from "@/lib/storeHeroMotionEditor";
import { StudioNumberInput } from "./StoreVisualControls";
import styles from "./GiftCmsEditor.module.css";
export default function StoreHeroMotionControls({value,onChange,onReplay}:{value:StoreHeroMotionDraft;onChange:(v:StoreHeroMotionDraft)=>void;onReplay:()=>void}){
 const timing=resolveStoreHeroTiming(value.timing);
 return <section className={styles.sectionPanel} aria-label="Hero 動畫"><h3 className={styles.sectionName}>Hero 動畫</h3><label className={styles.check}><input type="checkbox" checked={value.motionEnabled===true} onChange={e=>onChange({...value,motionEnabled:e.target.checked})}/>啟用動畫</label><p className={styles.note}>桌機與手機共用；沿用目前商店主視覺設定。減少動態偏好會自動停用動畫。</p><details className={styles.disclosure}><summary>進階動畫設定</summary>{([['mediaDuration','圖片浮現時間','控制圖片浮現所需的時間。'],['headlineLine1Start','主標題開始時間','控制主標題進場的延遲時間。'],['leadStart','副標題開始時間','控制副標題進場的延遲時間，不會早於主標題。']] as const).map(([key,label,help])=><label key={key} className={styles.field}>{label}<StudioNumberInput value={timing[key]/1000} min={0} max={10} step={0.1} allowEmpty={false} onChange={seconds=>{if(seconds!==undefined)onChange(changeStoreHeroTiming(value,key,seconds));}}/><small>秒 · {help}</small></label>)}<div className={styles.actions}><button type="button" className={styles.secondary} onClick={()=>onChange({...value,timing:structuredClone(DEFAULT_STORE_HERO.timing)})}>恢復既有進場節奏</button><button type="button" className={styles.secondary} onClick={onReplay}>重新播放動畫</button></div></details></section>;
}
