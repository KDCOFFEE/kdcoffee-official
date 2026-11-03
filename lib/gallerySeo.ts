import type { Metadata } from 'next';
import type { GalleryWork } from './galleryWorks';
import type { AssetRecord } from './assets';
import { isGalleryBackgroundAsset } from './galleryAtmosphere';
import { resolveGallerySeo } from './gallerySeoSettings';
export { GALLERY_SEO_TITLE, GALLERY_SEO_DESCRIPTION } from './gallerySeoSettings';

export function resolveGallerySeoImage(value: unknown, assets: readonly AssetRecord[], fallback?: { path: string; alt?: string; status?: string } | null) {
  const seo = resolveGallerySeo(value);
  const selected = assets.find(asset => asset.id === seo.ogImageAssetId && isGalleryBackgroundAsset(asset));
  if (selected) return selected;
  return fallback?.status === 'active' && /^\/uploads\/assets\/[a-z0-9/_-]+\.(?:png|jpe?g|webp|avif)$/i.test(fallback.path) && !fallback.path.includes('..') ? fallback : undefined;
}
export function galleryMetadata(origin: string, image?: { path: string; alt?: string; status?: string } | null, value?: unknown, assets: readonly AssetRecord[] = []): Metadata {
  const url = new URL('/gallery', origin).href;
  const seo = resolveGallerySeo(value), asset = resolveGallerySeoImage(value, assets, image);
  const safeImage = asset ? { url: new URL(asset.path, origin).href, alt: asset.alt || 'KD Coffee 咖啡藝術工坊' } : undefined;
  return {
    title: { absolute: seo.title }, description: seo.description,
    alternates: { canonical: url }, robots: { index: true, follow: true },
    openGraph: { title: seo.ogTitle, description: seo.ogDescription, type: 'website', locale: 'zh_TW', url, ...(safeImage ? { images: [safeImage] } : {}) },
    twitter: { card: 'summary_large_image', title: seo.ogTitle, description: seo.ogDescription, ...(safeImage ? { images: [safeImage.url] } : {}) },
  };
}
export function galleryStructuredData(origin: string, works: readonly GalleryWork[], value?: unknown) {
  const url = new URL('/gallery', origin).href;
  const seo = resolveGallerySeo(value);
  return {
    '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': url + '#collection',
    name: seo.title, description: seo.description, url,
    publisher: { '@type': 'Organization', name: 'KD Coffee 咖啡藝術工坊', url: new URL('/', origin).href },
    mainEntity: { '@type': 'ItemList', '@id': url + '#works', numberOfItems: works.length,
      itemListElement: works.map((work, index) => ({ '@type': 'ListItem', position: index + 1, name: work.title, url: new URL('/works/' + encodeURIComponent(work.slug), origin).href })) },
  };
}
export function serializeGalleryStructuredData(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
