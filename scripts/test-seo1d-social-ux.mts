import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AssetRecord } from "../lib/assets";
import SocialImageField from "../components/admin/SocialImageField";
import StoreLandingFields from "../components/admin/StoreLandingFields";
import { DEFAULT_SOCIAL_IMAGE, socialPageMetadata, monthlySocialImages } from "../lib/socialMetadata";
import { homepageSocialMetadata, customerServiceSocialMetadata } from "../lib/systemPageSocialMetadata";
import { withSiteSocialImage } from "../lib/siteSocialImage";
import { DEFAULT_SERVICE_DOCUMENT, validateServiceDocument } from "../lib/customerServiceContent";
import { storeLandingDefaults } from "../lib/giftCms";
import { storeContentMetadata } from "../lib/storeContentStudio";
import { storeLandingMetadata, storeProductMetadata } from "../lib/storePublicMetadata";
// @ts-expect-error -- Native Node tests require the explicit extension.
import nextConfig from "../next.config.ts";

const protectedSources = ["app/monthly-menu/page.tsx", "lib/monthlyMenuBackground.ts", "components/monthly-menu/MonthlyMenuVideo.tsx", "app/store/[slug]/page.tsx", "lib/storePublicMetadata.ts"];
async function fingerprints() {
  const result: Record<string, string> = {};
  async function visit(directory: string) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name); if (entry.isDirectory()) await visit(file);
      else result[file] = createHash("sha256").update(await fs.readFile(file)).digest("hex");
    }
  }
  for (const directory of ["data", "public/data", "public/uploads"]) await visit(directory);
  for (const file of protectedSources) result[file] = createHash("sha256").update(await fs.readFile(file)).digest("hex");
  return result;
}
const before = await fingerprints();
const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-seo1d-"));
const saved = { root: process.env.KD_DATA_DIR, mount: process.env.RAILWAY_VOLUME_MOUNT_PATH, secret: process.env.ADMIN_SESSION_SECRET };
process.env.KD_DATA_DIR = root; delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.ADMIN_SESSION_SECRET = "isolated-seo1d-owner-test-session-secret-long";
const state = globalThis as typeof globalThis & { __returnCookies?: Record<string, string> };
let passed = 0;
async function test(name: string, run: () => void | Promise<void>) { await run(); console.log(`PASS ${++passed}: ${name}`); }
const json = async (file: string) => JSON.parse(await fs.readFile(file, "utf8"));
const origin = "https://www.kdcoffee1962.com";
function imageUrl(metadata: Awaited<ReturnType<typeof homepageSocialMetadata>>) {
  const og = metadata.openGraph as { images: { url: string }[] };
  const twitter = metadata.twitter as { images: { url: string }[] };
  assert.equal(og.images[0].url, twitter.images[0].url);
  return og.images[0].url;
}
try {
  const { getAssetsDataFile, getPagesDataFile } = await import("../lib/storagePaths");
  const assetsFile = getAssetsDataFile(), pagesFile = getPagesDataFile();
  assert.ok(assetsFile.startsWith(root) && pagesFile.startsWith(root));
  await fs.mkdir(path.dirname(assetsFile), { recursive: true });
  const assets: AssetRecord[] = [];
  const bytes = await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#82664a" } }).png().toBuffer();
  for (const id of ["LOGO005", "LOGO001", "HOME", "SERVICE", "HERO", "STORE"]) {
    const imagePath = `/uploads/assets/page-builder/test-${id.toLowerCase()}.png`;
    const file = path.join(root, imagePath.slice(1)); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, bytes);
    assets.push({ id, path: imagePath, alt: "KD 測試圖片", category: "page-builder", name: id, status: "active", usage: "test", format: "PNG", recommendedSize: "1200×630", displaySize: "", seoStem: "test" });
  }
  const asset = (id: string) => assets.find(item => item.id === id)!;
  const value = (id: string) => ({ path: asset(id).path, alt: asset(id).alt, assetId: id });
  async function library(global = true, logo = true) {
    await fs.writeFile(assetsFile, JSON.stringify({ version: 1, updatedAt: "", assets: assets.map(item => ({ ...item, status: item.id === "LOGO005" && !global || item.id === "LOGO001" && !logo ? "missing" : item.status })) }));
  }
  await library();
  await fs.writeFile(pagesFile, JSON.stringify({ version: 1, updatedAt: "", pages: [], systemPages: { other: { preserved: true } } }));
  const { PUT: savePageSettings } = await import("../app/api/admin/pages/route");
  const { PUT: saveService } = await import("../app/api/admin/customer-service/route");
  const { readCustomerServiceState, getCustomerServiceFile } = await import("../lib/customerServiceStore");
  const { createAdminSessionValue, adminCookieName } = await import("../lib/adminAuth");
  const request = (url: string, body: unknown, source = "http://localhost") => new Request("http://localhost" + url, { method: "PUT", headers: { Origin: source, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const owner = (role: "owner" | "admin" = "owner") => { state.__returnCookies = { [adminCookieName]: createAdminSessionValue({ adminId: "owner", role }) }; };
  await test("Homepage setting requires Owner and same-origin writes", async () => {
    state.__returnCookies = {}; assert.equal((await savePageSettings(request("/api/admin/pages", { scope: "homepageSeo", version: 1, image: value("HOME") }))).status, 401);
    owner("admin"); assert.equal((await savePageSettings(request("/api/admin/pages", { scope: "homepageSeo", version: 1, image: value("HOME") }))).status, 403);
    owner(); assert.equal((await savePageSettings(request("/api/admin/pages", { scope: "homepageSeo", version: 1, image: value("HOME") }, "https://evil.example"))).status, 403);
  });
  await test("A Homepage override saves/reloads in PageStore and beats global", async () => {
    const response = await savePageSettings(request("/api/admin/pages", { scope: "homepageSeo", version: 1, image: value("HOME") })); assert.equal(response.status, 200, await response.clone().text());
    const store = await json(pagesFile); assert.deepEqual(store.systemPages.homepage.seo.socialImage, value("HOME")); assert.deepEqual(store.systemPages.other, { preserved: true });
    assert.equal(imageUrl(await homepageSocialMetadata(store.systemPages.homepage.seo.socialImage)), origin + asset("HOME").path);
  });
  await test("Homepage removal and optimistic version conflict preserve unrelated settings", async () => {
    assert.equal((await savePageSettings(request("/api/admin/pages", { scope: "homepageSeo", version: 1, image: null }))).status, 409);
    assert.equal((await savePageSettings(request("/api/admin/pages", { scope: "homepageSeo", version: 2, image: null }))).status, 200);
    const store = await json(pagesFile); assert.ok(!("socialImage" in store.systemPages.homepage.seo)); assert.deepEqual(store.systemPages.other, { preserved: true });
  });
  await test("B Homepage without override uses global, without selecting Hero", async () => assert.equal(imageUrl(await homepageSocialMetadata()), origin + asset("LOGO005").path));
  await test("C/J active current Logo beats static emergency when global absent", async () => {
    await library(false); assert.equal(imageUrl(await homepageSocialMetadata()), origin + asset("LOGO001").path);
  });
  await test("K emergency Logo remains the final fallback", async () => {
    await library(false, false); assert.equal(imageUrl(await homepageSocialMetadata()), DEFAULT_SOCIAL_IMAGE.url);
  });
  await test("missing active Logo file safely falls through to emergency", async () => {
    await library(false); await fs.rename(path.join(root, asset("LOGO001").path.slice(1)), path.join(root, "held-logo.png"));
    try { assert.equal(imageUrl(await homepageSocialMetadata()), DEFAULT_SOCIAL_IMAGE.url); }
    finally { await fs.rename(path.join(root, "held-logo.png"), path.join(root, asset("LOGO001").path.slice(1))); }
  });
  await test("unreadable registry retains emergency fallback", async () => {
    const registry = await fs.readFile(assetsFile); await fs.writeFile(assetsFile, "invalid json");
    try { assert.equal(imageUrl(await homepageSocialMetadata()), DEFAULT_SOCIAL_IMAGE.url); }
    finally { await fs.writeFile(assetsFile, registry); }
  });
  await library();
  await test("explicit page selection of emergency artwork still wins over global", async () => {
    const metadata = socialPageMetadata({ path: "/", title: "KD", images: [DEFAULT_SOCIAL_IMAGE.url] });
    assert.equal(imageUrl(await withSiteSocialImage(metadata)), DEFAULT_SOCIAL_IMAGE.url);
  });
  const service = structuredClone(DEFAULT_SERVICE_DOCUMENT);
  service.config.socialImage = value("SERVICE"); service.config.hero = { src: asset("HERO").path, alt: "客服主視覺", position: "center" };
  await test("D Customer Service override saves/reloads through its existing document and beats Hero", async () => {
    const response = await saveService(request("/api/admin/customer-service", { revision: 0, document: service })); assert.equal(response.status, 200, await response.clone().text());
    const stored = await readCustomerServiceState(); assert.deepEqual(stored.document.config.socialImage, value("SERVICE"));
    assert.equal(imageUrl(await customerServiceSocialMetadata(stored.document.config)), origin + asset("SERVICE").path);
  });
  await test("E Customer Service removal uses its authoritative Hero", async () => {
    const document = structuredClone(service); delete document.config.socialImage;
    assert.equal((await saveService(request("/api/admin/customer-service", { revision: 1, document }))).status, 200);
    const stored = await readCustomerServiceState(); assert.equal(imageUrl(await customerServiceSocialMetadata(stored.document.config)), origin + asset("HERO").path);
    assert.deepEqual(stored.document.cards, service.cards); assert.deepEqual(stored.document.faqs, service.faqs);
  });
  await test("F Customer Service uses global when no Hero is configured", async () => {
    assert.equal(imageUrl(await customerServiceSocialMetadata({ ...service.config, socialImage: undefined, hero: null })), origin + asset("LOGO005").path);
  });
  await test("missing legacy/default Customer Service Hero never produces a 404 OG image", async () => {
    assert.equal(imageUrl(await customerServiceSocialMetadata(DEFAULT_SERVICE_DOCUMENT.config)), origin + asset("LOGO005").path);
  });
  await test("legacy Customer Service documents without socialImage still validate", () => {
    const legacy = structuredClone(DEFAULT_SERVICE_DOCUMENT); validateServiceDocument(legacy); assert.ok(!("socialImage" in legacy.config));
  });
  await test("private/unregistered Homepage and Customer Service images cannot be persisted", async () => {
    const pageBytes = await fs.readFile(pagesFile), serviceBytes = await fs.readFile(getCustomerServiceFile());
    for (const unsafe of ["/uploads/member-avatars/a.png", "/uploads/order-notifications/a.png", "http://localhost/a.png", "/uploads/assets/page-builder/missing.png", "/uploads/assets/page-builder/video.mp4"]) {
      assert.equal((await savePageSettings(request("/api/admin/pages", { scope: "homepageSeo", version: 3, image: { path: unsafe, alt: "bad" } }))).status, 400);
      const document = structuredClone(service); document.config.socialImage = { path: unsafe, alt: "bad" };
      assert.equal((await saveService(request("/api/admin/customer-service", { revision: 2, document }))).status, 400);
    }
    assert.deepEqual(await fs.readFile(pagesFile), pageBytes); assert.deepEqual(await fs.readFile(getCustomerServiceFile()), serviceBytes);
  });
  const store = storeLandingDefaults({ title: "商店", subtitle: "商品" });
  store.hero.image = { url: asset("HERO").path, alt: "商店主視覺", caption: "" };
  store.seo.image = { url: asset("STORE").path, alt: "商店分享圖", caption: "" };
  await test("G Store explicit SEO image wins and uses both OG and Twitter", async () => {
    assert.equal(imageUrl(await withSiteSocialImage(storeContentMetadata(storeLandingMetadata(), store))), origin + asset("STORE").path);
  });
  await test("H Store Hero fallback is preserved", async () => {
    assert.equal(imageUrl(await withSiteSocialImage(storeContentMetadata(storeLandingMetadata(), { ...store, seo: { ...store.seo, image: null } }))), origin + asset("HERO").path);
  });
  await test("I modern Store control persists through unchanged storeLanding.seo.image", async () => {
    const { emptyStoreCatalog } = await import("../lib/storeRepository");
    const file = path.join(root, "store-domain/catalog.json"); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(emptyStoreCatalog()));
    const { saveGiftCmsDocument, readGiftCmsState } = await import("../lib/giftCmsStore");
    await saveGiftCmsDocument({ scope: "storeLanding", revision: 0, document: store });
    assert.deepEqual((await readGiftCmsState()).storeLanding?.seo.image, store.seo.image);
    const withoutImage = { ...store, seo: { ...store.seo, image: null } };
    await saveGiftCmsDocument({ scope: "storeLanding", revision: 1, document: withoutImage });
    assert.deepEqual((await readGiftCmsState()).storeLanding, withoutImage);
    const modern = createElement(SocialImageField, { value: value("STORE"), assets, onChange: () => {}, help: "分享商店首頁至 LINE、Facebook、Messenger 等平台時使用。建議尺寸 1200 × 630 px。" });
    const html = renderToStaticMarkup(createElement(StoreLandingFields, { document: store, selected: 0, tab: "seo", onChange: () => {}, imageFields: () => { throw Error("Legacy SEO control used"); }, socialImageField: modern }));
    for (const label of ["社群分享縮圖（Open Graph）", "上傳替換圖片", "更換素材庫圖片", "移除分享圖片", "1200 × 630"]) assert.ok(html.includes(label));
  });
  await test("L Monthly Menu poster/image choice unchanged", async () => {
    const poster = "https://res.cloudinary.com/test/video/upload/kd-coffee/videos/test.jpg";
    assert.equal(imageUrl(await withSiteSocialImage(socialPageMetadata({ path: "/monthly-menu", title: "月選", images: monthlySocialImages({ media: { posterUrl: poster }, image: asset("HOME").path }) }))), poster);
    assert.equal(imageUrl(await withSiteSocialImage(socialPageMetadata({ path: "/monthly-menu", title: "月選", images: monthlySocialImages({ image: asset("HOME").path }) }))), origin + asset("HOME").path);
  });
  await test("M Store product still automatically uses its Hero without an override field", async () => {
    const model = { product: { name: "商品", slug: "product", shortDescription: "", description: "商品內容", price: 100, inStock: true, featured: false, section: { slug: "section", name: "專區" }, specifications: [], gallery: [], heroMedia: { type: "image" as const, url: asset("STORE").path, alt: "商品主圖" } }, manualSeo: {} };
    assert.equal(imageUrl(await withSiteSocialImage(storeProductMetadata(model))), origin + asset("STORE").path);
    assert.ok(!("socialImage" in model.product));
  });
  await test("N protected runtime data and excluded page/media sources remain byte-identical", async () => assert.deepEqual(await fingerprints(), before));
  await test("LINE gets blocking head metadata while the installed Next default bot list is preserved", async () => {
    const { HTML_LIMITED_BOT_UA_RE } = await import("next/dist/shared/lib/router/utils/html-bots.js");
    const bots = nextConfig.htmlLimitedBots!;
    assert.ok(bots.source.startsWith(HTML_LIMITED_BOT_UA_RE.source + "|"));
    for (const agent of ["Line/1.0", "LineBot", "facebookexternalhit/1.1", "Twitterbot/1.0", "Slackbot", "Bingbot"]) assert.ok(bots.test(agent));
    assert.equal(bots.test("Mozilla/5.0"), false);
  });
  console.log(`SEO.1D: ${passed} PASS; isolated TEMP only.`);
} finally {
  for (const [key, value] of [["KD_DATA_DIR", saved.root], ["RAILWAY_VOLUME_MOUNT_PATH", saved.mount], ["ADMIN_SESSION_SECRET", saved.secret]]) {
    if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
  }
  delete state.__returnCookies;
  await fs.rm(root, { recursive: true, force: true });
}
