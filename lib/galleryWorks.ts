import { resolveAssetAlt } from "./assetMetadata";
import { normalizeGalleryRevealAnimation, type GalleryRevealAnimation } from './galleryRevealAnimation';
import { normalizeGalleryRevealTiming, type GalleryRevealTiming } from './galleryRevealTiming';
import { readGalleryEditorial } from './galleryEditorial';
import type { CoffeeArtwork } from '@/data/websiteData';
import { resolveWorksProductListing } from './productListing';
import { getProductMediaAsset, resolveHeroAsset, resolveListAsset, resolveStaticProductImage } from './productVisualAssets';
import { resolveWorksProductPageContent, resolveProductPageContent } from './productPageContent';
import { isSafeCleanRoastingMediaSource } from './cleanRoastingMedia';

export type GalleryWork = {
  slug: string; title: string; englishTitle: string; artist: string;
  revealAnimation?: GalleryRevealAnimation;
  revealTiming?: GalleryRevealTiming;
  hook: string; interpretation: string; coffeeBridge: string;
  stageImage: string; stageVideo: string; mobileVideo: string; mobilePosterImage: string; posterImage: string; thumbnailImage: string;
  imageAlt: string; posterAlt?: string; published: true; sortOrder: number;
};

function publicMedia(value: unknown, kind: 'image' | 'video') {
  if (typeof value !== 'string' || !isSafeCleanRoastingMediaSource(value) || value.includes('..')) return '';
  const source = value.trim();
  if (/%(?:2e|2f|5c|00)/i.test(source)) return '';
  if (source.startsWith('/') && !/^\/(?:uploads\/(?:artworks|assets)\/|images\/|videos\/)/.test(source)) return '';
  try { const url = new URL(source, 'https://www.kdcoffee1962.com');
    return (kind === 'video' ? /\.(mp4|webm|mov)$/i : /\.(jpe?g|png|webp|avif)$/i).test(url.pathname) ? source : '';
  } catch { return ''; }
}

/** Read-only exhibition projection. The existing listing and editorial models remain authoritative. */
export function resolveGalleryWorks(products: readonly CoffeeArtwork[]): GalleryWork[] {
  return resolveWorksProductListing(products).filter(p => /^[a-z0-9][a-z0-9-]*$/.test(p.slug)).map(product => {
    let content;
    try { content = resolveWorksProductPageContent(product); }
    catch { content = resolveProductPageContent(product); }
    const hero = content['product-hero'];
    const media = getProductMediaAsset(product, 'galleryDesktopAnimation');
    const mobile = getProductMediaAsset(product, 'galleryMobileAnimation');
    const image = resolveHeroAsset(product), list = resolveListAsset(product);
    const workImage = publicMedia(resolveStaticProductImage(product), 'image') || publicMedia(list?.path, 'image') || publicMedia(image?.path, 'image');
    const posterImage = publicMedia(media?.posterUrl, 'image') || workImage;
    const stageImage = publicMedia(media?.type === 'image' ? media.url : '', 'image') || workImage || posterImage;
    const editorial = readGalleryEditorial(product.galleryEditorial);
    let revealTiming: GalleryRevealTiming | undefined;
    try { revealTiming = normalizeGalleryRevealTiming(product.galleryRevealTiming); } catch { /* Old or invalid timing uses safe defaults. */ }
    let revealAnimation: GalleryRevealAnimation | undefined;
    try { revealAnimation = normalizeGalleryRevealAnimation(product.galleryRevealAnimation); } catch { /* Use the approved default motion. */ }
    const hook = editorial.hook || hero.lead || product.shortCopy || product.subtitle || '';
    const story = hero.storyLead || product.mood || '';
    const imageAlt = resolveAssetAlt(Object.values(product.assets || {}).find(asset => asset?.path === stageImage || (asset?.media?.type === "image" && asset.media.url === stageImage)) || {}) || `${hero.title || product.name || "咖啡作品"}作品視覺`;
    return {
      slug: product.slug, title: hero.title || product.name || '咖啡作品', englishTitle: hero.englishTitle || '', artist: hero.artist || '',
      ...(revealAnimation ? { revealAnimation } : {}),
      ...(revealTiming ? { revealTiming } : {}),
      hook, interpretation: editorial.interpretation || (story === hook ? '' : story), coffeeBridge: editorial.coffeeBridge || '',
      stageImage, stageVideo: media?.type === 'video' ? publicMedia(media.url, 'video') : '',
      mobileVideo: mobile?.type === 'video' ? publicMedia(mobile.url, 'video') : '', mobilePosterImage: publicMedia(mobile?.posterUrl, 'image'), posterImage: posterImage || stageImage,
      thumbnailImage: publicMedia(list?.path, 'image') || posterImage || stageImage,
      imageAlt,
      posterAlt: publicMedia(media?.posterUrl, "image") ? `${hero.title || product.name || "咖啡作品"}作品詮釋影片封面` : imageAlt,
      published: true, sortOrder: Number(product.sort || 0),
    };
  });
}
