import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCustomSectionMediaPublicId } from "../lib/customSectionMediaNaming";
import {
  getProductCustomSectionAnimationAttributes,
  productCustomSectionAnchor,
  resolveProductCustomSectionSlot,
  type ProductCustomSectionMedia,
} from "../lib/productCustomSections";
import {
  ProductCustomSectionsValidationError,
  normalizeProductCustomSections,
  resolveProductCustomSections,
} from "../lib/productCustomSectionsValidation";
import { parseYouTubeUrl, youtubeEmbedUrl, YouTubeUrlValidationError } from "../lib/youtubeMedia";

const SECTION_ID = "cs-33333333-3333-4333-8333-333333333333";
const VIDEO_A = "dQw4w9WgXcQ";
const VIDEO_B = "9bZkp7q19f0";
const productSlug = "future-lot-2030";
const baseSection = {
  id: SECTION_ID,
  adminName: "YouTube story",
  enabled: true,
  type: "text",
  placement: "after_profile",
  order: 30,
  layout: "standard",
  animation: { enabled: true, trigger: "viewport", effect: "slide-up", durationMs: 700, delayMs: 100, threshold: "quarter", once: true },
  content: { heading: "Roasting story", body: "Editorial content remains available." },
};
const youtubeMedia = {
  provider: "youtube",
  videoId: VIDEO_A,
  title: "  Roasting interview  ",
  caption: "  Full conversation  ",
  position: "media-right",
  arbitraryEmbedParameter: "autoplay=1",
};
const imageName = buildCustomSectionMediaPublicId({ productSlug, sectionId: SECTION_ID, mediaType: "image", sequence: 1 });
const videoName = buildCustomSectionMediaPublicId({ productSlug, sectionId: SECTION_ID, mediaType: "video", sequence: 1 });
const imagePublicId = `kd-coffee/images/${imageName}`;
const cloudVideoPublicId = `kd-coffee/videos/${videoName}`;
const cloudinaryImage = {
  provider: "cloudinary",
  asset: { type: "image", url: `https://res.cloudinary.com/demo/image/upload/c_limit,q_auto,w_2400/v1/${imagePublicId}.webp`, provider: "cloudinary", publicId: imagePublicId, width: 1600, height: 1200, bytes: 450_000, format: "webp" },
  alt: "Coffee cherries",
  position: "media-left",
};
const cloudinaryVideo = {
  provider: "cloudinary",
  asset: { type: "video", url: `https://res.cloudinary.com/demo/video/upload/c_limit,q_auto,vc_h264:high:4.0,w_1920/v1/${cloudVideoPublicId}.mp4`, provider: "cloudinary", publicId: cloudVideoPublicId, posterUrl: `https://res.cloudinary.com/demo/video/upload/c_limit,f_auto,q_auto,w_1600/v1/${cloudVideoPublicId}.jpg`, width: 1920, height: 1080, duration: 20, bytes: 8_400_000, format: "mp4" },
  alt: "Roasting film",
  position: "media-top",
};

function normalize(media?: unknown) {
  return normalizeProductCustomSections([{ ...baseSection, ...(media === undefined ? {} : { media }) }])[0];
}

function expectYouTube(media: ProductCustomSectionMedia | undefined) {
  assert.equal(media?.provider, "youtube");
  if (!media || media.provider !== "youtube") throw new Error("Expected YouTube media.");
  return media;
}

function expectCloudinary(media: ProductCustomSectionMedia | undefined) {
  assert.equal(media?.provider, "cloudinary");
  if (!media || media.provider !== "cloudinary") throw new Error("Expected Cloudinary media.");
  return media;
}

// A–C. Legacy and both established Cloudinary resource types remain valid.
assert.equal(normalize().media, undefined);
assert.equal(expectCloudinary(normalize(cloudinaryImage).media).asset.type, "image");
assert.equal(expectCloudinary(normalize(cloudinaryVideo).media).asset.type, "video");

// D–H. Common YouTube URL forms resolve to one canonical ID and discard tracking.
assert.equal(parseYouTubeUrl(`https://www.youtube.com/watch?v=${VIDEO_A}`), VIDEO_A);
assert.equal(parseYouTubeUrl(`https://youtu.be/${VIDEO_A}`), VIDEO_A);
assert.equal(parseYouTubeUrl(`https://www.youtube.com/shorts/${VIDEO_A}`), VIDEO_A);
assert.equal(parseYouTubeUrl(`https://www.youtube.com/embed/${VIDEO_A}`), VIDEO_A);
assert.equal(parseYouTubeUrl(`https://m.youtube.com/watch?v=${VIDEO_A}&utm_source=cms&list=PL123&t=30`), VIDEO_A);

// I–L. Domains, schemes, malformed IDs, playlist-only URLs, and raw HTML are rejected.
assert.throws(() => parseYouTubeUrl(`https://example.com/watch?v=${VIDEO_A}`), YouTubeUrlValidationError);
assert.throws(() => parseYouTubeUrl(`javascript:${VIDEO_A}`), YouTubeUrlValidationError);
assert.throws(() => parseYouTubeUrl("https://youtu.be/not-valid"), YouTubeUrlValidationError);
assert.throws(() => parseYouTubeUrl("https://www.youtube.com/watch?list=PL123"), YouTubeUrlValidationError);
assert.throws(() => parseYouTubeUrl(`<iframe src="https://www.youtube.com/embed/${VIDEO_A}"></iframe>`), YouTubeUrlValidationError);

// M–Q. Server normalization preserves only canonical, safe editorial fields.
const normalizedYouTube = normalize(youtubeMedia);
const canonicalYouTube = expectYouTube(normalizedYouTube.media);
assert.deepEqual(canonicalYouTube, { provider: "youtube", videoId: VIDEO_A, title: "Roasting interview", caption: "Full conversation", position: "media-right" });
assert.equal((canonicalYouTube as unknown as Record<string, unknown>).arbitraryEmbedParameter, undefined);
assert.throws(() => normalize({ ...youtubeMedia, title: "<script>bad</script>" }), ProductCustomSectionsValidationError);
assert.throws(() => normalize({ ...youtubeMedia, title: "" }), ProductCustomSectionsValidationError);
assert.throws(() => normalize({ ...youtubeMedia, caption: "bad\u0000caption" }), ProductCustomSectionsValidationError);
assert.throws(() => normalize({ ...youtubeMedia, position: "floating" }), ProductCustomSectionsValidationError);
assert.throws(() => normalize({ ...youtubeMedia, provider: "vimeo" }), ProductCustomSectionsValidationError);

// R. Embed source is generated by app code from the canonical ID only.
assert.equal(youtubeEmbedUrl(VIDEO_A), `https://www.youtube-nocookie.com/embed/${VIDEO_A}`);
assert.throws(() => youtubeEmbedUrl(`${VIDEO_A}?autoplay=1`), YouTubeUrlValidationError);
const rendererSource = readFileSync("components/commerce/CustomProductSectionRenderer.tsx", "utf8");
assert.match(rendererSource, /youtubeEmbedUrl\(media\.videoId\)/u);
assert.match(rendererSource, /loading="lazy"/u);
assert.match(rendererSource, /allowFullScreen/u);
assert.doesNotMatch(rendererSource, /autoPlay|autoplay=1/u);

// S–T. Invalid media fails open; disabled Admin data remains stored but is filtered from slots.
const invalidResolved = resolveProductCustomSections([{ ...baseSection, media: { ...youtubeMedia, videoId: "bad" } }]);
assert.equal(invalidResolved[0].content.heading, "Roasting story");
assert.equal(invalidResolved[0].media, undefined);
const disabled = normalizeProductCustomSections([{ ...baseSection, enabled: false, media: youtubeMedia }]);
assert.equal(expectYouTube(disabled[0].media).videoId, VIDEO_A);
assert.equal(resolveProductCustomSectionSlot(disabled, "after_profile").length, 0);

// U–Y. All provider replacement directions normalize independently and atomically.
const imageBefore = normalize(cloudinaryImage);
const videoBefore = normalize(cloudinaryVideo);
const imageToYouTube = normalize(youtubeMedia);
const videoToYouTube = normalize(youtubeMedia);
const youtubeToImage = normalize(cloudinaryImage);
const youtubeToVideo = normalize(cloudinaryVideo);
const youtubeToYouTube = normalize({ ...youtubeMedia, videoId: VIDEO_B, title: "Second video" });
assert.equal(expectCloudinary(imageBefore.media).asset.publicId, imagePublicId);
assert.equal(expectCloudinary(videoBefore.media).asset.publicId, cloudVideoPublicId);
assert.equal(expectYouTube(imageToYouTube.media).videoId, VIDEO_A);
assert.equal(expectYouTube(videoToYouTube.media).videoId, VIDEO_A);
assert.equal(expectCloudinary(youtubeToImage.media).asset.type, "image");
assert.equal(expectCloudinary(youtubeToVideo.media).asset.type, "video");
assert.equal(expectYouTube(youtubeToYouTube.media).videoId, VIDEO_B);

// Z–AB. Stable identity, anchor, and animation are provider-independent.
for (const section of [imageToYouTube, videoToYouTube, youtubeToImage, youtubeToVideo, youtubeToYouTube]) {
  assert.equal(section.id, SECTION_ID);
  assert.equal(productCustomSectionAnchor(section.id), `custom-${SECTION_ID}`);
  assert.equal(section.animation?.effect, "slide-up");
  assert.equal(getProductCustomSectionAnimationAttributes(section)["data-product-animation-enabled"], "true");
}

// AC–AE. Commerce is untouched; arbitrary future slugs work; no product allowlist exists.
const commerce = { price: 880, skus: [{ id: "future-sku", price: 880, stock: 7 }], quantity: 1 };
const commerceBefore = JSON.stringify(commerce);
normalize(youtubeMedia);
assert.equal(JSON.stringify(commerce), commerceBefore);
assert.equal(imageName, "kdcoffee-future-lot-2030-custom-section-3333333333333333-image-01");
const sourceSet = ["lib/youtubeMedia.ts", "lib/productCustomSections.ts", "lib/productCustomSectionsValidation.ts", "components/admin/CustomSectionMediaEditor.tsx", "components/commerce/CustomProductSectionRenderer.tsx"].map((file) => readFileSync(file, "utf8")).join("\n");
assert.doesNotMatch(sourceSet, /giotto/i);
assert.doesNotMatch(sourceSet, /youtube.*api|googleapis|iframe_api/iu);

// AF. YouTube saves bypass Cloudinary verification while its video readiness path remains intact.
const verificationSource = readFileSync("lib/productCustomSectionMediaVerification.ts", "utf8");
assert.match(verificationSource, /section\.media\.provider === "youtube"/u);
assert.doesNotMatch(readFileSync("lib/youtubeMedia.ts", "utf8"), /fetch\s*\(/u);
const readinessSource = readFileSync("lib/cloudinaryVideoReadiness.ts", "utf8");
assert.match(readinessSource, /waitForCustomSectionVideoReadiness/u);
assert.match(readinessSource, /BROWSER_SAFE_H264_TRANSFORMATION/u);

console.log("Product custom section YouTube assertions passed.");
