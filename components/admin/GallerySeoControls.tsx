'use client';
import Image from 'next/image';
import { useState } from 'react';
import type { AssetRecord } from '@/lib/assets';
import { isGalleryBackgroundAsset } from '@/lib/galleryAtmosphere';
import { GALLERY_SEO_TITLE, GALLERY_SEO_DESCRIPTION, normalizeGallerySeo, resolveGallerySeo, type GallerySeoSettings } from '@/lib/gallerySeoSettings';
import { resolveGallerySeoImage } from '@/lib/gallerySeo';
import { getCanonicalPublicSiteOrigin } from '@/lib/publicSiteOrigin';
import ImageLibraryPicker from './ImageLibraryPicker';
import css from './GallerySeoControls.module.css';

export default function GallerySeoControls({ value, version, assets, onSaved }: { value?: GallerySeoSettings; version: number; assets: AssetRecord[]; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<GallerySeoSettings>({ ...value });
  const [picker, setPicker] = useState(false), [saving, setSaving] = useState(false), [message, setMessage] = useState('');
  const effective = resolveGallerySeo(draft), image = resolveGallerySeoImage(draft, assets, assets.find(asset => asset.id === 'LOGO001'));
  const url = `${getCanonicalPublicSiteOrigin()}/gallery`;
  async function save() {
    setSaving(true); setMessage('');
    try {
      const seo = normalizeGallerySeo(draft);
      const response = await fetch('/api/admin/pages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'gallerySeo', version, seo }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || '儲存 SEO 設定失敗。');
      await onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : '儲存失敗。'); }
    finally { setSaving(false); }
  }
  const fields = [
    ['title', 'SEO 標題', '搜尋引擎可能顯示的頁面標題。建議約 25–60 字元；留空使用預設。', GALLERY_SEO_TITLE],
    ['description', 'SEO 描述', 'Google 等搜尋結果可能顯示的頁面摘要。建議約 70–160 個中文字元；留空使用預設。', GALLERY_SEO_DESCRIPTION],
    ['ogTitle', '社群分享標題', '選填；留空沿用 SEO 標題。', effective.title],
    ['ogDescription', '社群分享描述', '選填；留空沿用 SEO 描述。', effective.description],
  ] as const;
  return <section className={css.section} aria-label="Gallery SEO 設定">
    <header><h2>Gallery SEO 設定</h2><p>調整搜尋摘要與 LINE、Facebook 等平台分享時可能使用的標題、描述與圖片。預覽不會自動儲存。</p></header>
    <div className={css.grid}>
      <div className={css.fields}>{fields.map(([key, label, help, fallback]) => <label key={key}>
        <span>{label}{key.startsWith('og') ? '（選填）' : ''}</span><small>{help}</small>
        {key === 'title' || key === 'ogTitle' ? <input aria-label={label} value={draft[key] ?? (key === 'title' ? GALLERY_SEO_TITLE : '')} placeholder={fallback} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))}/>
          : <textarea aria-label={label} rows={3} value={draft[key] ?? (key === 'description' ? GALLERY_SEO_DESCRIPTION : '')} placeholder={fallback} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))}/>}
        <small>{Array.from(draft[key] ?? (key === 'title' ? GALLERY_SEO_TITLE : key === 'description' ? GALLERY_SEO_DESCRIPTION : '')).length} 字元</small>
      </label>)}
      <div className={css.imageField}><strong>社群分享圖片（選填）</strong><p>從既有素材庫選取圖片；未設定或圖片已不可用時，沿用網站預設分享圖片。</p><button type="button" className="cms-secondary-button" onClick={() => setPicker(true)}>選擇分享圖片</button>{draft.ogImageAssetId ? <button type="button" className="cms-secondary-button" onClick={() => setDraft(current => { const next = { ...current }; delete next.ogImageAssetId; return next; })}>移除自選圖片</button> : null}</div>
      </div>
      <aside className={css.previews}>
        <section className={css.search} aria-label="搜尋預覽"><h3>搜尋預覽</h3><small>{url}</small><p className={css.searchTitle}>{effective.title}</p><p>{effective.description}</p></section>
        <section className={css.social} aria-label="社群分享預覽"><h3>社群分享預覽</h3>{image ? <Image src={image.path} alt={image.alt || '社群分享圖片預覽'} width={640} height={360} unoptimized/> : null}<div><small>kdcoffee1962.com</small><strong>{effective.ogTitle}</strong><p>{effective.ogDescription}</p></div></section>
        <p className={css.notice}>預覽僅供參考，搜尋引擎與分享平台可能自行調整呈現。公開網址由網站固定管理。</p>
      </aside>
    </div>
    <footer><button type="button" onClick={() => void save()} disabled={saving}>{saving ? '儲存中…' : '儲存 Gallery SEO'}</button><small>只儲存本頁 SEO，不影響展間背景、作品或其他頁面。</small>{message ? <p role="alert">{message}</p> : null}</footer>
    {picker ? <ImageLibraryPicker title="選擇社群分享圖片" assets={assets.filter(isGalleryBackgroundAsset)} onClose={() => setPicker(false)} onChoose={asset => { setDraft(current => ({ ...current, ogImageAssetId: asset.id })); setPicker(false); }}/> : null}
  </section>;
}
