'use client';
import { useState } from 'react';
import type { CoffeeArtwork } from '@/data/websiteData';
import { resolveGalleryWorks } from '@/lib/galleryWorks';
import { DEFAULT_GALLERY_REVEAL_TIMING, GALLERY_TIMING_MAX_SECONDS, normalizeGalleryRevealTiming, resolveGalleryRevealTiming, type GalleryRevealTiming, type GalleryTimingKey } from '@/lib/galleryRevealTiming';
import { GALLERY_MOTION_PRESETS, normalizeGalleryRevealAnimation, resolveGalleryRevealAnimation, type GalleryRevealAnimation, type GalleryRevealGroup } from '@/lib/galleryRevealAnimation';
import { GALLERY_MOTION_LABELS } from '@/lib/galleryMotionLabels';
import GalleryStage from '@/components/gallery/GalleryStage';
import SecondsTimingControl from './SecondsTimingControl';
import css from './GalleryTimingControls.module.css';
import gallery from '@/components/gallery/GalleryExperience.module.css';

const fields = [['titleHookAt', '標題／吸引句'], ['interpretationAt', '作品詮釋'], ['coffeeBridgeAt', '咖啡連結'], ['ctaAt', '走進作品']] as const;
export default function GalleryTimingControls({ work, onChange, onAnimationChange }: { work: CoffeeArtwork; onChange: (value: GalleryRevealTiming | undefined) => void; onAnimationChange?: (value: GalleryRevealAnimation | undefined) => void }) {
  const [replay, setReplay] = useState(0), [open, setOpen] = useState(false), [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const timing = resolveGalleryRevealTiming(work.galleryRevealTiming);
  const animation = resolveGalleryRevealAnimation(work.galleryRevealAnimation);
  // Authenticated draft only: listing flags are cloned for preview, never saved.
  const draft = resolveGalleryWorks([{ ...work, inMonthlyMenu: true, status: 'active', showWhenSoldOut: true }])[0];
  function update(key: GalleryTimingKey, seconds: number) {
    const safe = Math.round(Math.max(0, Math.min(GALLERY_TIMING_MAX_SECONDS, Number.isFinite(seconds) ? seconds : DEFAULT_GALLERY_REVEAL_TIMING[key])) * 10) / 10;
    onChange(normalizeGalleryRevealTiming({ ...work.galleryRevealTiming, [key]: safe }));
  }
  return <section className={css.section} aria-label="作品詮釋進場效果">
    <h3>作品詮釋進場效果</h3>
    <p>這裡設定文案進場動畫，與上方作品動畫影片分開。桌機與手機共用節奏。未設定時沿用 3.5／5 秒；短影片會自動提前，靜態圖片也會依設定的時間與效果進場。</p>
    {draft && !draft.stageVideo && !draft.mobileVideo ? <p role="status">目前未設定作品動畫影片；前台將使用靜態圖片，但文案仍會依下方設定的時間與效果進場。</p> : null}
    <div className={css.motionGrid}>{fields.map(([key, label]) => { const group = key.replace(/At$/, "") as GalleryRevealGroup; return <div key={key} className={css.motionRow}><span>{label}</span><select aria-label={`${label}動畫`} value={animation[group]} onChange={event => onAnimationChange?.(normalizeGalleryRevealAnimation({ ...work.galleryRevealAnimation, [group]: event.target.value }))}>{GALLERY_MOTION_PRESETS.map(preset => <option key={preset} value={preset}>{GALLERY_MOTION_LABELS[preset]}</option>)}</select><label aria-label={`${label}時間`} className={css.timePair}><SecondsTimingControl seconds={timing[key]} max={GALLERY_TIMING_MAX_SECONDS} onChange={seconds => update(key, seconds)}/></label></div>; })}</div>
    <div className={css.actions}>
      <button type="button" className="cms-secondary-button" onClick={() => { setOpen(true); setReplay(value => value + 1); }}>預覽進場動畫</button>
      <button type="button" className="cms-secondary-button" onClick={() => onChange(undefined)}>恢復預設時間</button>
      {open ? <><button type="button" aria-pressed={device === 'desktop'} onClick={() => { setDevice('desktop'); setReplay(value => value + 1); }}>桌機預覽</button><button type="button" aria-pressed={device === 'mobile'} onClick={() => { setDevice('mobile'); setReplay(value => value + 1); }}>手機預覽</button></> : null}
    </div>
    <p>預覽使用目前未儲存的動畫、文案與時間；重播不會儲存。按「儲存變更」後才會更新前台。</p>
    {open && draft ? <div className={`${css.preview} ${device === 'mobile' ? gallery.previewMobile : gallery.previewDesktop}`} aria-label="作品詮釋草稿預覽" onClickCapture={event => { if ((event.target as Element).closest('a')) event.preventDefault(); }}>
      <GalleryStage key={`${work.slug}-${replay}`} work={draft} active index={0} total={1} previewDevice={device}/>
      {!draft.stageVideo && !draft.mobileVideo ? <small>目前使用靜態圖片，文案仍依設定時間進場；減少動態偏好會優先顯示內容。</small> : null}
    </div> : null}
  </section>;
}
