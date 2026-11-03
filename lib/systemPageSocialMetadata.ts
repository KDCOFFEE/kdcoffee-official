import "server-only";
import type { SocialImageValue } from "./socialImageSettings";
import type { ServiceConfig } from "./customerServiceContent";
import { resolveServiceHero } from "./customerServiceHeroServer";
import { assertAssetImageAvailable } from "./assetImages";
import { BRAND_DESCRIPTION, socialPageMetadata } from "./socialMetadata";
import { withSiteSocialImage } from "./siteSocialImage";

export function homepageSocialMetadata(image?: SocialImageValue) {
  return withSiteSocialImage(socialPageMetadata({ path: "/", title: "KD 咖啡藝術工坊｜KD Coffee 精品咖啡",
    description: BRAND_DESCRIPTION, images: [image?.path], imageAlt: image?.alt }));
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
