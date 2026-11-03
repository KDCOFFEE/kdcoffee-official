import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { socialPageMetadata, monthlySocialImages, DEFAULT_SOCIAL_IMAGE } from "../lib/socialMetadata";
import { resolveWorkSocialImages } from "../lib/productVisualAssets";
import { collectCloudinaryVideoUsage } from "../lib/cloudinaryMediaUsageCore";
import { validateSocialImageValue, isSocialLibraryImage } from "../lib/socialImageSettings";
import { createPage, validatePageDraft } from "../lib/pageBuilder";
import SocialImageField from "../components/admin/SocialImageField";

const state = globalThis as typeof globalThis & { __returnCookies?: Record<string, string> };
const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-seo1b-"));
const previous = { root: process.env.KD_DATA_DIR, mount: process.env.RAILWAY_VOLUME_MOUNT_PATH, secret: process.env.ADMIN_SESSION_SECRET };
process.env.KD_DATA_DIR = root; delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.ADMIN_SESSION_SECRET = "isolated-seo1b-test-secret-do-not-use-in-production";
let count = 0;
async function test(name: string, run: () => unknown | Promise<unknown>) { await run(); console.log(`PASS ${++count}: ${name}`); }
const read = async (file: string) => JSON.parse(await fs.readFile(file, "utf8"));
try {
  const { getAssetsDataFile, getWebsiteDataFile, getPagesDataFile } = await import("../lib/storagePaths");
  const assetsFile = getAssetsDataFile(), websiteFile = getWebsiteDataFile(), pagesFile = getPagesDataFile();
  for (const file of [assetsFile, websiteFile, pagesFile]) { assert.ok(file.startsWith(root)); await fs.mkdir(path.dirname(file), { recursive: true }); }
  await fs.writeFile(assetsFile, JSON.stringify({ version: 1, updatedAt: "", assets: [{ id: "LOGO005", category: "logo", name: "分享圖", alt: "KD Coffee", path: "", status: "missing" }] }));
  const product = { slug: "real-work", id: "work-1", name: "既有作品", active: true, status: "active", price: 700, stock: 19, roast: "中焙", skus: [{ id: "sku-1", price: 700, stock: 19 }], assets: { hero: { path: "/uploads/artworks/real-work/hero.jpg" } } };
  await fs.writeFile(websiteFile, JSON.stringify({ version: 1, menu: { products: [product] } }));
  const page = createPage("品牌故事", []); page.slug = "about";
  await fs.writeFile(pagesFile, JSON.stringify({ version: 1, updatedAt: "", pages: [page] }));
  const { POST: upload } = await import("../app/api/admin/assets/upload/route");
  const { GET: list, PUT: saveGlobal } = await import("../app/api/admin/assets/route");
  const { PUT: saveProducts } = await import("../app/api/admin/products/route");
  const { PUT: savePage } = await import("../app/api/admin/pages/[id]/route");
  const { createAdminSessionValue, adminCookieName } = await import("../lib/adminAuth");
  const { withSiteSocialImage } = await import("../lib/siteSocialImage");
  const { saveGlobalSocialImage } = await import("../lib/socialImageAdmin");
  const { GET: serve } = await import("../app/uploads/assets/[category]/[fileName]/route");
  function owner(role: "owner" | "admin" = "owner") { state.__returnCookies = { [adminCookieName]: createAdminSessionValue({ adminId: "test-owner", role }) }; }
  const origin = "http://localhost";
  const jsonRequest = (url: string, body: unknown, source = origin) => new Request(origin + url, { method: "PUT", headers: { Origin: source, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const png = await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#82664a" } }).png().toBuffer();
  const uploadRequest = (bytes: Buffer = png, name = "test.png", type = "image/png") => {
    const form = new FormData(); form.set("file", new File([new Uint8Array(bytes)], name, { type })); form.set("create", "true");
    return new Request(origin + "/api/admin/assets/upload?purpose=social-share", { method: "POST", headers: { Origin: origin }, body: form });
  };
  await test("new social upload and setting reject anonymous/non-Owner access", async () => {
    state.__returnCookies = {}; assert.equal((await upload(uploadRequest())).status, 401);
    assert.equal((await saveGlobal(jsonRequest("/api/admin/assets?purpose=social-share", { version: 1, image: null }))).status, 401);
    owner("admin"); assert.equal((await upload(uploadRequest())).status, 403);
    assert.equal((await list(new Request(origin + "/api/admin/assets?purpose=social-share"))).status, 403);
  });
  owner();
  await test("global setting rejects cross-origin writes", async () => assert.equal((await saveGlobal(jsonRequest("/api/admin/assets?purpose=social-share", { version: 1, image: null }, "https://evil.example"))).status, 403));
  await test("shared upload pipeline rejects SVG and disguised image bytes", async () => {
    for (const file of [[Buffer.from("<svg/>"), "a.svg", "image/svg+xml"], [Buffer.from("not an image"), "a.png", "image/png"]] as const) assert.notEqual((await upload(uploadRequest(file[0], file[1], file[2]))).status, 201);
    assert.equal((await read(assetsFile)).version, 1);
  });
  const response = await upload(uploadRequest()); assert.equal(response.status, 201, await response.clone().text());
  const uploaded = (await response.json()).asset;
  const image = { path: uploaded.path as string, alt: "測試分享圖", assetId: uploaded.id as string };
  await test("safe upload is registered in existing Asset Library and publicly served", async () => {
    assert.equal((await read(assetsFile)).assets.length, 2);
    const result = await serve(new Request(origin + image.path), { params: Promise.resolve({ category: "page-builder", fileName: path.basename(image.path) }) });
    assert.equal(result.status, 200); assert.equal(result.headers.get("content-type"), "image/webp");
    const metadata = await sharp(Buffer.from(await result.arrayBuffer())).metadata(); assert.equal(metadata.width, 1200); assert.equal(metadata.height, 630);
  });
  await test("A global save/reload updates LOGO005 and metadata without code changes", async () => {
    const result = await saveGlobal(jsonRequest("/api/admin/assets?purpose=social-share", { version: 2, image })); assert.equal(result.status, 200);
    const library = await (await list(new Request(origin + "/api/admin/assets?purpose=social-share"))).json();
    assert.equal(library.assets.find((a: { id: string }) => a.id === "LOGO005").path, image.path);
    const meta = await withSiteSocialImage(socialPageMetadata({ path: "/works/real-work", title: product.name }));
    assert.ok(JSON.stringify(meta.openGraph).includes(image.path)); assert.ok(JSON.stringify(meta.twitter).includes(image.path));
  });
  await test("stale global save cannot overwrite a newer selection", async () => assert.equal((await saveGlobal(jsonRequest("/api/admin/assets?purpose=social-share", { version: 2, image: null }))).status, 409));
  await test("B removal resets only the slot, leaves uploaded file and source record intact", async () => {
    assert.equal((await saveGlobal(jsonRequest("/api/admin/assets?purpose=social-share", { version: 3, image: null }))).status, 200);
    const library = await read(assetsFile); assert.equal(library.assets[0].path, ""); assert.equal(library.assets[0].status, "missing"); assert.equal(library.assets.length, 2);
    await fs.access(path.join(root, image.path.slice(1)));
    assert.ok(JSON.stringify((await withSiteSocialImage(socialPageMetadata({ path: "/", title: "KD" }))).openGraph).includes(DEFAULT_SOCIAL_IMAGE.url));
    await saveGlobalSocialImage(4, image);
  });
  await test("C work override saves/reloads through assets-only endpoint and preserves commerce", async () => {
    const result = await saveProducts(jsonRequest("/api/admin/products", { scope: "assets", products: [{ slug: product.slug, assets: { socialShare: image } }] })); assert.equal(result.status, 200, await result.clone().text());
    const stored = (await read(websiteFile)).menu.products[0]; assert.equal(stored.assets.socialShare.path, image.path);
    assert.deepEqual({ ...stored, assets: product.assets }, product);
    assert.equal(resolveWorkSocialImages(stored)[0], image.path);
  });
  await test("D work without override uses authoritative Hero, keeping optional legacy records valid", () => {
    assert.ok(!("socialShare" in product.assets));
    const meta = socialPageMetadata({ path: "/works/real-work", title: product.name, images: resolveWorkSocialImages(product) });
    assert.ok(JSON.stringify(meta.openGraph).includes(product.assets.hero.path));
  });
  await test("E work without images falls back to configured global image", async () => {
    const meta = await withSiteSocialImage(socialPageMetadata({ path: "/works/real-work", title: product.name, images: resolveWorkSocialImages({ ...product, assets: {} }) }));
    assert.ok(JSON.stringify(meta.openGraph).includes(image.path));
  });
  await test("work removal clears override without deleting Hero or changing commerce", async () => {
    const result = await saveProducts(jsonRequest("/api/admin/products", { scope: "assets", products: [{ slug: product.slug, assets: { socialShare: { path: "", media: null } } }] })); assert.equal(result.status, 200);
    const stored = (await read(websiteFile)).menu.products[0]; assert.deepEqual(stored.assets.hero, product.assets.hero);
    assert.ok(JSON.stringify(socialPageMetadata({ path: "/works/real-work", title: product.name, images: resolveWorkSocialImages(stored) }).openGraph).includes(product.assets.hero.path));
  });
  await test("PageStore optional override saves/publishes/reloads without altering unrelated pages", async () => {
    const draft = { ...page.draft, socialImage: image }; validatePageDraft(draft);
    const result = await savePage(jsonRequest("/api/admin/pages/" + page.id, { version: 1, operation: "publish", draft }), { params: Promise.resolve({ id: page.id }) }); assert.equal(result.status, 200, await result.clone().text());
    const saved = (await read(pagesFile)).pages[0]; assert.deepEqual(saved.draft.socialImage, image); assert.deepEqual(saved.publishedSnapshot.socialImage, image);
    const legacy = createPage("舊頁面", []); validatePageDraft(legacy.draft); assert.ok(!("socialImage" in legacy.draft));
  });
  await test("Gift SEO override saves/reloads/removes through existing CMS without a new store", async () => {
    const { DEFAULT_GIFT_LANDING } = await import("../lib/giftCms");
    const { saveGiftCmsDocument, readGiftCmsState } = await import("../lib/giftCmsStore");
    const document = structuredClone(DEFAULT_GIFT_LANDING);
    document.seo.image = { url: image.path, alt: image.alt, caption: "" };
    await saveGiftCmsDocument({ revision: 0, scope: "landing", document });
    assert.deepEqual((await readGiftCmsState()).landing?.seo.image, document.seo.image);
    const withoutImage = { ...document, seo: { ...document.seo, image: null } };
    await saveGiftCmsDocument({ revision: 1, scope: "landing", document: withoutImage });
    assert.deepEqual((await readGiftCmsState()).landing, withoutImage);
    await assert.rejects(() => saveGiftCmsDocument({ revision: 2, scope: "landing", document: { ...document, seo: { ...document.seo, image: { url: "https://evil.example/a.jpg", alt: "bad", caption: "" } } } }));
    assert.deepEqual((await readGiftCmsState()).landing, withoutImage);
  });
  const publicId = "kd-coffee/videos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const media = { type: "video", provider: "cloudinary", publicId, url: `https://res.cloudinary.com/test/video/upload/${publicId}.mp4`, posterUrl: `https://res.cloudinary.com/test/video/upload/${publicId}.jpg` };
  for (const [name, background, expected] of [
    ["F Monthly Menu poster wins over background", { media, image: image.path }, media.posterUrl],
    ["G Monthly Menu background wins when poster absent", { media: { ...media, posterUrl: undefined }, image: image.path }, image.path],
    ["H video is never selected as og:image", { media: { ...media, posterUrl: undefined } }, DEFAULT_SOCIAL_IMAGE.url],
  ] as const) await test(name, () => assert.ok(JSON.stringify(socialPageMetadata({ path: "/monthly-menu", title: "月選", images: monthlySocialImages(background) }).openGraph).includes(expected)));
  await test("I cleanup retains Monthly Menu poster's source video; new local OG uploads are outside video deletion scope", () => {
    const snapshot = collectCloudinaryVideoUsage({}, { menu: { background: { media }, products: [{ assets: { socialShare: image } }] } });
    assert.ok(snapshot.referencedPublicIds.has(publicId)); assert.equal(snapshot.referencedPublicIds.size, 1);
    assert.ok(image.path.startsWith("/uploads/assets/"));
  });
  for (const unsafe of ["blob:test", "http://localhost/a.png", "/uploads/member-avatars/a.png", "/uploads/order-notifications/a.png", "/api/private/a.jpg", "https://evil.example/a.jpg", "https://res.cloudinary.com/test/image/upload/s--signed--/kd-coffee/images/a.jpg", "/uploads/assets/test/video.mp4"]) {
    await test("K unsafe media rejected: " + unsafe, async () => {
      assert.throws(() => validateSocialImageValue({ path: unsafe, alt: "bad" }));
      const before = await fs.readFile(assetsFile);
      assert.equal((await saveGlobal(jsonRequest("/api/admin/assets?purpose=social-share", { version: 5, image: { path: unsafe, alt: "bad" } }))).status, 400);
      assert.deepEqual(await fs.readFile(assetsFile), before);
    });
  }
  await test("valid-looking but unregistered paths cannot be saved", async () => {
    await assert.rejects(() => saveGlobalSocialImage(5, { path: "/uploads/assets/page-builder/not-real.jpg", alt: "bad" }));
    assert.equal(isSocialLibraryImage({ ...uploaded, path: "/uploads/member-avatars/a.png" }), false);
  });
  await test("work endpoint rejects private images and video overrides without writing", async () => {
    const before = await fs.readFile(websiteFile);
    for (const socialShare of [{ path: "/uploads/member-avatars/a.png", alt: "bad" }, { ...image, media: { type: "video", url: image.path } }]) {
      const result = await saveProducts(jsonRequest("/api/admin/products", { scope: "assets", products: [{ slug: product.slug, assets: { socialShare } }] }));
      assert.equal(result.status, 400); assert.deepEqual(await fs.readFile(websiteFile), before);
    }
  });
  await test("existing uploader also accepts JPEG and WebP social images", async () => {
    for (const format of ["jpeg", "webp"] as const) {
      const bytes = await sharp(png).toFormat(format).toBuffer();
      assert.equal((await upload(uploadRequest(bytes, "test." + format, "image/" + format))).status, 201);
    }
  });
  await test("Admin field renders preview, recommendation, upload/select/remove with no URL input", () => {
    const html = renderToStaticMarkup(createElement(SocialImageField, { value: image, assets: [uploaded], onChange: () => {} }));
    for (const text of ["社群分享縮圖（Open Graph）", "1200 × 630", "上傳替換圖片", "更換素材庫圖片", "移除分享圖片"]) assert.ok(html.includes(text));
    assert.ok(html.includes('type="file"')); assert.ok(!html.includes('type="url"')); assert.ok(html.includes(image.path));
  });
  console.log(`SEO.1B: ${count} PASS; all writes isolated in TEMP.`);
} finally {
  for (const [key, value] of [["KD_DATA_DIR", previous.root], ["RAILWAY_VOLUME_MOUNT_PATH", previous.mount], ["ADMIN_SESSION_SECRET", previous.secret]]) { if (value === undefined) delete process.env[key!]; else process.env[key!] = value; }
  delete state.__returnCookies;
  await fs.rm(root, { recursive: true, force: true });
}
