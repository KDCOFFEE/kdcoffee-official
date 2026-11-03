'use client';
import Image from 'next/image';
import { useState } from 'react';
import type { AssetRecord } from '@/lib/assets';
import { GALLERY_SEO_TITLE, GALLERY_SEO_DESCRIPTION, normalizeGallerySeo, resolveGallerySeo, type GallerySeoSettings } from '@/lib/gallerySeoSettings';
import { resolveGallerySeoImage } from '@/lib/gallerySeo';
import { getCanonicalPublicSiteOrigin } from '@/lib/publicSiteOrigin';
import SocialImageField from './SocialImageField';
import css from './GallerySeoControls.module.css';

export default function GallerySeoControls({ value, version, assets, onSaved }: { value?: GallerySeoSettings; version: number; assets: AssetRecord[]; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<GallerySeoSettings>({ ...value });
  const [saving, setSaving] = useState(false), [uploading, setUploading] = useState(false), [message, setMessage] = useState('');
  const [availableAssets, setAvailableAssets] = useState(assets);
  const effective = resolveGallerySeo(draft), image = resolveGallerySeoImage(draft, availableAssets, availableAssets.find(asset => asset.id === 'LOGO005' && asset.status === 'active') || availableAssets.find(asset => asset.id === 'LOGO001'));
  const url = `${getCanonicalPublicSiteOrigin()}/gallery`;
  async function save() {
    setSaving(true); setMessage('');
    try {
      const seo = normalizeGallerySeo(draft);
      const response = await fetch('/api/admin/pages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'gallerySeo', version, seo }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || '設定尚未儲存，請稍後再試。');
      await onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : '儲存失敗。'); }
    finally { setSaving(false); }
  }
  const fields = [
    ['title', '搜尋結果標題', '搜尋引擎可能顯示的頁面標題。建議約 25–60 字元；留空使用預設。', GALLERY_SEO_TITLE],
    ['description', '搜尋結果說明', 'Google 等搜尋結果可能顯示的頁面摘要。建議約 70–160 個中文字元；留空使用預設。', GALLERY_SEO_DESCRIPTION],
    ['ogTitle', '社群分享標題', '選填；留空沿用搜尋結果標題。', effective.title],
    ['ogDescription', '社群分享描述', '選填；留空沿用搜尋結果說明。', effective.description],
  ] as const;
  return <section className={css.section} aria-label="藝廊搜尋與分享設定">
    <header><h2>藝廊搜尋與分享設定</h2><p>調整搜尋摘要與 LINE、Facebook 等平台分享時可能使用的標題、描述與圖片。預覽不會自動儲存。</p></header>
    <div className={css.grid}>
      <div className={css.fields}>{fields.map(([key, label, help, fallback]) => <label key={key}>
        <span>{label}{key.startsWith('og') ? '（選填）' : ''}</span><small>{help}</small>
        {key === 'title' || key === 'ogTitle' ? <input aria-label={label} value={draft[key] ?? (key === 'title' ? GALLERY_SEO_TITLE : '')} placeholder={fallback} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))}/>
          : <textarea aria-label={label} rows={3} value={draft[key] ?? (key === 'description' ? GALLERY_SEO_DESCRIPTION : '')} placeholder={fallback} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))}/>}
        <small>{Array.from(draft[key] ?? (key === 'title' ? GALLERY_SEO_TITLE : key === 'description' ? GALLERY_SEO_DESCRIPTION : '')).length} 字元</small>
      </label>)}
      <SocialImageField label="藝廊分享圖片" value={draft.ogImageAssetId && availableAssets.find(asset=>asset.id===draft.ogImageAssetId) ? {path:availableAssets.find(asset=>asset.id===draft.ogImageAssetId)!.path,alt:availableAssets.find(asset=>asset.id===draft.ogImageAssetId)!.alt} : undefined} assets={availableAssets} disabled={saving||uploading} onBusy={setUploading} help="未設定時，會使用藝廊背景圖片；若無可用圖片，再使用全站預設分享圖片。" onUploaded={asset=>setAvailableAssets(current=>[asset,...current])} onChange={image=>setDraft(current=>({...current,ogImageAssetId:image?.assetId}))}/>
      </div>
      <aside className={css.previews}>
        <section className={css.search} aria-label="搜尋預覽"><h3>搜尋預覽</h3><small>{url}</small><p className={css.searchTitle}>{effective.title}</p><p>{effective.description}</p></section>
        <section className={css.social} aria-label="社群分享預覽"><h3>社群分享預覽</h3>{image ? <Image src={image.path} alt={image.alt || '社群分享圖片預覽'} width={640} height={360} unoptimized/> : null}<div><small>kdcoffee1962.com</small><strong>{effective.ogTitle}</strong><p>{effective.ogDescription}</p></div></section>
        <p className={css.notice}>預覽僅供參考，搜尋引擎與分享平台可能自行調整呈現。公開網址由網站固定管理。</p>
      </aside>
    </div>
    <footer><button type="button" onClick={() => void save()} disabled={saving||uploading}>{saving ? '儲存中…' : '儲存設定'}</button><small>此設定只用於藝廊的搜尋結果與社群分享。</small>{message ? <p role="alert">{message}</p> : null}</footer>

  </section>;
}
