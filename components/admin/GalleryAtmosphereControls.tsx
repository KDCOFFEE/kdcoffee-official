'use client';
import { useState } from 'react';
import type { AssetRecord } from '@/lib/assets';
import { localImageMedia } from '@/lib/media';
import { DEFAULT_GALLERY_ATMOSPHERE, isGalleryBackgroundAsset, normalizeGalleryAtmosphere, resolveGalleryAtmosphere, type GalleryAtmosphere } from '@/lib/galleryAtmosphere';
import MediaUploader from './MediaUploader';
import ImageLibraryPicker from './ImageLibraryPicker';
import css from './GalleryAtmosphereControls.module.css';

export default function GalleryAtmosphereControls({ value, version, assets, onSaved }: { value?: GalleryAtmosphere; version: number; assets: AssetRecord[]; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<GalleryAtmosphere>({ ...DEFAULT_GALLERY_ATMOSPHERE, ...value });
  const [library, setLibrary] = useState(assets), [picker, setPicker] = useState(false), [message, setMessage] = useState(''), [saving, setSaving] = useState(false);
  const resolved = resolveGalleryAtmosphere(draft, library), image = resolved.imageUrl ? localImageMedia(resolved.imageUrl) : undefined;
  async function upload(file: File) {
    const form = new FormData(); form.append('file', file);
    const response = await fetch('/api/admin/pages/images', { method: 'POST', body: form });
    const result = await response.json();
    if (!response.ok || !result.asset || !result.media) throw new Error(result.error || '圖片上傳失敗。');
    if (!isGalleryBackgroundAsset(result.asset)) throw new Error('請選擇可用的網站圖片。');
    setLibrary(current => [result.asset, ...current.filter(asset => asset.id !== result.asset.id)]);
    setDraft(current => ({ ...current, imageAssetId: result.asset.id }));
    return result.media;
  }
  function change(key: 'strength' | 'darkness' | 'blur', n: number) {
    const max = key === 'blur' ? 20 : 100;
    setDraft(current => normalizeGalleryAtmosphere({ ...current, [key]: Math.round(Math.max(0, Math.min(max, Number.isFinite(n) ? n : 0))) }));
  }
  async function save() {
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/admin/pages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'galleryAtmosphere', version, atmosphere: normalizeGalleryAtmosphere(draft) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || '儲存失敗。');
      await onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : '儲存失敗。'); }
    finally { setSaving(false); }
  }
  return <section className={css.section} aria-label="Gallery 展間背景">
    <header><div><p className="eyebrow dark">系統頁面 · /gallery</p><h2>Gallery 展間背景</h2><p>全頁共用，從 Header 下方延伸到作品索引；不影響作品動畫與 Footer。</p></div><a href="/gallery" target="_blank" rel="noreferrer">查看作品詮釋頁 ↗</a></header>
    <div className={css.grid}>
      <div><MediaUploader label="背景圖片（僅限圖片）" imageOnly usage="content" value={image} onImageUpload={upload} onChange={() => { /* Upload resolves the canonical Asset ID above. */ }} onRemove={() => setDraft(current => { const next = { ...current }; delete next.imageAssetId; return next; })}/>
        <button type="button" className="cms-secondary-button" onClick={() => setPicker(true)}>選擇既有媒體</button>
        <p>未設定圖片時，保留既有暖褐色與拱窗 CSS 展間。圖片置中顯示，手機自動降低強度。</p>
      </div>
      <div className={css.controls}>{([['strength', '背景強度', 100, '%'], ['darkness', '背景暗化程度', 100, '%'], ['blur', '模糊程度', 20, 'px']] as const).map(([key, label, max, unit]) => <label key={key}><span>{label}</span><input type="range" min="0" max={max} step="1" value={resolved[key]} onChange={event => change(key, Number(event.target.value))}/><span><input type="number" min="0" max={max} step="1" value={resolved[key]} onChange={event => change(key, Number(event.target.value))}/>{unit}</span></label>)}
        <div className={css.preview} aria-label="展間背景草稿預覽"><span style={{ backgroundImage: image ? `url("${resolved.imageUrl}")` : undefined, opacity: resolved.strength / 100, filter: `blur(${resolved.blur}px) brightness(${1 - resolved.darkness / 100})` }}/><p>WORKS<br/>作品詮釋展間</p></div>
      </div>
    </div>
    <footer><button type="button" className="cms-primary-button" disabled={saving} onClick={() => void save()}>{saving ? '儲存中…' : '儲存 Gallery 背景'}</button><small>此設定獨立儲存，不修改個別作品或其他頁面。</small>{message ? <p role="alert">{message}</p> : null}</footer>
    {picker ? <ImageLibraryPicker title="選擇 Gallery 背景圖片" assets={library.filter(isGalleryBackgroundAsset)} onClose={() => setPicker(false)} onChoose={asset => { setDraft(current => ({ ...current, imageAssetId: asset.id })); setPicker(false); }}/>: null}
  </section>;
}
