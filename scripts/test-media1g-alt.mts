// Synthetic references and rendered HTML only. No media/network/CMS writes.
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { replacementMediaDescription } from "../lib/mediaAlt";
import { resolveAssetAlt } from "../lib/assetMetadata";
import { DEFAULT_GIFT_LANDING, giftHeroAlt, replaceGiftHeroImage, validateGiftLanding } from "../lib/giftCms";
import { createSection, validatePageDraft } from "../lib/pageBuilder";
import { resolveWorksPageCms, validateWorksPageCms } from "../lib/worksPageCms";
import { resolveHomepageMediaCollection } from "../components/home/HomepageMediaCollection";
import { resolveGalleryWorks } from "../lib/galleryWorks";
import type { CoffeeArtwork } from "../data/websiteData";
import GiftExperience from "../components/gifts/GiftExperience";
import PageBuilderRenderer from "../components/page-builder/PageBuilderRenderer";
import GalleryMedia from "../components/gallery/GalleryMedia";
import { newStoreAdminDraft } from "../lib/storeAdminDraft";
import { validateStoreProduct } from "../lib/storeValidation";
import { findPublicStoreProductBySlug } from "../lib/storePublicSelectors";
import StoreProductGallery from "../components/store/StoreProductGallery";
import type { StoreCatalog } from "../lib/storeTypes";
import type { MediaAsset } from "../lib/media";

let checks = 0;
function test(name: string, run: () => void) {
  run(); checks++; console.log("PASS " + name);
}
const original: MediaAsset = { type: "image", provider: "local", url: "/uploads/assets/test/old.webp" };
const selected: MediaAsset = { type: "image", provider: "local", url: "/uploads/assets/test/new.webp", alt: "桌面上的咖啡禮盒" };
const manual = { media: original, alt: "Owner 手動描述", decorative: false };
const previousHero = { ...structuredClone(DEFAULT_GIFT_LANDING.hero), image: { url: original.url, alt: "舊素材描述", caption: "" }, alt: "Owner 手動主視覺描述" };
const image = { url: selected.url, alt: selected.alt!, caption: "" };
test("Gifts replacement synchronizes both legacy fields", () => {
  const hero = replaceGiftHeroImage(previousHero, image);
  assert.equal(hero.alt, selected.alt);
  assert.equal(hero.image?.alt, selected.alt);
  assert.equal(giftHeroAlt(hero), selected.alt);
  assert.equal(previousHero.alt, "Owner 手動主視覺描述");
  assert.equal(previousHero.image.url, original.url);
});
test("Gifts no-description and decorative replacements use explicit decisions", () => {
  assert.equal(giftHeroAlt(replaceGiftHeroImage(previousHero, { ...image, alt: "DSC_1234" })), "KD Coffee 禮盒專區主視覺");
  const hero = replaceGiftHeroImage(previousHero, { ...image, alt: "", decorative: true });
  assert.equal(giftHeroAlt(hero), "");
  validateGiftLanding({ ...DEFAULT_GIFT_LANDING, hero });
});
test("Gifts same-media selection and unrelated copy preserve manual ALT", () => {
  assert.equal(replaceGiftHeroImage(previousHero, { ...previousHero.image, alt: "素材庫描述" }), previousHero);
  assert.equal(giftHeroAlt({ ...previousHero, description: "另一段頁面文案" }), previousHero.alt);
});
test("Gifts edited ALT survives serialize/read/render with the same URL", () => {
  const hero = replaceGiftHeroImage(previousHero, image);
  const document = JSON.parse(JSON.stringify({ ...DEFAULT_GIFT_LANDING, hero: { ...hero, alt: "手動新描述", image: { ...hero.image, alt: "手動新描述" } } }));
  validateGiftLanding(document);
  const html = renderToStaticMarkup(createElement(GiftExperience, {
    cms: document,
    model: { groups: [], total: 0 } as unknown as Parameters<typeof GiftExperience>[0]["model"],
  }));
  assert.ok(html.includes('alt="手動新描述"'));
  assert.ok(html.includes('src="/uploads/assets/test/new.webp"'));
});
test("Store/Works/Homepage/Page Builder share replacement decisions", () => {
  for (const purpose of ["咖啡壺主視覺", "咖啡壺相簿圖片 2", "本月咖啡作品主視覺", "首頁工作室圖片", "網頁內容圖片 2"]) {
    assert.equal(replacementMediaDescription(manual, selected, purpose).alt, selected.alt);
    assert.equal(replacementMediaDescription(manual, { ...selected, alt: "" }, purpose).alt, purpose);
    assert.equal(replacementMediaDescription(manual, original, purpose).alt, manual.alt);
  }
  const gallery = [1, 2].map(index => replacementMediaDescription(undefined, { ...selected, alt: "", url: "/images/" + index + ".webp" }, "咖啡壺相簿圖片 " + index));
  assert.notEqual(gallery[0].alt, gallery[1].alt);
});
test("Store validation, public projection and rendered HTML preserve decoration", () => {
  const product = { ...newStoreAdminDraft("products", "test-section"), id: "test-product", revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", archivedAt: null,
    name: "測試咖啡壺", slug: "test-kettle", sku: "TEST", active: true, published: true,
    heroMedia: { ...original, alt: "", decorative: true } };
  validateStoreProduct(product);
  const catalog = { sections: [{ id: "test-section", slug: "test-section", name: "測試專區", sortOrder: 0, active: true, published: true, archivedAt: null }], categories: [], products: [product] } as unknown as StoreCatalog;
  const projected = findPublicStoreProductBySlug(catalog, product.slug)!;
  assert.equal(projected.heroMedia?.decorative, true);
  const html = renderToStaticMarkup(createElement(StoreProductGallery, { name: projected.name, heroMedia: projected.heroMedia, gallery: projected.gallery }));
  assert.ok(html.includes('alt=""'));
  assert.ok(!html.includes('alt="測試咖啡壺"'));
});
test("Same media retains explicit empty decoration; replacement resets it", () => {
  const decorative = { media: original, alt: "", decorative: true };
  assert.equal(replacementMediaDescription(decorative, original).decorative, true);
  const replacement = { ...decorative, ...replacementMediaDescription(decorative, selected) };
  assert.equal(replacement.decorative, false);
  assert.equal(replacement.alt, selected.alt);
});
test("UUID/path/camera/default names never become suggestions", () => {
  for (const alt of ["00000000-0000-4000-8000-000000000001", "/uploads/a.webp", "IMG_1234.JPG", "DSC_1234", "PXL_20261105_1234", "image001", "photo", "kdcoffee-test-product-hero-v01", "https://example.test/a.png"]) {
    assert.equal(resolveAssetAlt({ alt }), "", alt);
    assert.equal(replacementMediaDescription(undefined, { ...selected, alt }, "").alt, "", alt);
  }
});
test("Works optional decoration remains compatible with legacy configuration", () => {
  const config = { schemaVersion: 1, hero: { desktopMedia: { media: original, alt: "", decorative: true } } };
  validateWorksPageCms(config);
  const result = resolveWorksPageCms(config, { monthLabel: "十一月", intro: "" });
  assert.equal(result.hero.desktopMedia?.decorative, true);
  assert.equal(result.hero.desktopMedia?.alt, "");
  assert.equal(resolveWorksPageCms({ schemaVersion: 1, hero: { desktopMedia: manual } }, { monthLabel: "十一月", intro: "" }).hero.desktopMedia?.alt, manual.alt);
});
test("Decorative flags retain existing required-field validation", () => {
  const validHero = { ...DEFAULT_GIFT_LANDING.hero, image: { url: selected.url, alt: "", caption: "" } };
  assert.throws(() => validateGiftLanding({ ...DEFAULT_GIFT_LANDING, hero: validHero }));
  assert.throws(() => validateGiftLanding({ ...DEFAULT_GIFT_LANDING, hero: { ...validHero, image: { ...validHero.image, decorative: false } } }));
  validateGiftLanding({ ...DEFAULT_GIFT_LANDING, hero: { ...validHero, image: { ...validHero.image, decorative: true } } });
  for (const decorative of [undefined, false, "true"]) {
    assert.throws(() => validateWorksPageCms({ schemaVersion: 1, hero: { desktopMedia: { media: original, alt: "", ...(decorative !== undefined ? { decorative } : {}) } } }));
  }
  const section = createSection("gallery");
  section.media = [{ id: "media-test-123", enabled: true, media: original, alt: "", decorative: true }];
  validatePageDraft({ title: "測試頁", seoTitle: "", seoDescription: "", sections: [section] });
  section.media[0].alt = "與裝飾設定衝突";
  assert.throws(() => validatePageDraft({ title: "測試頁", seoTitle: "", seoDescription: "", sections: [section] }));
});
test("Homepage decoration survives resolution and manual ALT remains unchanged", () => {
  const item = { id: "test-image", media: original, alt: "", decorative: true };
  assert.equal(resolveHomepageMediaCollection({ alt: "舊回退文字", mediaItems: [item] })[0].alt, "");
  assert.equal(resolveHomepageMediaCollection({ alt: "舊回退文字", mediaItems: [{ ...item, decorative: false, alt: manual.alt }] })[0].alt, manual.alt);
});
test("Page Builder preserves legacy fallback and explicit decorative ALT", () => {
  const section = createSection("gallery");
  section.title = "區塊標題";
  section.media = [{ id: "media-test-123", enabled: true, media: original, alt: "", decorative: true }];
  const page = { title: "測試頁", seoTitle: "", seoDescription: "", sections: [section] };
  validatePageDraft(page);
  const html = renderToStaticMarkup(createElement(PageBuilderRenderer, { page, products: [], registry: { products: [], pages: [] } }));
  assert.ok(html.includes('alt=""'));
  assert.ok(!html.includes('alt="區塊標題"'));
  delete section.media[0].decorative;
  validatePageDraft(page);
});
test("Gallery static image and video poster have independent source descriptions", () => {
  const product = {
    slug: "test-coffee", name: "測試咖啡", active: true, showOnHomepage: true, inMonthlyMenu: true,
    publish: { website: true }, assets: {
      hero: { path: original.url, alt: "舊 Hero 描述" },
      artworkCover: { path: "/images/cover.webp", alt: "作品封面描述" },
      mainVisual: { path: selected.url, alt: selected.alt },
      galleryDesktopAnimation: { media: { type: "video", provider: "cloudinary", publicId: "kd-coffee/videos/legacy", url: "https://res.cloudinary.com/test/video/upload/legacy.mp4", posterUrl: "https://res.cloudinary.com/test/video/upload/legacy.jpg" } },
    },
  } as unknown as CoffeeArtwork;
  const work = resolveGalleryWorks([product])[0];
  assert.ok(work);
  assert.equal(work.imageAlt, "作品封面描述");
  const html = renderToStaticMarkup(createElement(GalleryMedia, { work, active: true }));
  assert.ok(html.includes("作品詮釋影片封面"));
  assert.ok(!html.includes('alt="舊 Hero 描述"'));
  assert.equal(work.stageVideo, product.assets?.galleryDesktopAnimation?.media?.url);
  assert.equal(work.posterImage, product.assets?.galleryDesktopAnimation?.media?.posterUrl);
});
console.log("MEDIA.1G ALT " + checks + " PASS");
