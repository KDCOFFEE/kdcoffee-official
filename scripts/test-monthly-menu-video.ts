import assert from "node:assert/strict";
// @ts-expect-error -- Node strip-types requires extensions.
import { normalizeMonthlyMenuBackground, getArtworkMonthForSave } from "../lib/monthlyMenuBackground.ts";
// @ts-expect-error -- Node strip-types requires extensions.
import { collectCloudinaryVideoUsage } from "../lib/cloudinaryMediaUsageCore.ts";

const image = "/uploads/artworks/monthly-menu/kdcoffee-monthly-menu-background-v01.webp";
const defaults = { opacity: 1, position: "auto", fit: "cover" };
const video = (id: string) => ({ type: "video", provider: "cloudinary", publicId: `kd-coffee/videos/${id}`, url: `https://res.cloudinary.com/test/video/upload/${id}.mp4`, posterUrl: `https://res.cloudinary.com/test/video/upload/${id}.jpg` });
const first = video("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
const second = video("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
const old = normalizeMonthlyMenuBackground({ ...defaults, image });
assert.equal(old.image, image);
assert.equal(old.media, undefined);
assert.equal(getArtworkMonthForSave(old, image, "2026-11"), undefined);

// A–G: legacy/new images, new video, each replacement direction, and persisted reload.
for (const [before, after] of [[old, { image }], [old, { media: first }], [{ media: first }, { image }], [{ media: first }, { media: second }]]) {
  const restored = normalizeMonthlyMenuBackground(JSON.parse(JSON.stringify({ ...defaults, ...after })));
  assert.equal(restored.image, "image" in after ? image : undefined);
  assert.deepEqual(restored.media, "media" in after ? after.media : undefined);
  const snapshot = collectCloudinaryVideoUsage({}, { menu: { background: restored, products: [] } });
  assert.equal(snapshot.referencedPublicIds.size, restored.media ? 1 : 0);
  if (restored.media) assert.ok(snapshot.referencedPublicIds.has(restored.media.publicId!));
  const previous = normalizeMonthlyMenuBackground({ ...defaults, ...before });
  if (restored.media) assert.equal(getArtworkMonthForSave(previous, restored.media.url, "2026-11"), "2026-11");
}

// Replacement drops only the menu reference: a shared Homepage resource stays protected.
const shared = collectCloudinaryVideoUsage({ hero: { media: first } }, { menu: { background: { media: second }, products: [] } });
assert.ok(shared.referencedPublicIds.has(first.publicId));
assert.ok(shared.referencedPublicIds.has(second.publicId));
assert.equal(shared.referencesByPublicId.get(second.publicId)?.[0].sourceType, "monthly-menu");
assert.equal(normalizeMonthlyMenuBackground({ media: { ...first, publicId: "unmanaged" } }).media, undefined);
assert.equal(normalizeMonthlyMenuBackground({ media: { ...first, url: "javascript:alert(1)" } }).media, undefined);
console.log("Monthly Menu video: A–G persistence/normalization, shared-reference cleanup protection, invalid media PASS");
