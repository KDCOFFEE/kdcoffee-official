import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const workspaceId = "components/admin/works/WorksArtworkWorkspace.tsx";
const pageId = "app/admin/works/[slug]/page.tsx";
const allowed = new Set([workspaceId, pageId, ...["adminAuth", "storagePaths", "productListing", "worksArtworkOwnerProjection",
  "worksArtworkFieldRegistry", "worksArtworkReadModel", "worksArtworkSourceTrace", "worksArtworkContract", "worksArtworkValidation",
  "productVisualAssets", "productPageContent", "productPageContentValidation", "productPageSections", "cleanRoastingMedia", "media"].map(n => "lib/" + n + ".ts")]);
const modules = new Map<string, { exports: any }>();
const jar = new Map<string, string>();
const savedSecret = process.env.ADMIN_SESSION_SECRET;
const savedFetch = globalThis.fetch;
process.env.ADMIN_SESSION_SECRET = crypto.randomBytes(48).toString("hex");
let network = 0;
globalThis.fetch = async () => { network++; throw Error("Real network forbidden"); };
function load(id: string): any {
  assert.ok(allowed.has(id), "Unexpected runtime import");
  if (modules.has(id)) return modules.get(id)!.exports;
  const m = { exports: {} }; modules.set(id, m);
  const source = readFileSync(path.join(root, id), "utf8");
  const js = ts.transpileModule(source, { fileName: id, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", js)((specifier: string) => {
    if (specifier === "react") return React;
    if (specifier === "react/jsx-runtime") return requireRuntime();
    if (specifier === "next/link") return ({ children, ...props }: any) => React.createElement("a", props, children);
    if (specifier === "next/navigation") return { redirect: (location: string) => { throw { kind: "REDIRECT", location }; } };
    if (specifier === "next/headers") return { cookies: async () => ({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined }) };
    if (specifier === "crypto") return crypto;
    if (specifier.endsWith(".module.css")) return new Proxy({}, { get: (_t, key) => key === "__esModule" ? false : String(key) });
    assert.ok(specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("@/"), "Filesystem/network import forbidden");
    let target = specifier.startsWith("@/") ? specifier.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(id), specifier));
    if (!/\.tsx?$/.test(target)) target += target.startsWith("components/") ? ".tsx" : ".ts";
    return load(target);
  }, m, m.exports);
  return m.exports;
}
// Native React runtime only. Application imports still use the finite loader.
import * as jsxRuntime from "react/jsx-runtime";
const requireRuntime = () => jsxRuntime;
let pass = 0, fail = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try { await fn(); pass++; }
  catch { fail++; console.error("FAIL " + name); }
}
const html = (type: any, props: any) => renderToStaticMarkup(React.createElement(type, props));
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const source = readFileSync(path.join(root, workspaceId), "utf8");
const css = readFileSync(path.join(root, "components/admin/works/WorksArtworkWorkspace.module.css"), "utf8");
const pageSource = readFileSync(path.join(root, pageId), "utf8");
const ownerBytes = readFileSync(path.join(root, "public/data/homepage.json"));
const catalogBytes = readFileSync(path.join(root, "public/data/website-data.json"));

try {
  const ui = load(workspaceId) as typeof import("../components/admin/works/WorksArtworkWorkspace");
  const page = load(pageId) as typeof import("../app/admin/works/[slug]/page");
  const auth = load("lib/adminAuth.ts") as typeof import("../lib/adminAuth");
  const project = load("lib/worksArtworkOwnerProjection.ts").projectWorksArtworkOwner;
  const listing = load("lib/productListing.ts");
  const products = JSON.parse(catalogBytes.toString("utf8")).menu.products;
  const product = products.find((p: any) => p.slug === "giotto-awakening");
  assert.ok(product);
  const makeModel = (p = product, catalog = products) => {
    const r = project({ product: p, catalog, publicStates: { worksList: listing.isProductListedInWorks(p) ? "YES" : "NO" } });
    assert.ok(r.ok); return r.value;
  };
  const model = makeModel();
  const baseline = JSON.stringify(model);
  const getField = (m: any, id: string) => { const f = m.fields.find((f: any) => f.id === id); assert.ok(f); return f; };
  const section = (id: any, m = model) => html(ui.WorkspaceSection, { model: m, section: id });
  const renderField = (id: string, m = model) => html(ui.WorkspaceField, { item: getField(m, id), model: m });

  await check("page exists, async params, dynamic and no index", () => {
    assert.match(pageSource, /await props.params/); assert.equal(page.dynamic, "force-dynamic");
    assert.deepEqual((page.metadata as any).robots, { index: false, follow: false });
  });
  await check("unauthenticated page redirects before params", async () => {
    jar.clear(); let touched = 0;
    await assert.rejects(page.default({ get params() { touched++; throw Error("private"); } } as any), (e: any) => e.kind === "REDIRECT" && e.location === "/admin/login");
    assert.equal(touched, 0);
  });
  for (const legacy of [false, true]) await check("non-owner page denied before params " + legacy, async () => {
    const payload = Buffer.from(JSON.stringify({ role: "admin", expiresAt: Date.now() + 600000 })).toString("base64url");
    const token = legacy ? payload + "." + crypto.createHmac("sha256", process.env.ADMIN_SESSION_SECRET!).update(payload).digest("base64url") : auth.createAdminSessionValue({ role: "admin" });
    jar.clear(); jar.set(auth.adminCookieName, token); let touched = 0;
    const result = await page.default({ get params() { touched++; throw Error("private"); } } as any);
    assert.equal(touched, 0); assert.match(renderToStaticMarkup(result), /沒有此工作區權限/);
  });
  await check("Owner page passes slug to client without raw data", async () => {
    jar.clear(); jar.set(auth.adminCookieName, auth.createAdminSessionValue({ role: "owner" }));
    const result = await page.default({ params: Promise.resolve({ slug: product.slug }) });
    assert.equal(result.type, ui.default); assert.deepEqual(result.props, { slug: product.slug });
  });
  await check("page does not resolve raw data or replace existing Admin", () => {
    assert.doesNotMatch(pageSource, /websiteData|readWorksArtworkOwnerModel|storeRepository|WorksPageManager|ProductManager/);
    assert.match(source, /^"use client"/); assert.doesNotMatch(source, /from ["'][^"']*(?:websiteData|storagePaths|OwnerProjection|SourceTrace|FieldRegistry|OwnerReadService)/);
  });
  await check("single GET request, no-store and same-origin credentials", async () => {
    let calls = 0;
    const fetcher: typeof fetch = async (url, options) => {
      calls++; assert.equal(url, "/api/admin/works/giotto-awakening/owner-read");
      assert.equal(options?.method, "GET"); assert.equal(options?.cache, "no-store");
      assert.equal(options?.credentials, "same-origin"); assert.equal(options?.redirect, "error");
      return Response.json({ ok: true, data: model });
    };
    assert.deepEqual(await ui.readOwnerWorkspace(product.slug, undefined, fetcher), { ok: true, data: model }); assert.equal(calls, 1);
  });
  for (const status of [400, 401, 403, 404, 500, 502]) await check("HTTP error status is safe " + status, async () => {
    let calls = 0;
    const result = await ui.readOwnerWorkspace(product.slug, undefined, async () => { calls++; return new Response("SECRET /srv/private stack", { status }); });
    assert.deepEqual(result, { ok: false, status: status <= 404 ? status : 500 }); assert.equal(calls, 1);
    assert.ok(!JSON.stringify(result).includes("SECRET"));
  });
  for (const body of [{ ok: false }, { ok: true, data: {} }, { ok: true, data: { ...model, fields: [] } }, { ok: true, data: { ...model, sections: [] } }, { ok: true, data: { ...model, capability: "WRITE" } }]) await check("reject malformed success " + JSON.stringify(body).length, async () => {
    assert.deepEqual(await ui.readOwnerWorkspace(product.slug, undefined, async () => Response.json(body)), { ok: false, status: 500 });
  });
  await check("wrong artwork DTO is not displayed", async () => {
    assert.deepEqual(await ui.readOwnerWorkspace("other-art", undefined, async () => Response.json({ ok: true, data: model })), { ok: false, status: 500 });
  });
  await check("network and JSON errors are generic", async () => {
    for (const f of [async () => { throw Error("PRIVATE"); }, async () => new Response("{bad")]) {
      assert.deepEqual(await ui.readOwnerWorkspace(product.slug, undefined, f), { ok: false, status: 500 });
    }
  });
  await check("reference is encoded into one URL segment", async () => {
    await ui.readOwnerWorkspace("../unsafe/?x", undefined, async (url) => { assert.equal(url, "/api/admin/works/..%2Funsafe%2F%3Fx/owner-read"); return new Response("", { status: 400 }); });
  });
  await check("abort signal passes through", async () => {
    const controller = new AbortController();
    await ui.readOwnerWorkspace(product.slug, controller.signal, async (_url, options) => { assert.equal(options?.signal, controller.signal); return Response.json({ ok: true, data: model }); });
    assert.match(source, /active = false; controller.abort/); assert.match(source, /state.slug === slug/);
  });

  const main = html(ui.OwnerWorkspaceView, { model, slug: product.slug });
  await check("identity header uses DTO, readonly state and local thumbnail", () => {
    assert.match(main, /<h1>喬托・初醒<\/h1>/); assert.match(main, /GIOTTO/); assert.match(main, /新品上市/);
    assert.match(main, /目前為唯讀檢視/); assert.match(main, /artwork-cover-v01.webp/);
    assert.ok(!main.includes("schemaVersion")); assert.ok(!main.includes("Product ID"));
  });
  await check("public link opens separate tab without opener", () => {
    assert.match(main, /href="\/works\/giotto-awakening" target="_blank" rel="noopener noreferrer"/);
  });
  await check("ten sections follow DTO order", () => {
    const ids = [...main.matchAll(/data-section-nav="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(ids, model.sections.map((s: any) => s.id)); assert.equal(ids.length, 10);
    assert.match(main, /aria-current="location"/); assert.match(main, /aria-expanded="false"/);
  });
  await check("no content form, Save or Publish controls", () => {
    for (const s of model.sections) assert.doesNotMatch(section(s.id), /<(?:input|textarea|select|form)\b|<button[^>]*>[^<]*(?:Save|Publish|儲存|發佈)/i);
    assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
  });
  await check("completeness is category-based without invented percentage", () => {
    const h = html(ui.Completeness, { model });
    for (const label of ["商品基本資料", "頁面內容", "圖片與影片", "搜尋與分享", "售價與購買"]) assert.ok(h.includes(label));
    assert.match(h, /必要內容 5 \/ 5/); assert.match(h, /來源待確認/); assert.doesNotMatch(h, /\d+%/);
    assert.match(h, /選填內容不降低/);
  });
  await check("completeness respects NOT_APPLICABLE and names missing fields", () => {
    const m = clone(model); m.completeness[0].state = "NEEDS_ATTENTION"; m.completeness[0].fieldIds = ["identity.nameEn"];
    m.completeness[1].state = "NOT_APPLICABLE";
    const h = html(ui.Completeness, { model: m }); assert.match(h, /英文作品名稱/); assert.match(h, /目前不適用/);
  });
  await check("editorial story is complete and readable", () => {
    const h = section("pageContent"); assert.ok(h.includes(product.mood)); assert.ok(h.includes(product.shortCopy));
    assert.match(h, /烘焙特色/); assert.match(h, /流床式熱風烘焙/); assert.match(css, /white-space:pre-wrap/);
  });
  await check("source, locations and impact use DTO metadata", () => {
    const h = renderField("content.story"); assert.match(h, /資料來源/); assert.match(h, /商品資料/);
    assert.match(h, /顯示位置：作品故事/); assert.match(h, /這件作品的公開頁/); assert.match(h, /來源與影響說明/);
  });
  for (const id of ["facts.variety", "facts.altitude", "facts.subtitle"]) await check("M1 no false editor " + id, () => {
    const h = renderField(id); assert.match(h, /目前尚無可用的後台編輯入口/); assert.doesNotMatch(h, /<a\b/);
  });
  for (const id of ["facts.variety", "facts.altitude"]) await check("stored fact is not claimed public " + id, () => {
    assert.match(renderField(id), /目前公開作品頁與作品列表未呈現/);
  });
  await check("EXTERNAL_EDITOR links only to reviewed destination", () => {
    assert.match(renderField("identity.name"), /href="\/admin\/products"/);
    const m = clone(model); getField(m, "identity.name").editing.destination.href = "https://private.invalid";
    assert.doesNotMatch(renderField("identity.name", m), /<a\b/);
    getField(m, "identity.name").editing.capability = "UNAVAILABLE";
    getField(m, "identity.name").editing.destination.href = "/admin/products";
    assert.doesNotMatch(renderField("identity.name", m), /<a\b/);
  });
  await check("unknown commerce is never zero price or no stock", () => {
    const h = section("purchase"); assert.match(h, /目前尚未接入正式售價摘要/); assert.match(h, /購買狀態目前尚無可確認來源/);
    assert.doesNotMatch(h, /NT\$\s*0|無庫存|目前售完/);
  });
  await check("known commerce uses supplied display text without calculation", () => {
    const m = clone(model); m.commerceSummary = { priceText: "正式摘要文字", availability: "sold_out", variantLabels: ["半磅"], availableChoiceCount: 0 };
    const h = section("purchase", m); assert.match(h, /正式摘要文字/); assert.match(h, /售完（不代表內容不完整）/); assert.match(h, /可購買規格數：0/);
  });
  await check("media shows roles and truthful MODEL_ONLY status", () => {
    const h = section("media"); assert.match(h, /頂部主視覺/); assert.match(h, /商品照片/); assert.match(h, /烘焙豆照片與影片/);
    assert.match(h, /僅確認資料來源，尚未完整驗證公開呈現/); assert.match(h, /僅檢視素材來源，不檢查載入結果/);
    assert.doesNotMatch(h, /<(?:video|iframe)\b/); assert.match(h, /clean-roasting-04.mp4/);
  });

  const roastedModel = (asset: unknown, enabled = true) => makeModel({
    ...product, showRoastedBeanPhoto: enabled, assets: { ...product.assets, roastedBeanPhoto: asset },
  });
  await check("UI-F1 single resolved primary image preserves caption", () => {
    const url = "/uploads/artworks/review/bean-single.webp";
    const m = roastedModel({ path: url, caption: "單張烘焙豆說明" });
    const f = getField(m, "media.roasted");
    assert.equal(f.hasValue, true); assert.equal(f.source.trace.media, null);
    assert.equal(f.value[0].primary, url); assert.equal(f.value[0].caption, "單張烘焙豆說明");
    assert.equal(f.value[0].path, undefined);
    const h = renderField("media.roasted", m);
    assert.ok(h.includes('src="' + url + '"')); assert.match(h, /單張烘焙豆說明/);
    assert.doesNotMatch(h, /沒有可顯示的素材|尚未設定可顯示素材/);
  });
  await check("UI-F1 resolved gallery preserves both primary references and caption order", () => {
    const urls = ["/uploads/artworks/review/bean-first.webp", "/uploads/artworks/review/bean-second.webp"];
    const captions = ["第一張實際豆色", "第二張實際豆色"];
    const m = roastedModel({ gallery: urls.map((path, i) => ({ id: "bean-" + i, path, caption: captions[i] })) });
    const f = getField(m, "media.roasted");
    assert.equal(f.source.trace.media, null);
    assert.deepEqual(f.value.map((v: any) => v.primary), urls);
    assert.deepEqual(f.value.map((v: any) => v.caption), captions);
    const h = renderField("media.roasted", m);
    for (let i = 0; i < urls.length; i++) {
      assert.ok(h.includes('src="' + urls[i] + '"')); assert.ok(h.includes(captions[i]));
    }
    assert.ok(h.indexOf(urls[0]) < h.indexOf(urls[1]));
    assert.ok(h.indexOf(captions[0]) < h.indexOf(captions[1]));
    assert.doesNotMatch(h, /沒有可顯示的素材|尚未設定可顯示素材/);
  });
  for (const [url, type] of [["https://media.example.com/beans.webp", "image"], ["/uploads/artworks/review/beans.mp4", "video"]]) {
    await check("UI-F1 non-previewable resolved primary remains text " + type, () => {
      const m = roastedModel({ media: { type, url }, caption: "實際烘焙素材" });
      assert.equal(getField(m, "media.roasted").value[0].primary, url);
      const h = renderField("media.roasted", m);
      assert.ok(h.includes(url)); assert.match(h, /實際烘焙素材/);
      assert.doesNotMatch(h, /<(?:img|video|iframe|source)\b|沒有可顯示的素材|尚未設定可顯示素材/);
      assert.equal(network, 0);
    });
  }
  await check("UI-F1 resolved primary is not replaced by aggregate trace layers", () => {
    const url = "/uploads/artworks/review/selected.webp";
    const m = roastedModel({ path: url, caption: "已選定素材" });
    const f = getField(m, "media.roasted");
    f.source.trace.media = { configured: { url: "/uploads/artworks/review/not-selected.webp" } };
    const h = renderField("media.roasted", m);
    assert.ok(h.includes(url)); assert.ok(!h.includes("not-selected.webp"));
  });
  await check("UI-F1 true empty gallery stays explicitly empty", () => {
    const m = roastedModel({ gallery: [] }), f = getField(m, "media.roasted");
    assert.deepEqual(f.value, []); assert.equal(f.source.trace.configurationState, "GALLERY_CONFIGURED_EMPTY");
    const h = renderField("media.roasted", m);
    assert.match(h, /已明確設定為空清單/); assert.doesNotMatch(h, /<img\b|目前清單沒有可顯示的素材/);
  });
  await check("UI-F1 filtered empty gallery differs from intentionally empty", () => {
    const m = roastedModel({ gallery: [{ id: "no-media", caption: "只有說明" }] });
    const f = getField(m, "media.roasted");
    assert.deepEqual(f.value, []); assert.equal(f.source.trace.configurationState, "GALLERY_FILTERED_EMPTY");
    const h = renderField("media.roasted", m);
    assert.match(h, /目前清單沒有可顯示的素材/); assert.doesNotMatch(h, /已明確設定為空清單|<img\b/);
  });
  await check("UI-F1 disabled media stays disabled despite resolved primary", () => {
    const url = "/uploads/artworks/review/disabled.webp";
    const m = roastedModel({ path: url, caption: "停用素材" }, false);
    assert.equal(getField(m, "media.roasted").state, "disabled");
    const h = renderField("media.roasted", m);
    assert.match(h, /已明確停用/); assert.ok(!h.includes(url));
    assert.doesNotMatch(h, /目前清單沒有可顯示的素材|<img\b/);
  });
  await check("UI-F2 invalid presentation does not claim known appearance", () => {
    const m = makeModel({ ...product, pageLayout: "invalid-source" });
    const f = getField(m, "presentation.status");
    assert.equal(f.state, "invalid"); assert.equal(f.value, null);
    const h = renderField("presentation.status", m);
    assert.match(h, /來源需要確認，暫不顯示這項內容/);
    assert.doesNotMatch(h, /目前沿用既有網站外觀/);
  });
  await check("UI-F2 valid presentation keeps accepted appearance copy", () => {
    const m = makeModel({ ...product, pageLayout: {} });
    const f = getField(m, "presentation.status");
    assert.notEqual(f.state, "invalid"); assert.equal(f.value, "EXISTING_SITE_BEHAVIOR");
    assert.match(renderField("presentation.status", m), /目前沿用既有網站外觀，此處尚未開放調整/);
  });
  await check("UI-F2 invalid animation does not claim existing source", () => {
    const m = makeModel({ ...product, productPageAnimations: "invalid-source" });
    const f = getField(m, "animation.status");
    assert.equal(f.state, "invalid"); assert.equal(f.value, null);
    const h = renderField("animation.status", m);
    assert.match(h, /來源需要確認，暫不顯示這項內容/);
    assert.doesNotMatch(h, /已有進場效果來源|目前沒有獨立進場效果設定/);
  });
  await check("UI-F2 valid animation source keeps accepted MODEL_ONLY copy", () => {
    const m = makeModel({ ...product, productPageAnimations: {} });
    const f = getField(m, "animation.status");
    assert.notEqual(f.state, "invalid"); assert.equal(f.value, "SOURCE_EXISTS_RENDERING_UNVERIFIED");
    assert.equal(f.source.binding, "MODEL_ONLY");
    assert.match(renderField("animation.status", m), /已有進場效果來源，公開呈現仍待確認/);
  });

  for (const url of ["https://remote.invalid/a.webp", "//remote.invalid/a.jpg", "/uploads/../private.png", "/uploads/%2e%2e/a.png", "javascript:private", "/uploads/a.svg", "/uploads/a.jpg?token=private"]) await check("unsafe/nonlocal thumbnail is never loaded " + url, () => assert.equal(ui.localPreview(url), null));
  await check("normal local image allowed", () => assert.equal(ui.localPreview("/uploads/artworks/giotto-awakening/image.webp"), "/uploads/artworks/giotto-awakening/image.webp"));
  await check("manual [] is explicit none, not unset", () => {
    const m = makeModel({ ...product, relatedProducts: { productIds: [] } });
    const h = section("relatedWorks", m); assert.match(h, /手動指定/); assert.match(h, /目前明確設定為不顯示相關作品/);
  });
  await check("manual order comes from DTO without recommendations", () => {
    const m = makeModel({ ...product, relatedProducts: { productIds: ["turner-sunset", "davinci-feast"] } });
    const h = section("relatedWorks", m); assert.ok(h.indexOf("特納夕日") < h.indexOf("達文西盛宴"));
  });
  await check("auto legacy mode is labeled", () => assert.match(section("relatedWorks"), /自動相容推薦/));
  await check("appearance and animation have no fake controls", () => {
    assert.match(section("presentation"), /尚未開放調整/); assert.match(section("animation"), /目前沒有獨立進場效果設定/);
    for (const id of ["presentation", "animation"]) assert.doesNotMatch(section(id), /<(?:input|select|button)\b/);
  });
  await check("search title, description and fallback explanation", () => {
    const h = section("searchAndShare"); assert.match(h, /喬托・初醒｜KD Coffee/); assert.ok(h.includes(product.shortCopy));
    assert.match(h, /分享圖片/); assert.match(h, /系統判讀資訊/); assert.match(h, /相容來源層數/);
  });
  for (const [state, expected] of [["explicit-blank", "已明確留白"], ["missing", "尚未設定"], ["disabled", "已明確停用"], ["suppressed", "依目前規則不顯示"], ["invalid", "來源需要確認"]]) await check("distinct field state " + state, () => {
    const m = clone(model); const f = getField(m, "content.story"); f.state = state; f.hasValue = false; f.value = "";
    assert.ok(renderField("content.story", m).includes(expected));
  });
  await check("explicit empty list and inherited source remain distinct", () => {
    const m = clone(model); const f = getField(m, "content.proofs"); f.value = []; f.hasValue = true; f.state = "explicit";
    assert.match(renderField("content.proofs", m), /已明確設定為空清單/);
    f.state = "inherited"; f.source.trace.isInherited = true; assert.match(renderField("content.proofs", m), /使用繼承內容/);
  });
  await check("system information is secondary and collapsed", () => {
    const h = section("systemInfo"); assert.match(h, /<details[^>]*><summary>展開系統資訊/); assert.ok(!h.includes("<details open"));
    assert.match(h, /P00001/); assert.match(h, /DISPLAY_ONLY_NOT_WRITE_PAYLOAD/); assert.match(h, /尚未建立/);
    assert.doesNotMatch(main, /DISPLAY_ONLY_NOT_WRITE_PAYLOAD/);
  });
  await check("loading has skeleton, live status and no data request during SSR", () => {
    const h = html(ui.default, { slug: product.slug }); assert.match(h, /aria-busy="true"/); assert.match(h, /role="status"/);
    assert.match(h, /正在載入作品內容/); assert.match(h, /aria-hidden="true"/); assert.equal(network, 0);
  });
  for (const [status, expected] of [[401, "請先登入後台"], [403, "沒有此工作區權限"], [404, "找不到這件作品"], [500, "暫時無法載入作品"]]) await check("safe Owner error screen " + status, () => {
    const h = html(ui.WorkspaceProblem, { status, retry: () => {} }); assert.ok(h.includes(String(expected))); assert.match(h, /返回營運中心/);
    assert.doesNotMatch(h, /SECRET|stack|rawProduct|\/srv\//);
    if (status === 401) assert.match(h, /href="\/admin\/login"/);
    if (status === 500) assert.match(h, /重新載入/);
  });
  await check("mobile layout is not scrolling desktop tabs", () => {
    assert.match(css, /@media\(max-width:900px\)/); assert.match(css, /\.sectionNav\[data-open=true\]/);
    assert.match(css, /grid-template-columns:minmax\(0,1fr\)/); assert.doesNotMatch(css, /overflow-x:auto/);
    assert.match(css, /min-height:44px/); assert.match(css, /safe-area-inset-bottom/); assert.match(css, /position:sticky;top:0/);
  });
  await check("accessible structure and keyboard focus", () => {
    assert.match(main, /aria-label="作品內容區域"/); assert.match(main, /aria-controls="artwork-section-nav"/);
    assert.match(main, /tabindex="-1"/); assert.match(source, /heading.current\?\.focus/);
    assert.match(css, /focus-visible/); assert.match(css, /prefers-reduced-motion/);
  });
  await check("content is escaped, no raw snapshot debug", () => {
    const m = clone(model); getField(m, "content.story").value = "<script>PRIVATE</script>";
    const h = renderField("content.story", m); assert.ok(h.includes("&lt;script&gt;")); assert.ok(!h.includes("<script>"));
    assert.doesNotMatch(source, /dangerouslySetInnerHTML|JSON.stringify|localStorage|sessionStorage|website-data.json|rawProduct|rawCommerce/);
  });
  for (const p of products) await check("canonical UI smoke " + p.slug, () => {
    const m = makeModel(p); const h = html(ui.OwnerWorkspaceView, { model: m, slug: p.slug });
    assert.ok(h.includes(p.name)); assert.equal([...h.matchAll(/data-section-nav=/g)].length, 10);
    for (const s of m.sections) assert.ok(section(s.id, m).length > 0);
  });
  await check("UI does not mutate DTO or real Owner/Product files", () => {
    assert.equal(JSON.stringify(model), baseline); assert.deepEqual(readFileSync(path.join(root, "public/data/homepage.json")), ownerBytes);
    assert.deepEqual(readFileSync(path.join(root, "public/data/website-data.json")), catalogBytes); assert.equal(network, 0);
  });
} finally {
  globalThis.fetch = savedFetch;
  if (savedSecret === undefined) delete process.env.ADMIN_SESSION_SECRET; else process.env.ADMIN_SESSION_SECRET = savedSecret;
}
console.log("W3.3A WORKS OWNER WORKSPACE: " + pass + " PASS / " + fail + " FAIL");
if (fail) process.exitCode = 1;
