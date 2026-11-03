import 'server-only';
import { getAssetLibrary } from './assets';
import { readPageStore } from './pageBuilderStore';
import { getPagesDataFile } from './storagePaths';
import { atomicWriteJson, withFileLock } from './jsonFileStore';
import { normalizeGalleryAtmosphere, isGalleryBackgroundAsset } from './galleryAtmosphere';
import { normalizeGallerySeo } from './gallerySeoSettings';

export class GalleryPageVersionConflictError extends Error {}
/** The existing systemPages storage and version/lock protocol; no new file/database. */
export async function saveGalleryAtmosphere(version: unknown, input: unknown) {
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) throw new Error('頁面版本格式不正確。');
  const atmosphere = normalizeGalleryAtmosphere(input);
  const path = getPagesDataFile();
  return withFileLock(path, async () => {
    const [store, library] = await Promise.all([readPageStore(), getAssetLibrary()]);
    if (store.version !== version) throw new GalleryPageVersionConflictError('資料已更新，請重新整理後再儲存。');
    if (atmosphere.imageAssetId && !library.assets.some(asset => asset.id === atmosphere.imageAssetId && isGalleryBackgroundAsset(asset))) throw new Error('圖片不存在或不適用，請重新從素材庫選擇。');
    store.systemPages = { ...store.systemPages, gallery: { ...store.systemPages?.gallery, atmosphere } };
    store.version += 1; store.updatedAt = new Date().toISOString();
    await atomicWriteJson(path, store);
    return { version: store.version, gallery: store.systemPages.gallery };
  });
}

/** Saves only Gallery SEO, under the same PageStore lock and optimistic version contract. */
export async function saveGallerySeo(version: unknown, input: unknown) {
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) throw new Error('頁面版本格式不正確。');
  const seo = normalizeGallerySeo(input);
  const path = getPagesDataFile();
  return withFileLock(path, async () => {
    const [store, library] = await Promise.all([readPageStore(), getAssetLibrary()]);
    if (store.version !== version) throw new GalleryPageVersionConflictError('資料已更新，請重新整理後再儲存。');
    if (seo.ogImageAssetId && !library.assets.some(asset => asset.id === seo.ogImageAssetId && isGalleryBackgroundAsset(asset))) throw new Error('分享圖片不存在或不適用，請重新從素材庫選擇。');
    store.systemPages = { ...store.systemPages, gallery: { ...store.systemPages?.gallery, seo } };
    store.version += 1; store.updatedAt = new Date().toISOString();
    await atomicWriteJson(path, store);
    return { version: store.version, gallery: store.systemPages.gallery };
  });
}
