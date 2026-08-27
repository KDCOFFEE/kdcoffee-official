import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

// @ts-expect-error Node's strip-types runner requires explicit TypeScript extensions.
import { createPageBuilderAsset, optimizePageBuilderImage, pageBuilderImageIdentity, validatePageBuilderImageFile } from "../lib/pageBuilderImages.ts";
// @ts-expect-error Node's strip-types runner requires explicit TypeScript extensions.
import { createSection, newBuilderId, validatePageDraft } from "../lib/pageBuilder.ts";
// @ts-expect-error Node's strip-types runner requires explicit TypeScript extensions.
import { localImageMedia } from "../lib/media.ts";

validatePageBuilderImageFile({ name: "owner-test.png", type: "image/png", size: 128 });
assert.throws(() => validatePageBuilderImageFile({ name: "owner-test.gif", type: "image/gif", size: 128 }));

const source = await sharp({ create: { width: 2600, height: 1500, channels: 3, background: "#9b6847" } }).png().toBuffer();
const optimized = await optimizePageBuilderImage(source);
const metadata = await sharp(optimized).metadata();
assert.equal(metadata.format, "webp");
assert.equal(metadata.width, 1800);
assert.ok((metadata.height || 0) < 1800);

const identity = pageBuilderImageIdentity("Owner Campaign Photo.PNG", randomUUID());
assert.match(identity.fileName, /^kd-coffee-page-owner-campaign-photo-[a-z0-9]{12}-v01\.webp$/);
const asset = createPageBuilderAsset({ id: identity.id, seoStem: identity.seoStem, originalFileName: "Owner Campaign Photo.PNG", publicPath: `/uploads/assets/page-builder/${identity.fileName}`, now: new Date().toISOString() });
assert.equal(asset.status, "active");
assert.equal(asset.category, "page-builder");

const section = createSection("gallery");
const imageA = { id: newBuilderId("media"), enabled: true, media: localImageMedia(asset.path), alt: asset.alt };
const video = { id: newBuilderId("media"), enabled: true, media: { type: "video" as const, provider: "cloudinary" as const, url: "https://res.cloudinary.com/demo/video/upload/sample.mp4", publicId: "kd-coffee/videos/test" }, alt: "測試影片" };
const imageB = { id: newBuilderId("media"), enabled: false, media: localImageMedia("/uploads/assets/page-builder/replacement.webp"), alt: "替換圖片" };
section.media = [imageA, video, imageB];
const reordered = [section.media[2], section.media[0], section.media[1]];
section.media = reordered;
validatePageDraft({ title: "圖片流程測試", seoTitle: "", seoDescription: "", sections: [section] });
assert.deepEqual(section.media.map((item) => item.media.type), ["image", "image", "video"]);
assert.equal(section.media[0].enabled, false);

console.log("Page Builder image optimization, Asset Library metadata, mixed media, reorder, and visibility tests passed.");
