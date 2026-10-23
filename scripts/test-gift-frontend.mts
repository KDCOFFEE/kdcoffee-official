import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import type { StoreCatalog } from "../lib/storeTypes";

import "./gift-frontend-test-bootstrap.mjs";
const { default: GiftExperience } = await import("../components/gifts/GiftExperience");
const { default: StoreProductCard } = await import("../components/store/StoreProductCard");
const { selectPublicGiftCatalog, giftPageMetadata, GIFT_CATEGORIES } = await import("../lib/giftPresentation");
const { resolveHomepageNavigation } = await import("../lib/homepageCms");
const { resolveCmsLink } = await import("../lib/cmsLinks");
const { findPublicStoreProductBySlug } = await import("../lib/storePublicSelectors");
const { storeProductHref } = await import("../lib/storePublicMetadata");

const root = await fs.mkdtemp(path.join(os.tmpdir(), "KD_Gift_Frontend_Test_"));
process.env.KD_DATA_DIR = root;
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
const { createStoreRepository } = await import("../lib/storeRepository");
const { readPublicGiftCatalog } = await import("../lib/giftPublicReadModel");
const protectedFiles = ["public/data/website-data.json", "public/data/homepage.json", "data/store-domain/catalog.json"];
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const hashes = async () => Promise.all(protectedFiles.map(async file => {
  try { return hash(await fs.readFile(file)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return "MISSING"; throw error; }
}));
const before = await hashes();
const original = JSON.parse(await fs.readFile(process.env.GIFT_TEST_FIXTURE!, "utf8")) as StoreCatalog;
const sourceHash = hash(await fs.readFile(process.env.GIFT_TEST_FIXTURE!));
const published = () => {
  const c = structuredClone(original);
  c.sections.forEach(section => { section.published = true; });
  c.products.forEach(product => { product.published = true; });
  return c;
};
let passed = 0;
async function test(name: string, run: () => unknown | Promise<unknown>) {
  await run(); console.log("PASS " + (++passed) + " " + name);
}
const render = (c: StoreCatalog) => renderToStaticMarkup(React.createElement(GiftExperience, { model: selectPublicGiftCatalog(c, "測試點") }));

await test("DRAFT source fixture remains eleven private gifts", () => {
  assert.equal(original.products.length, 11);
  assert.ok(original.products.every(p => p.productType === "gift" && !p.published));
});
await test("DRAFT fields, names and media never leak into empty Gift HTML", () => {
  const html = render(original);
  assert.match(html, /禮盒正在準備中/);
  for (const p of original.products) { assert.ok(!html.includes(p.name)); assert.ok(!html.includes(p.heroMedia!.url)); }
});
await test("Empty page keeps branded Hero, four categories, help and contact", () => {
  const html = render(original);
  for (const id of ["gift-categories", "curated-gifts", "gift-selection-help", "custom-gifting"]) assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(html, /https:\/\/line.me\/R\/ti\/p\/@kdcoffee/);
});
await test("All canonical eligible Gift drafts render only after TEMP clone publication", () => {
  const c = published(); const html = render(c);
  assert.equal(selectPublicGiftCatalog(c).total, c.products.length - 1);
  for (const p of c.products.filter(p => p.sku !== "GIFT-CUSTOM")) assert.ok(html.includes(p.name));
});
for (const state of ["published", "active", "archived"] as const) {
  await test("Store product " + state + " publication gate is authoritative", () => {
    const c = published(); const p = c.products[0];
    if (state === "published") p.published = false;
    if (state === "active") p.active = false;
    if (state === "archived") p.archivedAt = p.updatedAt;
    assert.equal(findPublicStoreProductBySlug(c, p.slug), null);
    assert.ok(!render(c).includes(p.name));
  });
}
await test("Unpublished section hides all products and Hero media", () => {
  const c = published(); c.sections[0].published = false;
  assert.equal(selectPublicGiftCatalog(c).total, 0); assert.equal(selectPublicGiftCatalog(c).hero, undefined);
});
await test("Inactive category follows canonical Store filtering", () => {
  const c = published(); c.categories[0].active = false;
  const hidden = c.products.filter(p => p.categoryId === c.categories[0].id);
  for (const p of hidden) assert.ok(!render(c).includes(p.name));
});
await test("General Store product is excluded even with Gift-looking name/category", () => {
  const c = published(); c.products[0].productType = "general";
  assert.ok(!render(c).includes(c.products[0].name)); assert.equal(selectPublicGiftCatalog(c).total, 9);
});
await test("Gift section is resolved by canonical section slug", () => {
  const c = published(); c.sections[0].slug = "another-section";
  assert.equal(selectPublicGiftCatalog(c).total, 0);
});
for (const category of GIFT_CATEGORIES) {
  await test(category.slug + " category anchors and grouping are exact", () => {
    const c = published(); const group = selectPublicGiftCatalog(c).groups.find(g => g.slug === category.slug)!;
    const ids = c.categories.filter(x => x.slug === category.slug).map(x => x.id);
    assert.deepEqual(group.gifts.map(g => g.product.slug), c.products.filter(p => ids.includes(p.categoryId!)).map(p => p.slug));
    assert.match(render(c), new RegExp('id="' + category.slug + '"'));
  });
}
await test("Public detail URLs remain canonical /store routes", () => {
  const c = published(); const html = render(c);
  for (const p of c.products.filter(p => p.sku !== "GIFT-CUSTOM")) assert.ok(html.includes('href="' + storeProductHref(p.slug) + '"'));
  assert.doesNotMatch(html, /href="\/gifts\//);
});
await test("Store card remains the only pricing presentation; sale/zero semantics identical", () => {
  for (const salePrice of [undefined, 200, 0, 800]) {
    const c = published(); c.products[0].price = 500; c.products[0].salePrice = salePrice;
    const card = selectPublicGiftCatalog(c).groups[0].gifts[0].product;
    const expected = renderToStaticMarkup(React.createElement(StoreProductCard, { product: card })).match(/<strong>.*?<\/strong>/)![0];
    assert.ok(render(c).includes(expected));
  }
});
await test("Compact cards use Store specifications without repeating long descriptions", () => {
  const c = published(); c.products[0].shortDescription = "唯一的後台簡介";
  c.products[0].specifications = [{key:"size", label:"規格", value:"後台規格 77 入", sortOrder:0}];
  const html = render(c); assert.doesNotMatch(html, /唯一的後台簡介/); assert.match(html, /後台規格 77 入/);
});
await test("Copy is safely escaped", () => {
  const c = published(); c.products[0].name = "<script>bad()</script>";
  assert.match(render(c), /&lt;script&gt;bad\(\)&lt;\/script&gt;/); assert.doesNotMatch(render(c), /<script>bad/);
});
await test("Positioning does not invent custom badge", () => {
  const c = published(); const model = selectPublicGiftCatalog(c);
  assert.equal(model.groups[0].gifts[0].label, "輕巧送禮");
  assert.equal(model.groups[3].gifts[0].label, undefined);
});
await test("Hero uses public existing media and follows later Store media replacement", () => {
  const c = published(); c.products.find(p => p.sku === "GIFT-CUSTOM")!.heroMedia!.url = "/uploads/assets/custom/replacement.png";
  assert.equal(selectPublicGiftCatalog(c).hero!.url, "/uploads/assets/custom/replacement.png");
});
await test("All pages are included beyond the Store page-size limit", () => {
  const c = published();
  for (let i=0;i<30;i++) c.products.push({...structuredClone(c.products[0]),id:"extra-"+i,slug:"extra-"+i,sku:"EXTRA-"+i,sortOrder:20+i});
  assert.equal(selectPublicGiftCatalog(c).total,40);
});
await test("Read model uses TEMP catalog, never initializes on read", async () => {
  assert.equal((await readPublicGiftCatalog()).total,0);
  await assert.rejects(fs.stat(path.join(root,"store-domain/catalog.json")), {code:"ENOENT"});
  const c=published();
  await fs.mkdir(path.join(root,"store-domain"),{recursive:true});
  await fs.writeFile(path.join(root,"store-domain/catalog.json"),JSON.stringify(c));
  const bytes=await fs.readFile(path.join(root,"store-domain/catalog.json"));
  assert.equal((await readPublicGiftCatalog()).total,10);
  assert.deepEqual(await fs.readFile(path.join(root,"store-domain/catalog.json")),bytes);
});
await test("CMS Gift destination resolves to /gifts", () => assert.equal(resolveCmsLink({type:"internal",target:"gifts"}).href,"/gifts"));
await test("Legacy Gift shortcut upgrades through CMS resolver, desktop/mobile shared", () => {
  const nav=resolveHomepageNavigation(undefined);
  assert.equal(nav.filter(n=>n.href==="/gifts").length,1);
});
await test("CMS disabled Gift entry remains disabled, custom targets remain unchanged", () => {
  const nav=resolveHomepageNavigation([{id:"custom",label:"自訂",href:"/custom",enabled:false},{id:"gift",label:"送禮",href:{type:"internal",target:"gifts"},enabled:false}]);
  assert.equal(nav.length,2);assert.equal(nav[0].href,"/custom");assert.equal(nav[1].enabled,false);
});
await test("CMS nav additions are idempotent and do not mutate input", () => {
  const input=[{id:"works",label:"咖啡",href:"/works"}];const bytes=JSON.stringify(input);
  const once=resolveHomepageNavigation(input);assert.equal(JSON.stringify(input),bytes);
  assert.deepEqual(resolveHomepageNavigation(once),once);
});
await test("Metadata canonical and title are exact; existing SEO gate is respected", () => {
  assert.deepEqual(giftPageMetadata(false).alternates,{canonical:"/gifts"});
  assert.deepEqual(giftPageMetadata(false).robots,{index:false,follow:true});
  assert.deepEqual(giftPageMetadata(true).robots,{index:true,follow:true});
  assert.deepEqual(giftPageMetadata(true).title,{absolute:"送禮專區｜精品咖啡禮盒｜KD Coffee"});
});
await test("Semantic headings and anchors are keyboard-native with no filter JS", async () => {
  const html=render(published());
  assert.equal((html.match(/<h1>/g)||[]).length,1);
  assert.match(html,/aria-label="依禮盒類型挑選"/);
  assert.match(html,/id="gifts-main" tabindex="-1"/);
  assert.ok((html.match(/loading="lazy"/g)||[]).length>=10);
  assert.match(html,/fetchPriority="high"/i);
  const css=await fs.readFile("components/gifts/GiftExperience.module.css","utf8");
  assert.match(css,/focus-visible/);assert.match(css,/prefers-reduced-motion/);assert.match(css,/max-width:640px/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
});
await test("No cart/checkout/Works or pricing/PV dependency in Gift frontend", async () => {
  const sources=await Promise.all(["components/gifts/GiftExperience.tsx","lib/giftPresentation.ts","lib/giftPublicReadModel.ts","app/gifts/page.tsx"].map(p=>fs.readFile(p,"utf8")));
  for (const source of sources) {
    assert.doesNotMatch(source,/from ["'][^"']*(?:commerce|checkout|membership|worksArtwork|reward|orderReward)/i);
    assert.doesNotMatch(source,/salePrice\s*[<>]|pvValue\s*[*\/]|createOrder|addToCart|readFile/);
  }
});
await test("Store-style image-led hero has one primary CTA and concise copy", () => {
  const html=render(published()); const hero=html.split("</header>")[0];
  assert.match(hero,/挑選禮盒/); assert.doesNotMatch(hero,/客製送禮需求|<br/);
  assert.equal((hero.match(/<a /g)||[]).length,1);
  assert.match(hero,/為日常問候、節慶心意與重要的人，準備一份剛剛好的咖啡禮。/);
});
await test("Compact selector replaces descriptive category cards", () => {
  const html=render(published()); const selector=html.split('id="gift-categories"')[1].split('</section>')[0];
  assert.match(selector,/選你想送的方式/);
  for(const label of ["耳掛咖啡","咖啡豆","咖啡 × 手沖","客製禮盒"]) assert.ok(selector.includes(label));
  assert.equal((selector.match(/<a /g)||[]).length,4);
  assert.doesNotMatch(selector,/初次送禮|手沖愛好者|重要送禮/);
});
await test("Brand value section and redundant card breadcrumbs are removed",()=>{
  const html=render(published());
  assert.doesNotMatch(html,/禮物裡，還有我們對咖啡的堅持|禮盒專區 ／/);
});
await test("Points are canonical PV with configured global name; no invented conversion",()=>{
  const c=published();c.products[0].pvValue=88;
  const html=render(c); assert.match(html,/可獲得 88 測試點/);
  assert.doesNotMatch(html,/KD點/);
  assert.ok(!renderToStaticMarkup(React.createElement(GiftExperience,{model:selectPublicGiftCatalog(c,"")})).includes('可獲得 88 測試點'));
});
await test("Zero unconfigured unavailable price never implies a free Gift",()=>{
  const html=render(published());assert.match(html,/價格待設定/);assert.doesNotMatch(html,/NT\$ 0/);
});
await test("Custom Gift remains inquiry-only with no purchase card or invented price",()=>{
  const c=published();const custom=c.products.find(p=>p.sku==="GIFT-CUSTOM")!;
  const html=render(c);assert.match(html,/客製需求請洽詢/);
  assert.ok(!html.includes('href="'+storeProductHref(custom.slug)+'"'));
  assert.match(html,/詢問客製禮盒/); assert.doesNotMatch(html,/加入購物車/);
});
await test("No unauthenticated preview query can alter the publication selector",async()=>{
  const source=await fs.readFile("app/gifts/page.tsx","utf8");
  assert.doesNotMatch(source,/searchParams|preview/);assert.equal(selectPublicGiftCatalog(original).total,0);
});
await test("FULL QA copy has exactly ten synthetic public products and private inquiry",async()=>{
  const full=JSON.parse(await fs.readFile(process.env.GIFT_FULL_FIXTURE!,"utf8")) as StoreCatalog;
  const normal=full.products.filter(p=>p.productType==="gift"&&p.sku!=="GIFT-CUSTOM");
  assert.equal(normal.length,10);
  assert.ok(normal.every(p=>p.price===1234&&p.inventory===99&&p.pvValue===88&&p.published));
  assert.equal(normal.filter(p=>p.salePrice!==undefined).length,1);
  assert.equal(normal.find(p=>p.salePrice!==undefined)!.salePrice,999);
  const custom=full.products.find(p=>p.sku==="GIFT-CUSTOM")!;
  assert.equal(custom.published,false);assert.equal(custom.price,0);assert.equal(custom.inventory,0);assert.equal(custom.pvValue,0);
  assert.equal(selectPublicGiftCatalog(full).total,10);
  const html=render(full);assert.match(html,/NT\$ 999/);assert.match(html,/<del>NT\$ 1,234<\/del>/);assert.match(html,/可獲得 88 測試點/);
});
await test("FULL QA existing Store offer accepts each Gift through the canonical API",async()=>{
  const c=JSON.parse(await fs.readFile(process.env.GIFT_FULL_FIXTURE!,"utf8")) as StoreCatalog;
  await fs.writeFile(path.join(root,"store-domain/catalog.json"),JSON.stringify(c));
  process.env.STORE_COMMERCE_ENABLED="true";
  const {POST}=await import("../app/api/commerce/store/offer/route");
  for(const p of c.products.filter(p=>p.productType==="gift"&&p.sku!=="GIFT-CUSTOM")){
    const r=await POST(new Request("http://localhost/api/commerce/store/offer",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({slug:p.slug})}));
    assert.equal(r.status,200);const body=await r.json();assert.equal(body.domain,"store");assert.equal(body.productId,p.id);assert.equal(body.unitPrice,p.salePrice ?? p.price);assert.equal(body.quantityLimit,99);
  }
  const custom=c.products.find(p=>p.sku==="GIFT-CUSTOM")!;
  const r=await POST(new Request("http://localhost/api/commerce/store/offer",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({slug:custom.slug})}));assert.equal(r.status,404);
});
await test("Help choices use native links to exact public Gift targets with safe empty fallback",()=>{
  const html=render(published()); const help=html.split('id="gift-selection-help"')[1].split('</section>')[0];
  for(const target of ["gift-gift-drip10-2","gift-gift-drip20-4","coffee-gear-gift"]){assert.ok(help.includes('href="#'+target+'"'));assert.ok(html.includes('id="'+target+'"'));}
  assert.equal((help.match(/<a /g)||[]).length,3);
  const empty=render(original).split('id="gift-selection-help"')[1].split('</section>')[0];assert.equal((empty.match(/href="#drip-gift"/g)||[]).length,2);
});
await test("V1.2 preserves approved Hero markup and copy exactly",async()=>{
  const source=await fs.readFile("components/gifts/GiftExperience.tsx","utf8");
  assert.match(source,/<header className=\{styles.hero\}>/);assert.doesNotMatch(source,/useState|onClick|use client/);
  const hero=render(published()).split('</header>')[0];assert.equal((hero.match(/<h1>/g)||[]).length,1);assert.equal((hero.match(/<a /g)||[]).length,1);
  assert.match(hero,/送一份咖啡，也送一段值得慢下來的時間。/);
});
await test("Navigation-like selector, whole help targets and compact custom CTA have focus-safe CSS",async()=>{
  const css=await fs.readFile("components/gifts/GiftExperience.module.css","utf8");assert.match(css,/categories a\{[^}]*border-bottom/);assert.match(css,/categories a\{[^}]*min-height:48px/);
  assert.match(css,/guidance>a\{display:block;min-height:48px/);assert.match(css,/custom\{[^}]*display:block/);assert.match(css,/focus-visible/);
});
await test("Protected project JSON and original Gift drafts unchanged", async () => {
  assert.deepEqual(await hashes(),before);
  assert.equal(hash(await fs.readFile(process.env.GIFT_TEST_FIXTURE!)),sourceHash);
});
console.log("GIFT FRONTEND: "+passed+" PASS / 0 FAIL; TEMP "+root);
