export const GALLERY_SEO_TITLE = '作品詮釋｜以藝術閱讀咖啡風味｜KD Coffee 咖啡藝術工坊';
export const GALLERY_SEO_DESCRIPTION = '走進 KD Coffee 咖啡藝術工坊的作品詮釋，透過動畫、藝術氛圍與感官敘事，慢慢探索每一支咖啡的情緒與風景。從晨光、花園到深夜的鮮明色彩，感受作品與香氣的連結，再走進完整的咖啡故事，找到適合此刻心情的一杯。';
export type GallerySeoSettings = { title?: string; description?: string; ogTitle?: string; ogDescription?: string; ogImageAssetId?: string };
export const GALLERY_SEO_TEXT_LIMITS = { title: 200, description: 600, ogTitle: 200, ogDescription: 600 } as const;

export function normalizeGallerySeo(value: unknown): GallerySeoSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Gallery SEO 設定格式不正確。');
  const source = value as Record<string, unknown>, result: GallerySeoSettings = {};
  for (const key of Object.keys(source)) {
    if (key !== 'ogImageAssetId' && !Object.hasOwn(GALLERY_SEO_TEXT_LIMITS, key)) throw new Error('包含不支援的 SEO 設定欄位。');
  }
  for (const key of Object.keys(GALLERY_SEO_TEXT_LIMITS) as Array<keyof typeof GALLERY_SEO_TEXT_LIMITS>) {
    if (!Object.hasOwn(source, key)) continue;
    const text = source[key];
    if (typeof text !== 'string' || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) throw new Error('SEO 文案必須是純文字。');
    if (Array.from(text.trim()).length > GALLERY_SEO_TEXT_LIMITS[key]) throw new Error(`SEO 標題最多 200 字元，描述最多 600 字元；請精簡後再儲存。`);
    result[key] = text.trim();
  }
  if (source.ogImageAssetId !== undefined && source.ogImageAssetId !== '') {
    if (typeof source.ogImageAssetId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(source.ogImageAssetId)) throw new Error('請從素材庫選擇分享圖片。');
    result.ogImageAssetId = source.ogImageAssetId;
  }
  return result;
}

export function resolveGallerySeo(value?: unknown) {
  let saved: GallerySeoSettings = {};
  try { if (value !== undefined) saved = normalizeGallerySeo(value); } catch { /* Approved defaults for absent/invalid legacy configuration. */ }
  const title = saved.title || GALLERY_SEO_TITLE, description = saved.description || GALLERY_SEO_DESCRIPTION;
  return { title, description, ogTitle: saved.ogTitle || title, ogDescription: saved.ogDescription || description, ogImageAssetId: saved.ogImageAssetId };
}
