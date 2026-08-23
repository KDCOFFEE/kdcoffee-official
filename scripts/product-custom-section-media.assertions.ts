import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCustomSectionMediaPublicId,
  isCustomSectionMediaPublicId,
  nextAvailableCustomSectionMediaSequence,
} from "../lib/customSectionMediaNaming";
import { collectCloudinaryVideoUsage } from "../lib/cloudinaryMediaUsageCore";
import {
  getProductCustomSectionAnimationAttributes,
  productCustomSectionAnchor,
  resolveProductCustomSectionSlot,
} from "../lib/productCustomSections";
import {
  ProductCustomSectionsValidationError,
  normalizeProductCustomSections,
  resolveProductCustomSections,
} from "../lib/productCustomSectionsValidation";
import { buildProductMediaPublicId } from "../lib/productMediaNaming";
import type { ProductCustomSectionMedia } from "../lib/productCustomSections";

const CS1 = "cs-11111111-1111-4111-8111-111111111111";
const CS2 = "cs-22222222-2222-4222-8222-222222222222";
const FI1 = "fi-11111111-1111-4111-8111-111111111111";
const productSlug = "coffee-created-next-year";
const imageName = buildCustomSectionMediaPublicId({ productSlug, sectionId: CS1, mediaType: "image", sequence: 1 });
const featureImageName = buildCustomSectionMediaPublicId({ productSlug, sectionId: CS2, mediaType: "image", sequence: 1 });
const videoName = buildCustomSectionMediaPublicId({ productSlug, sectionId: CS1, mediaType: "video", sequence: 1 });
const imagePublicId = `kd-coffee/images/${imageName}`;
const videoPublicId = `kd-coffee/videos/${videoName}`;
const imageAsset = {
  type: "image" as const,
  url: `https://res.cloudinary.com/demo/image/upload/c_limit,q_auto,w_2400/v1/${imagePublicId}.webp`,
  provider: "cloudinary" as const,
  publicId: imagePublicId,
  width: 1600,
  height: 1200,
  bytes: 450_000,
  format: "webp",
};
const videoAsset = {
  type: "video" as const,
  url: `https://res.cloudinary.com/demo/video/upload/c_limit,q_auto,vc_h264:high:4.0,w_1920/v1/${videoPublicId}.mp4`,
  provider: "cloudinary" as const,
  publicId: videoPublicId,
  posterUrl: `https://res.cloudinary.com/demo/video/upload/c_limit,f_auto,q_auto,w_1600/v1/${videoPublicId}.jpg`,
  width: 1920,
  height: 1080,
  duration: 28.5,
  bytes: 8_400_000,
  format: "mp4",
};
const textSection = { id: CS1, adminName: "Story", enabled: true, type: "text", placement: "after_profile", order: 20, layout: "standard", content: { heading: "A heading", body: "A body" } };
const featuresSection = { id: CS2, adminName: "Proofs", enabled: true, type: "features", placement: "page_bottom", order: 40, layout: "grid", content: { heading: "Proofs", items: [{ id: FI1, title: "One", body: "First" }] } };
const imageMedia = { asset: imageAsset, alt: "  Coffee cherries  ", caption: "  Harvest detail  ", position: "media-left" };
const videoMedia = { asset: videoAsset, alt: "Roasting process", position: "media-right" };

function cloudinaryMedia(media: ProductCustomSectionMedia | undefined) {
  assert.equal(media?.provider, "cloudinary");
  if (!media || media.provider !== "cloudinary") throw new Error("Expected Cloudinary media.");
  return media;
}

// A/E. Legacy records and optional media remain migration-free.
assert.deepEqual(normalizeProductCustomSections([textSection]), [textSection]);
assert.equal(normalizeProductCustomSections([textSection])[0].media, undefined);
// B–D. TEXT/FEATURES image and TEXT video normalize through one placement model.
const normalizedImage = normalizeProductCustomSections([{ ...textSection, media: imageMedia }])[0];
assert.equal(cloudinaryMedia(normalizedImage.media).asset.type, "image");
const featurePublicId = `kd-coffee/images/${featureImageName}`;
const featureImage = normalizeProductCustomSections([{ ...featuresSection, media: { ...imageMedia, asset: { ...imageAsset, publicId: featurePublicId, url: `https://res.cloudinary.com/demo/image/upload/c_limit,q_auto,w_2400/v1/${featurePublicId}.webp` } } }])[0];
assert.equal(cloudinaryMedia(featureImage.media).asset.type, "image");
const normalizedVideo = normalizeProductCustomSections([{ ...textSection, media: videoMedia }])[0];
assert.equal(cloudinaryMedia(normalizedVideo.media).asset.type, "video");
// F–H. Resource type, public ID, and delivery URL cannot bypass validation.
assert.throws(() => normalizeProductCustomSections([{ ...textSection, media: { ...imageMedia, asset: { ...imageAsset, type: "audio" } } }]), ProductCustomSectionsValidationError);
assert.throws(() => normalizeProductCustomSections([{ ...textSection, media: { ...imageMedia, asset: { ...imageAsset, publicId: "kd-coffee/images/forged" } } }]), ProductCustomSectionsValidationError);
assert.throws(() => normalizeProductCustomSections([{ ...textSection, media: { ...imageMedia, asset: { ...imageAsset, url: "https://example.com/forged.webp" } } }]), ProductCustomSectionsValidationError);
assert.throws(() => normalizeProductCustomSections([{ ...textSection, media: { ...videoMedia, asset: { ...videoAsset, duration: undefined } } }]), ProductCustomSectionsValidationError);
// I–N. Unknowns are stripped; editorial copy/enums/metadata/poster are controlled.
const stripped = normalizeProductCustomSections([{ ...textSection, media: { ...imageMedia, unknown: "discard", asset: { ...imageAsset, secureUrl: "discard" } } }])[0];
assert.equal((stripped.media as unknown as Record<string, unknown>).unknown, undefined);
assert.equal((cloudinaryMedia(stripped.media).asset as unknown as Record<string, unknown>).secureUrl, undefined);
assert.equal(cloudinaryMedia(stripped.media).alt, "Coffee cherries");
assert.equal(stripped.media?.caption, "Harvest detail");
assert.equal(stripped.media?.position, "media-left");
assert.equal(cloudinaryMedia(stripped.media).asset.width, 1600);
assert.equal(cloudinaryMedia(stripped.media).asset.height, 1200);
assert.equal(normalizeProductCustomSections([{ ...textSection, media: { ...imageMedia, caption: " " } }])[0].media?.caption, undefined);
assert.throws(() => normalizeProductCustomSections([{ ...textSection, media: { ...imageMedia, alt: "<b>bad</b>" } }]), ProductCustomSectionsValidationError);
assert.throws(() => normalizeProductCustomSections([{ ...textSection, media: { ...imageMedia, position: "floating" } }]), ProductCustomSectionsValidationError);
assert.equal(cloudinaryMedia(normalizedVideo.media).asset.posterUrl, videoAsset.posterUrl);
// O–Q. Media edits do not touch animation, stable identity, or anchor.
const animatedInput = { ...textSection, animation: { enabled: true, trigger: "viewport", effect: "slide-up", durationMs: 700, delayMs: 100, threshold: "quarter", once: false }, media: imageMedia };
const animated = normalizeProductCustomSections([animatedInput])[0];
assert.equal(animated.animation?.effect, "slide-up");
assert.equal(getProductCustomSectionAnimationAttributes(animated)["data-product-animation-enabled"], "true");
assert.equal(animated.id, CS1);
assert.equal(productCustomSectionAnchor(animated.id), `custom-${CS1}`);
// R. Disabled Admin data retains media while frontend slot filtering remains authoritative.
const disabled = normalizeProductCustomSections([{ ...textSection, enabled: false, media: imageMedia }]);
assert.equal(cloudinaryMedia(disabled[0].media).asset.publicId, imagePublicId);
assert.equal(resolveProductCustomSectionSlot(disabled, "after_profile").length, 0);
// S. Invalid media fails open to otherwise-valid editorial content.
const failOpen = resolveProductCustomSections([{ ...textSection, media: { ...imageMedia, asset: { ...imageAsset, url: "javascript:alert(1)" } } }]);
assert.equal(failOpen[0].content.heading, "A heading");
assert.equal(failOpen[0].media, undefined);
// T. Normalization is editorial-only and cannot mutate commerce.
const commerce = { price: 700, quantity: 1, skus: [{ id: "sku-1", price: 700, stock: 4 }] };
const commerceBefore = JSON.stringify(commerce);
normalizeProductCustomSections([{ ...textSection, media: imageMedia }]);
assert.equal(JSON.stringify(commerce), commerceBefore);
// U–V. Generic future slugs work and implementation contains no Giotto allowlist.
assert.equal(imageName, "kdcoffee-coffee-created-next-year-custom-section-1111111111111111-image-01");
assert.equal(isCustomSectionMediaPublicId({ publicId: imagePublicId, productSlug, sectionId: CS1, mediaType: "image" }), true);
assert.equal(nextAvailableCustomSectionMediaSequence({ productSlug, sectionId: CS1, mediaType: "image", existingPublicIds: [imagePublicId] }), 2);
const customSources = ["lib/customSectionMediaNaming.ts", "components/admin/CustomSectionMediaEditor.tsx", "components/commerce/CustomProductSectionRenderer.tsx"].map((file) => readFileSync(file, "utf8")).join("\n");
assert.doesNotMatch(customSources, /giotto/i);
// W. CLEAN ROASTING naming/finalize entry remains intact.
assert.equal(buildProductMediaPublicId({ productSlug: "giotto-awakening", mediaPurpose: "clean-roasting", sequence: 4 }), "kdcoffee-giotto-awakening-clean-roasting-04");
const finalizeSource = readFileSync("app/api/admin/media/finalize/route.ts", "utf8");
assert.match(finalizeSource, /verifyCloudinaryVideo\(publicId, usage\)/u);
// X. Active Custom Section video is visible to the existing cleanup reference scan.
const usage = collectCloudinaryVideoUsage({}, { menu: { products: [{ slug: productSlug, name: "Future Coffee", productCustomSections: [{ ...textSection, media: videoMedia }] }] } });
assert.equal(usage.referencedPublicIds.has(videoPublicId), true);
assert.equal(usage.referencesByPublicId.get(videoPublicId)?.[0].field, "Custom Section Media");

// Source security and conservative playback contracts remain explicit.
const signSource = readFileSync("app/api/admin/media/sign/route.ts", "utf8");
assert.match(signSource, /isAdminAuthenticated/u);
assert.match(finalizeSource, /isAdminAuthenticated/u);
assert.match(signSource, /mediaPurpose === CUSTOM_SECTION_MEDIA_PURPOSE/u);
const rendererSource = readFileSync("components/commerce/CustomProductSectionRenderer.tsx", "utf8");
assert.match(rendererSource, /controls muted playsInline preload="metadata"/u);
assert.doesNotMatch(rendererSource, /autoPlay/u);
assert.doesNotMatch(rendererSource, /data-section-reveal/u);

console.log("Product custom section media assertions passed.");
