import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { rootMetadata, DEFAULT_SOCIAL_IMAGE, safeSocialImage, canonicalPublicUrl, socialPageMetadata, monthlySocialImages } from "../lib/socialMetadata";
import { normalizeMonthlyMenuBackground } from "../lib/monthlyMenuBackground";
import { galleryMetadata } from "../lib/gallerySeo";
import { giftPageMetadata } from "../lib/giftPresentation";
import { storeLandingMetadata, storeProductMetadata } from "../lib/storePublicMetadata";
import { brandStructuredData, workStructuredData, serializeStructuredData } from "../lib/brandStructuredData";
import { withSiteSocialImage } from "../lib/siteSocialImage";
import { storeContentMetadata } from "../lib/storeContentStudio";
import { storeLandingDefaults } from "../lib/giftCms";

let passed = 0;
function test(name: string, run: () => void) { run(); console.log(`PASS ${++passed}: ${name}`); }
const origin = "https://www.kdcoffee1962.com";
function complete(metadata: ReturnType<typeof socialPageMetadata>, path: string) {
  assert.equal(metadata.alternates?.canonical, origin + path);
  const og = metadata.openGraph as { images: { url: string }[]; url: string; title: string; description: string };
  const tw = metadata.twitter as { images: { url: string }[]; card: string };
  assert.ok(og.title && og.description);
  assert.equal(og.url, origin + path);
  assert.equal(tw.card, "summary_large_image");
  assert.equal(og.images[0].url, tw.images[0].url);
  assert.ok(safeSocialImage(og.images[0].url));
  assert.ok(!JSON.stringify(metadata).includes("localhost"));
}
test("production root has complete OG/Twitter, metadataBase and actual image dimensions", () => {
  assert.equal(String(rootMetadata.metadataBase), origin + "/"); complete(rootMetadata, "/");
  assert.equal(DEFAULT_SOCIAL_IMAGE.width, 2000); assert.equal(DEFAULT_SOCIAL_IMAGE.height, 2000);
});
await fs.access("public" + new URL(DEFAULT_SOCIAL_IMAGE.url).pathname);
for (const path of ["/works", "/works/giotto-awakening", "/monthly-menu", "/gallery", "/gifts"]) {
  test(`${path} fallback and referral canonical are complete`, () => complete(socialPageMetadata({ path: path + "?ref=ABC123&utm_source=line#preview", title: "作品" }), path));
}
test("public canonical is independent of host and attribution", () => {
  assert.equal(canonicalPublicUrl("https://localhost/works/test?ref=A"), origin + "/works/test");
});
for (const image of ["http://localhost/a.jpg", "https://internal.railway.app/a.png", "/api/media/a.png", "/uploads/member-avatars/a.png", "/uploads/order-notifications/a.png", "//evil.example/a.jpg", "blob:test", "/uploads/assets/../private/a.png", "/uploads/assets/%2e%2e/a.png", "https://evil.example/a.png", "/uploads/assets/video.mp4", "https://res.cloudinary.com/test/image/upload/s--signed--/kd-coffee/images/a.jpg", "https://res.cloudinary.com/test/image/upload/kd-coffee/images/a.jpg?token=x"]) {
  test(`unsafe social media rejected: ${image}`, () => assert.equal(safeSocialImage(image), undefined));
}
const image = "/uploads/artworks/monthly-menu/kdcoffee-monthly-menu-background-v01.webp";
const poster = "https://res.cloudinary.com/test/video/upload/v1/kd-coffee/videos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg";
const media = { type: "video", provider: "cloudinary", publicId: "kd-coffee/videos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", url: poster.replace(/jpg$/, "mp4"), posterUrl: poster };
for (const [name, background, expected] of [
  ["image", { image }, origin + image], ["video with poster", { image, media }, poster],
  ["video without poster", { image, media: { ...media, posterUrl: undefined } }, origin + image],
  ["unsafe poster", { image, media: { ...media, posterUrl: "/uploads/member-avatars/a.png" } }, origin + image],
  ["video alone", { media: { ...media, posterUrl: undefined } }, DEFAULT_SOCIAL_IMAGE.url], ["empty", {}, DEFAULT_SOCIAL_IMAGE.url],
] as const) {
  test(`Monthly Menu ${name} uses image, never video`, () => {
    const metadata = socialPageMetadata({ path: "/monthly-menu", title: "月選", images: monthlySocialImages(normalizeMonthlyMenuBackground(background)) });
    assert.equal((metadata.openGraph as { images: { url: string }[] }).images[0].url, expected);
  });
}
test("Gallery saved SEO survives and absent image uses public fallback", () => {
  complete(galleryMetadata(origin, undefined, { ogTitle: "自訂分享標題" }), "/gallery");
  assert.equal((galleryMetadata(origin, undefined, { ogTitle: "自訂分享標題" }).openGraph as { title: string }).title, "自訂分享標題");
});
test("Gift and Store publication rules survive social fallback", () => {
  complete(giftPageMetadata(false), "/gifts"); assert.equal((giftPageMetadata(false).robots as { index: boolean }).index, false);
  complete(storeLandingMetadata({ ref: "ABC123" }), "/store");
});
test("Store detail without hero uses a complete canonical social fallback", () => {
  complete(storeProductMetadata({ product: { name: "既有商品", slug: "real-product", gallery: [], shortDescription: "", description: "商品內容",
    price: 100, inStock: true, featured: false, section: { slug: "coffee", name: "咖啡" }, specifications: [] }, manualSeo: {} }), "/store/real-product");
});
test("structured data has no invented commerce facts and safely serializes text", () => {
  const data = workStructuredData({ slug: "real-product", name: "</script>" }, "內容", DEFAULT_SOCIAL_IMAGE.url);
  const json = serializeStructuredData(data); assert.ok(!json.includes("<")); assert.deepEqual(JSON.parse(json), data);
  assert.ok(!/Offer|AggregateRating|Review|openingHours|telephone/.test(JSON.stringify([data, brandStructuredData()])));
});
test("Store CMS social overrides update both OG and Twitter", () => {
  const document = storeLandingDefaults({ title: "商店", subtitle: "商品" });
  document.seo.socialTitle = "社群商店";
  document.seo.image = { url: "/uploads/assets/store/hero.png", alt: "商店封面", caption: "" };
  const metadata = storeContentMetadata(storeLandingMetadata(), document);
  complete(metadata, "/store");
  assert.equal((metadata.twitter as { title: string }).title, "社群商店");
});
const previousRoot = process.env.KD_DATA_DIR;
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "kd-social-image-"));
try {
  process.env.KD_DATA_DIR = temporary;
  const { getAssetsDataFile } = await import("../lib/storagePaths");
  const file = getAssetsDataFile();
  assert.ok(file.startsWith(temporary));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ assets: [{ id: "LOGO005", status: "active", path: "/uploads/assets/logo/owner-card.jpg", alt: "品牌分享卡" }] }));
  const imageFile = path.join(temporary, "uploads/assets/logo/owner-card.jpg");
  await fs.mkdir(path.dirname(imageFile), { recursive: true });
  await fs.writeFile(imageFile, await (await import("sharp")).default({ create: { width: 1200, height: 630, channels: 3, background: "#82664a" } }).jpeg().toBuffer());
  const metadata = await withSiteSocialImage(rootMetadata);
  test("existing global LOGO005 CMS slot supplies root OG and Twitter fallback", () => {
    complete(metadata, "/");
    assert.equal((metadata.openGraph as { images: { url: string }[] }).images[0].url, origin + "/uploads/assets/logo/owner-card.jpg");
  });
  const specific = socialPageMetadata({ path: "/works/test", title: "作品", images: ["/uploads/artworks/test/hero.jpg"] });
  const resolvedSpecific = await withSiteSocialImage(specific);
  test("global CMS fallback preserves page-specific product imagery", () => assert.deepEqual(resolvedSpecific, specific));
} finally {
  if (previousRoot === undefined) delete process.env.KD_DATA_DIR; else process.env.KD_DATA_DIR = previousRoot;
  await fs.rm(temporary, { recursive: true, force: true });
}
console.log(`SEO.1: ${passed} PASS`);
