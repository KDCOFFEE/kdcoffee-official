import "server-only";
import type { HomepageSeo } from "./pageBuilder";
import type { ServiceConfig } from "./customerServiceContent";
import { resolveServiceHero } from "./customerServiceHeroServer";
import { assertAssetImageAvailable } from "./assetImages";
import { BRAND_DESCRIPTION, safeSocialImage, socialPageMetadata } from "./socialMetadata";
import { withSiteSocialImage } from "./siteSocialImage";

const HOMEPAGE_TITLE = "KD 咖啡藝術工坊｜KD Coffee 精品咖啡";

export async function resolveHomepageSearchAndShare(seo?: HomepageSeo) {
  const title = seo?.title?.trim() || HOMEPAGE_TITLE;
  const description = seo?.description?.trim() || BRAND_DESCRIPTION;
  let image = safeSocialImage(seo?.socialImage?.path) ? seo?.socialImage : undefined;
  if (image) {
    try { await assertAssetImageAvailable(image.path, false); }
    catch { image = undefined; }
  }
  const metadata = await withSiteSocialImage(socialPageMetadata({
    path: "/", title, description, images: [image?.path], imageAlt: image?.alt,
  }));
  const share = metadata.openGraph as { images: { url: string; alt?: string }[] };
  return {
    metadata,
    effective: { title, description: metadata.description || BRAND_DESCRIPTION, image: share.images[0], imageIsCustom: Boolean(image) },
    defaults: { title: HOMEPAGE_TITLE, description: BRAND_DESCRIPTION },
  };
}

export async function homepageSocialMetadata(seo?: HomepageSeo) {
  return (await resolveHomepageSearchAndShare(seo)).metadata;
}

export async function customerServiceSocialMetadata(config: ServiceConfig) {
  const hero = config.hero ? await resolveServiceHero(config.hero) : undefined;
  let heroImage: string | undefined;
  if (hero) {
    try { await assertAssetImageAvailable(hero.src, false); heroImage = hero.src; }
    catch { /* An unavailable legacy/default Hero must not become a 404 OG image. */ }
  }
  return withSiteSocialImage(socialPageMetadata({ path: "/customer-service", title: `${config.title}｜KD 咖啡藝術工坊`,
    description: config.intro, images: [config.socialImage?.path, heroImage], imageAlt: config.socialImage?.alt || hero?.alt }));
}
