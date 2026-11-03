import type { AssetRecord } from './assets';
// @ts-expect-error -- native Node Page Builder tests require explicit extensions.
import { normalizeGallerySeo, type GallerySeoSettings } from './gallerySeoSettings.ts';

export type GalleryAtmosphere = { imageAssetId?: string; strength?: number; darkness?: number; blur?: number };
export type GalleryPageSettings = { atmosphere?: GalleryAtmosphere; seo?: GallerySeoSettings };
export const DEFAULT_GALLERY_ATMOSPHERE = { strength: 25, darkness: 55, blur: 8 } as const;
export function normalizeGalleryAtmosphere(value: unknown): GalleryAtmosphere {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Gallery 展間背景格式不正確。');
  const source = value as Record<string, unknown>, result: GalleryAtmosphere = {};
  if (source.imageAssetId !== undefined) {
    if (typeof source.imageAssetId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(source.imageAssetId)) throw new Error('請選擇既有素材庫圖片。');
    result.imageAssetId = source.imageAssetId;
  }
  for (const key of ['strength', 'darkness', 'blur'] as const) {
    if (!Object.hasOwn(source, key)) continue;
    const number = source[key], max = key === 'blur' ? 20 : 100;
    if (typeof number !== 'number' || !Number.isInteger(number) || number < 0 || number > max) throw new Error('背景強度、暗化或模糊超出範圍。');
    result[key] = number;
  }
  return result;
}
export function validateGalleryPageSettings(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Gallery 頁面設定格式不正確。');
  const config = value as GalleryPageSettings;
  if (config.atmosphere !== undefined) normalizeGalleryAtmosphere(config.atmosphere);
  if (config.seo !== undefined) normalizeGallerySeo(config.seo);
}
export function isGalleryBackgroundAsset(asset: AssetRecord) {
  return asset.status === 'active' && /^\/(?:uploads\/(?:assets|artworks)\/|images\/)/.test(asset.path)
    && !/[\\\u0000-\u001f"'<>?#]|\.\.|%(?:2e|2f|5c|00)/i.test(asset.path) && /\.(?:jpe?g|png|webp|avif)$/i.test(asset.path);
}
export function resolveGalleryAtmosphere(value: unknown, assets: readonly AssetRecord[]) {
  let config: GalleryAtmosphere = {};
  try { if (value !== undefined) config = normalizeGalleryAtmosphere(value); } catch { /* Safe CSS room fallback. */ }
  const asset = assets.find(item => item.id === config.imageAssetId && isGalleryBackgroundAsset(item));
  return { ...DEFAULT_GALLERY_ATMOSPHERE, ...config, imageUrl: asset?.path || '' };
}
