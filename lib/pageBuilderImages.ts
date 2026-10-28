/** Compatibility exports: Page Builder / Works retain the exact existing shared behavior. */
// @ts-expect-error Node strip-types tests require the explicit extension.
export { WEBSITE_IMAGE_CATEGORY as PAGE_BUILDER_IMAGE_CATEGORY, WEBSITE_IMAGE_MAX_BYTES as PAGE_BUILDER_IMAGE_MAX_BYTES, WEBSITE_IMAGE_MAX_DIMENSION as PAGE_BUILDER_IMAGE_MAX_DIMENSION, validateWebsiteImageFile as validatePageBuilderImageFile, optimizeWebsiteImage as optimizePageBuilderImage, websiteImageIdentity as pageBuilderImageIdentity, createWebsiteImageAsset as createPageBuilderAsset } from "./websiteImages.ts";
