import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StoreCatalog } from "../lib/storeTypes";
import "./gift-frontend-test-bootstrap.mjs";

const savedEnv = { ...process.env }, oldFetch = globalThis.fetch;
const root = await fs.mkdtemp(path.join(os.tmpdir(), "KD_Gift_Hero_Truth_Test_"));
process.env.KD_DATA_DIR = root; delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
globalThis.fetch = async () => { throw new Error("Unexpected network in isolated Hero test"); };
const fixturePath = process.env.GIFT_TEST_FIXTURE!;
const fixtureBytes = await fs.readFile(fixturePath), original = JSON.parse(fixtureBytes.toString()) as StoreCatalog;
assert.equal(original.products.length, 11);
assert.ok(original.products.every(product => product.productType === "gift" && !product.published));
const catalogFile = path.join(root, "store-domain/catalog.json");
await fs.mkdir(path.dirname(catalogFile), { recursive: true });
await fs.mkdir(path.join(root, "store"), { recursive: true });
const image = { url: "/uploads/assets/gifts/owner-hero.webp", alt: "Owner 指定主視覺", caption: "" };
await fs.writeFile(path.join(root, "store/assets.json"), JSON.stringify({ version: 1, assets: [{ id: "hero-test", status: "active", path: image.url, name: image.alt, alt: image.alt }] }));
const { readGiftCmsEditor } = await import("../lib/giftCmsAdmin");
const { readPublicGiftCatalog } = await import("../lib/giftPublicReadModel");
const { readGiftCmsState, saveGiftCmsDocument, getGiftCmsFile } = await import("../lib/giftCmsStore");
const { DEFAULT_GIFT_LANDING } = await import("../lib/giftCms");
const { default: GiftExperience } = await import("../components/gifts/GiftExperience");
const { default: GiftCmsEditor } = await import("../components/admin/GiftCmsEditor");
type Payload = Awaited<ReturnType<typeof readGiftCmsEditor>>;
const renderHero = (model: Payload["model"], cms = structuredClone(DEFAULT_GIFT_LANDING)) => {
  const html = renderToStaticMarkup(React.createElement(GiftExperience, { model, cms }));
  return html.match(/<header\b[^>]*>[\s\S]*?<\/header>/)![0];
};
const renderAdmin = (initial: Payload) => renderToStaticMarkup(React.createElement(GiftCmsEditor, { initial }));
const writeCatalog = (catalog: StoreCatalog) => fs.writeFile(catalogFile, JSON.stringify(catalog));
const saveHero = async (value: typeof image | null) => {
  const state = await readGiftCmsState(), document = structuredClone(state.landing ?? DEFAULT_GIFT_LANDING);
  document.hero.image = value;
  return saveGiftCmsDocument({ scope: "landing", revision: state.revision, document });
};
let passed = 0;
const test = async (name: string, run: () => Promise<void>) => { await run(); console.log(`PASS ${++passed} ${name}`); };
try {
  await test("Case 1: empty public and Admin catalogs show the real Hero placeholder and clear guidance", async () => {
    await writeCatalog({ ...structuredClone(original), products: [] });
    const initial = await readGiftCmsEditor(), pub = await readPublicGiftCatalog();
    assert.equal(initial.model.hero, undefined); assert.equal(pub.hero, undefined);
    assert.doesNotMatch(renderHero(initial.model), /<img\b/); assert.doesNotMatch(renderHero(pub), /<img\b/);
    const html = renderAdmin(initial);
    assert.match(html, /尚未設定正式主視覺圖片/); assert.match(html, /目前正式 Gifts 頁不會顯示 Hero 圖片/); assert.match(html, /前往素材/);
  });
  await test("Case 2: selected library Hero persists canonically and renders identically without publishing products", async () => {
    const initial = await readGiftCmsEditor(), selected = initial.assets.find(asset => asset.id === "hero-test")!;
    assert.equal(selected.path, image.url);
    await saveHero({ url: selected.path, alt: selected.alt, caption: "" });
    assert.equal(getGiftCmsFile(), path.join(root, "gift-cms/content.json"));
    const stored = JSON.parse(await fs.readFile(getGiftCmsFile(), "utf8"));
    assert.deepEqual(stored.landing.hero.image, image);
    const reloaded = await readGiftCmsEditor(), pub = await readPublicGiftCatalog();
    assert.equal(pub.total, 0); assert.deepEqual(reloaded.landing.hero.image, image);
    assert.equal(renderHero(reloaded.model, reloaded.landing), renderHero(pub, stored.landing));
    assert.ok(renderHero(pub, stored.landing).includes(image.url)); assert.doesNotMatch(renderAdmin(reloaded), /尚未設定正式主視覺圖片/);
  });
  await test("Case 3: eleven draft gifts retain Admin cards but cannot supply a misleading Landing Hero", async () => {
    await saveHero(null); await writeCatalog(original);
    const before = await fs.readFile(catalogFile), initial = await readGiftCmsEditor(), pub = await readPublicGiftCatalog();
    assert.equal(initial.previewIncludesDraft, true); assert.equal(initial.model.total, 10); assert.equal(pub.total, 0);
    assert.equal(initial.model.hero, undefined); assert.doesNotMatch(renderHero(initial.model, initial.landing), /<img\b/);
    const cards = initial.model.groups.filter(group => group.slug !== "custom-gift").flatMap(group => group.gifts);
    for (const gift of cards) assert.ok(renderToStaticMarkup(React.createElement(GiftExperience, { model: initial.model, cms: initial.landing })).includes(gift.product.name));
    assert.match(renderAdmin(initial), /尚未設定正式主視覺圖片/);
    assert.deepEqual(await fs.readFile(catalogFile), before);
    assert.ok((JSON.parse(before.toString()) as StoreCatalog).products.every(product => !product.published));
    await saveHero(image);
    const withCms = await readGiftCmsEditor();
    assert.ok(renderHero(withCms.model, withCms.landing).includes(image.url)); assert.equal((await readPublicGiftCatalog()).total, 0);
    assert.deepEqual(await fs.readFile(catalogFile), before); await saveHero(null);
  });
  await test("Case 4: existing public-product Hero fallback is preserved, with accurate Admin copy", async () => {
    const publicFixture = structuredClone(original);
    publicFixture.sections.forEach(section => { section.active = true; section.published = true; section.archivedAt = null; });
    publicFixture.categories.forEach(category => { category.active = true; category.archivedAt = null; });
    publicFixture.products.forEach(product => { product.active = true; product.published = true; product.archivedAt = null; });
    await writeCatalog(publicFixture);
    const initial = await readGiftCmsEditor(), pub = await readPublicGiftCatalog();
    assert.equal(initial.previewIncludesDraft, false); assert.ok(pub.hero); assert.deepEqual(initial.model.hero, pub.hero);
    assert.equal(renderHero(initial.model, initial.landing), renderHero(pub, initial.landing));
    assert.ok(renderHero(pub, initial.landing).includes(pub.hero!.url));
    assert.match(renderAdmin(initial), /目前沿用公開 Gift 商品圖片/); assert.doesNotMatch(renderAdmin(initial), /目前正式 Gifts 頁不會顯示 Hero 圖片/);
  });
  await test("Public custom-only Hero remains truthful even when total excludes custom gifts and draft cards are included", async () => {
    const catalog = JSON.parse(await fs.readFile(catalogFile, "utf8")) as StoreCatalog;
    catalog.products.forEach(product => { product.published = product.sku === "GIFT-CUSTOM"; });
    await writeCatalog(catalog);
    const initial = await readGiftCmsEditor(), pub = await readPublicGiftCatalog();
    assert.equal(pub.total, 0); assert.ok(pub.hero); assert.equal(initial.previewIncludesDraft, true); assert.equal(initial.model.total, 10);
    assert.deepEqual(initial.model.hero, pub.hero); assert.equal(renderHero(initial.model, initial.landing), renderHero(pub, initial.landing));
  });
  await test("Original draft fixture and public renderer/gates are unchanged", async () => {
    assert.deepEqual(await fs.readFile(fixturePath), fixtureBytes);
    const protectedPaths = ["components/gifts/GiftExperience.tsx", "app/gifts/page.tsx", "lib/giftPublicReadModel.ts", "lib/giftPresentation.ts", "lib/storePublicSelectors.ts", "lib/giftCmsStore.ts"];
    const { execFileSync } = await import("node:child_process");
    assert.equal(execFileSync("git", ["diff", "HEAD", "--", ...protectedPaths], { encoding: "utf8" }), "");
    console.log("Draft source SHA256 " + crypto.createHash("sha256").update(fixtureBytes).digest("hex"));
  });
  console.log(`GIFTS HERO TRUTHFULNESS: ${passed} PASS / 0 FAIL; TEMP ${root}`);
} finally {
  globalThis.fetch = oldFetch;
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
}
