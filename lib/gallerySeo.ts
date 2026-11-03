import { socialPageMetadata, safeSocialImage } from "./socialMetadata";
import type { Metadata } from 'next';
import type { GalleryWork } from './galleryWorks';
import type { AssetRecord } from './assets';
import { isGalleryBackgroundAsset } from './galleryAtmosphere';
import { resolveGallerySeo } from './gallerySeoSettings';
export { GALLERY_SEO_TITLE, GALLERY_SEO_DESCRIPTION } from './gallerySeoSettings';

export function resolveGallerySeoImage(value: unknown, assets: readonly AssetRecord[], fallback?: { path: string; alt?: string; status?: string } | null) {
  const seo = resolveGallerySeo(value);
  const selected = assets.find(asset => asset.id === seo.ogImageAssetId && isGalleryBackgroundAsset(asset) && safeSocialImage(asset.path));
  if (selected) return selected;
  return fallback?.status === 'active' && fallback.path.startsWith('/') && safeSocialImage(fallback.path) ? fallback : undefined;
}
export function galleryMetadata(origin: string, image?: { path: string; alt?: string; status?: string } | null, value?: unknown, assets: readonly AssetRecord[] = []): Metadata {
  const seo = resolveGallerySeo(value), asset = resolveGallerySeoImage(value, assets, image);
  const metadata = socialPageMetadata({ path: '/gallery', title: seo.title, description: seo.description, images: [asset?.path], imageAlt: asset?.alt });
  const social = socialPageMetadata({ path: '/gallery', title: seo.ogTitle, description: seo.ogDescription, images: [asset?.path], imageAlt: asset?.alt });
  return { ...metadata, openGraph: social.openGraph, twitter: social.twitter, robots: { index: true, follow: true } };
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
