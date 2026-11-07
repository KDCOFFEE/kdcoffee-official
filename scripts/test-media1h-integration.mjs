// Local integration with real Admin APIs and repositories. Cloudinary is an in-memory boundary.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { registerHooks, createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { v2 as cloudinary } from "cloudinary";

const reactUrl = pathToFileURL(createRequire(import.meta.url).resolve("react")).href;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "next/navigation" && context.parentURL?.endsWith("/app/admin/store/page.tsx")) return {
    url: "data:text/javascript,export function redirect(){throw Error('redirect');} export function forbidden(){throw Error('forbidden');}",
    shortCircuit: true,
  };
  if (specifier === "next/headers") return {
    url: "data:text/javascript,export async function cookies(){return {get:()=>({value:globalThis.__media1hCookie})};}",
    shortCircuit: true,
  };
  if (specifier === "react" && /\/(?:StoreWorkspace|GiftCmsEditor|HeroMediaLibraryPicker|AssetManager|AssetUploadButton|PageBuilderManager|HomepageEditors)\.tsx$/.test(context.parentURL || "")) return {
    url: "data:text/javascript," + encodeURIComponent(`
      export * from ${JSON.stringify(reactUrl)};
      export const useState = (...args) => globalThis.__media1hHooks.useState(...args);
      export const useRef = (...args) => globalThis.__media1hHooks.useRef(...args);
      export const useEffect = () => {};
      export const useMemo = callback => callback();
    `), shortCircuit: true,
  };
  return nextResolve(specifier, context);
} });

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-media1h-"));
process.env.KD_DATA_DIR = root;
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.ADMIN_SESSION_SECRET = "media1h-local-session-test-only";
process.env.CLOUDINARY_CLOUD_NAME = "media1h-test";
process.env.CLOUDINARY_API_KEY = "media1h-test-key";
process.env.CLOUDINARY_API_SECRET = "media1h-test-secret";
const { createAdminSessionValue } = await import("../lib/adminAuth.ts");
globalThis.__media1hCookie = createAdminSessionValue({ role: "owner" });
const { createStoreRepository } = await import("../lib/storeRepository.ts");
const { newStoreAdminDraft, storeDraftPayload } = await import("../lib/storeAdminDraft.ts");
const { findPublicStoreProductBySlug } = await import("../lib/storePublicSelectors.ts");
const { getAssetsDataFile, getAssetsUploadDir } = await import("../lib/storagePaths.ts");
const { getGiftCmsFile } = await import("../lib/giftCmsStore.ts");
const { filterCustomSectionMediaReservedPublicIds } = await import("../lib/customSectionMediaNaming.ts");
const { DEFAULT_GIFT_LANDING } = await import("../lib/giftCms.ts");
const { default: StoreWorkspace } = await import("../components/admin/StoreWorkspace.tsx");
const { default: GiftCmsEditor } = await import("../components/admin/GiftCmsEditor.tsx");
const { default: GiftExperience } = await import("../components/gifts/GiftExperience.tsx");
const { default: StoreProductGallery } = await import("../components/store/StoreProductGallery.tsx");
const { default: HeroMediaLibraryPicker } = await import("../components/admin/HeroMediaLibraryPicker.tsx");
const { default: AssetManager } = await import("../components/admin/AssetManager.tsx");
const { ContentSectionEditor } = await import("../components/admin/HomepageEditors.tsx");
const { default: PageBuilderManager } = await import("../components/admin/PageBuilderManager.tsx");
const { createPage, createSection } = await import("../lib/pageBuilder.ts");
const { default: AssetUploadButton } = await import("../components/admin/AssetUploadButton.tsx");
const sign = await import("../app/api/admin/media/sign/route.ts");
const finalize = await import("../app/api/admin/media/finalize/route.ts");
const catalogApi = await import("../app/api/admin/store/route.ts");
const sectionApi = await import("../app/api/admin/store/sections/route.ts");
const productApi = await import("../app/api/admin/store/products/route.ts");
const giftsApi = await import("../app/api/admin/gifts/landing/route.ts");
const assetsApi = await import("../app/api/admin/assets/route.ts");
const uploadApi = await import("../app/api/admin/assets/upload/route.ts");
const repository = createStoreRepository();
const origin = "http://127.0.0.1:4318";
const resources = new Map();
const originalResources = cloudinary.api.resources, originalResource = cloudinary.api.resource;
cloudinary.api.resources = async ({ prefix, resource_type }) => ({
  resources: [...resources.values()].filter(asset => asset.public_id.startsWith(prefix) && asset.resource_type === resource_type),
});
cloudinary.api.resource = async id => {
  assert.ok(resources.has(id), "No live Cloudinary lookup is permitted");
  return resources.get(id);
};
const request = (url, method = "GET", value) => new Request(origin + url, {
  method, headers: { origin, "content-type": "application/json", "sec-fetch-site": "same-origin" },
  ...(value === undefined ? {} : { body: JSON.stringify(value) }),
});
const realFetch = globalThis.fetch, realWindow = globalThis.window;
globalThis.window = { confirm: () => true, location: { search: "" } };
globalThis.fetch = async (url, init) => {
  const route = String(url), req = new Request(origin + route, { ...init, headers: { origin, "sec-fetch-site": "same-origin", ...init?.headers } });
  if (route === "/api/admin/store") return catalogApi.GET(req);
  if (route === "/api/admin/store/products") return productApi[req.method](req);
  if (route === "/api/admin/assets") return assetsApi[req.method](req);
  if (route === "/api/admin/gifts/landing") return giftsApi[req.method](req);
  throw new Error("Unexpected external request: " + route);
};
function harness(Component, initialProps, firstState, overrides = {}) {
  const states = [], refs = [];
  let stateIndex = 0, refIndex = 0, props = initialProps;
  const hooks = {
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = index in overrides ? overrides[index] : index === 0 && firstState !== undefined ? firstState : typeof initial === "function" ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useRef(initial) { const index = refIndex++; return refs[index] ??= { current: initial }; },
  };
  return { render(nextProps = props) { props = nextProps; stateIndex = refIndex = 0; globalThis.__media1hHooks = hooks; return Component(props); } };
}
function nodes(tree, predicate, found = []) {
  if (Array.isArray(tree)) tree.forEach(item => nodes(item, predicate, found));
  else if (tree && typeof tree === "object" && tree.props) {
    if (predicate(tree)) found.push(tree);
    nodes(tree.props.children, predicate, found);
  }
  return found;
}
function text(tree) {
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  return Array.isArray(tree) ? tree.map(text).join("") : text(tree.props?.children);
}
function button(tree, label) {
  const item = nodes(tree, item => item.type === "button" && text(item) === label)[0];
  assert.ok(item, "Missing button " + label);
  return item;
}
function component(tree, name) {
  const item = nodes(tree, item => item.type?.name === name)[0];
  assert.ok(item, "Missing component " + name);
  return item;
}
let passed = 0;
async function test(name, run) { await run(); console.log("PASS " + (++passed) + " " + name); }
async function jsonResponse(response, status = 200) {
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}
function selectProduct(ui, name) {
  button(ui.render(), "商品").props.onClick();
  const row = nodes(ui.render(), node => node.type === "button" && text(node).includes(name))[0];
  assert.ok(row); row.props.onClick();
}
function uploader(ui, label) {
  const item = nodes(ui.render(), node => node.type?.name === "MediaUploader" && node.props.label === label)[0];
  assert.ok(item); return item;
}
async function mockImage(ui, label) {
  const element = uploader(ui, label);
  const context = { ...element.props.productMediaNaming, usage: "product", mediaType: "image", fileName: "IMG_0123.png", fileSize: 100, mimeType: "image/png" };
  context.reservedPublicIds = filterCustomSectionMediaReservedPublicIds({ ...context, publicIds: context.reservedPublicIds || [] });
  const signed = await jsonResponse(await sign.POST(request("/api/admin/media/sign", "POST", context)));
  assert.equal(signed.params.overwrite, "false");
  assert.ok(!resources.has(signed.params.public_id));
  const id = signed.params.public_id;
  resources.set(id, { public_id: id, resource_type: "image", type: "upload", format: "png", bytes: 100, width: 800, height: 600,
    secure_url: `https://res.cloudinary.com/media1h-test/image/upload/${id}.png` });
  const result = await jsonResponse(await finalize.POST(request("/api/admin/media/finalize", "POST", { ...context, publicId: id })));
  element.props.onChange(result.media);
  return result.media;
}
async function saveStore(ui) {
  await nodes(ui.render(), node => node.type === "form")[0].props.onSubmit({ preventDefault() {} });
  const product = (await repository.read()).products[0];
  assert.ok(text(ui.render()).includes("已儲存"));
  return product;
}
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/kT0AAAAASUVORK5CYII=", "base64");
async function uploadGift() {
  const form = new FormData();
  form.set("create", "true"); form.set("namingContext", "gifts-hero");
  form.set("file", new File([png], "DSC_0001.png", { type: "image/png" }));
  return jsonResponse(await uploadApi.POST(new Request(origin + "/api/admin/assets/upload", { method: "POST", body: form })));
}
async function giftUi() {
  const initial = await jsonResponse(await giftsApi.GET(request("/api/admin/gifts/landing")));
  const ui = harness(GiftCmsEditor, { initial });
  button(ui.render(), "素材").props.onClick();
  return ui;
}
async function saveGift(ui) {
  button(ui.render(), "儲存全部").props.onClick();
  for (let attempt = 0; attempt < 1000 && text(ui.render()).includes("儲存中"); attempt++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(text(ui.render()).includes("已儲存全部變更"), text(ui.render()));
  return (await jsonResponse(await giftsApi.GET(request("/api/admin/gifts/landing")))).document;
}

try {
  assert.ok(repository.catalogPath.startsWith(root + path.sep));
  await fs.mkdir(path.dirname(getAssetsDataFile()), { recursive: true });
  const libraryAsset = { id: "ALT-LIBRARY", status: "active", category: "misc", name: "素材庫禮盒", alt: "桌面上的咖啡禮盒", path: "/uploads/assets/misc/library.png" };
  await fs.writeFile(getAssetsDataFile(), JSON.stringify({ version: 1, assets: [libraryAsset] }));
  await fs.mkdir(getAssetsUploadDir("misc"), { recursive: true });
  await fs.writeFile(path.join(getAssetsUploadDir("misc"), "library.png"), png);
  const section = await jsonResponse(await sectionApi.POST(request("/api/admin/store/sections", "POST",
    { ...storeDraftPayload("sections", newStoreAdminDraft("sections")), name: "整合專區", slug: "integration", published: true })), 201);
  let product = await jsonResponse(await productApi.POST(request("/api/admin/store/products", "POST",
    { ...storeDraftPayload("products", newStoreAdminDraft("products", section.id)), name: "整合咖啡壺", slug: "integration-kettle", sku: "MEDIA1H", price: 500, inventory: 8, published: true })), 201);
  const protectedProductFields = [product.id, product.slug, product.sku, product.price, product.inventory, product.pvValue];
  let ui = harness(StoreWorkspace, { initialCatalog: await repository.read(), pointDisplayName: "測試點數" });
  selectProduct(ui, product.name);
  let first;
  await test("Store real sign/finalize feeds the real editor and persists Chinese ALT", async () => {
    first = await mockImage(ui, "上傳主視覺");
    assert.match(first.publicId, /kdcoffee-integration-kettle-product-hero-[a-f0-9]{16}-image-v01$/);
    assert.equal(component(ui.render(), "MediaAltEditor").props.alt, "整合咖啡壺主視覺");
    component(ui.render(), "MediaAltEditor").props.onChange({ alt: "Owner 人工主圖描述", decorative: false });
    product = await saveStore(ui);
    assert.equal(product.heroMedia.alt, "Owner 人工主圖描述");
    assert.equal(product.heroMedia.url, first.url);
  });
  await test("Store reopen/replacement does not inherit the previous manual ALT", async () => {
    ui = harness(StoreWorkspace, { initialCatalog: await repository.read(), pointDisplayName: "測試點數" });
    selectProduct(ui, product.name);
    assert.equal(component(ui.render(), "MediaAltEditor").props.alt, "Owner 人工主圖描述");
    const second = await mockImage(ui, "上傳主視覺");
    assert.notEqual(second.publicId, first.publicId);
    assert.match(second.publicId, /-v01$/);
    assert.equal(component(ui.render(), "MediaAltEditor").props.alt, "整合咖啡壺主視覺");
    const one = await mockImage(ui, "上傳相簿素材"), two = await mockImage(ui, "上傳相簿素材");
    assert.match(one.publicId, /-product-gallery-.*-v01$/);
    assert.match(two.publicId, /-product-gallery-.*-v02$/);
    product = await saveStore(ui);
    assert.deepEqual(product.gallery.map(item => item.alt), ["整合咖啡壺相簿圖片 1", "整合咖啡壺相簿圖片 2"]);
  });
  await test("The real library picker transmits ALT and non-media edits preserve it", async () => {
    await button(ui.render(), "從網站素材庫選擇主視覺").props.onClick();
    const picker = component(ui.render(), "HeroMediaLibraryPicker");
    const pickerUi = harness(HeroMediaLibraryPicker, picker.props);
    const choice = nodes(pickerUi.render(), item => item.type === "button" && text(item).includes(libraryAsset.name))[0];
    assert.ok(choice); await choice.props.onClick();
    assert.equal(component(ui.render(), "MediaAltEditor").props.alt, libraryAsset.alt);
    component(ui.render(), "MediaAltEditor").props.onChange({ alt: "手動保留的禮盒主圖", decorative: false });
    const nameLabel = nodes(ui.render(), item => item.type === "label" && text(item).startsWith("名稱"))[0];
    nodes(nameLabel, item => item.type === "input")[0].props.onChange({ target: { value: "更新商品文案名稱" } });
    product = await saveStore(ui);
    assert.equal(product.heroMedia.alt, "手動保留的禮盒主圖");
    assert.equal(product.heroMedia.url, libraryAsset.path);
  });
  await test("decorative true/false/absent survive real Store persistence and public projection", async () => {
    component(ui.render(), "MediaAltEditor").props.onChange({ alt: "", decorative: true });
    product = await saveStore(ui);
    const published = findPublicStoreProductBySlug(await repository.read(), product.slug);
    assert.equal(published.heroMedia.decorative, true);
    assert.ok(renderToStaticMarkup(createElement(StoreProductGallery, { name: published.name, heroMedia: published.heroMedia, gallery: [] })).includes('alt=""'));
    component(ui.render(), "MediaAltEditor").props.onChange({ alt: "恢復內容圖片描述", decorative: false });
    product = await saveStore(ui);
    assert.equal(product.heroMedia.decorative, false);
    const legacyGallery = { ...product.gallery[0] };
    delete legacyGallery.decorative;
    product = await jsonResponse(await productApi.PATCH(request("/api/admin/store/products", "PATCH", { id: product.id, expectedRevision: product.revision, action: "update", changes: { gallery: [legacyGallery, ...product.gallery.slice(1)] } })));
    assert.equal(product.gallery[0].decorative, undefined);
    assert.deepEqual([product.id, product.slug, product.sku, product.price, product.inventory, product.pvValue], protectedProductFields);
  });

  let assetOne, assetTwo, gifts;
  await test("Gifts real upload naming and legacy CMS read preserve the original URL", async () => {
    assetOne = await uploadGift();
    assert.equal(assetOne.fileName, "kdcoffee-gifts-hero-v01.png");
    const state = await jsonResponse(await giftsApi.GET(request("/api/admin/gifts/landing")));
    const document = { ...structuredClone(DEFAULT_GIFT_LANDING), hero: { ...structuredClone(DEFAULT_GIFT_LANDING.hero),
      alt: "舊圖手動描述", image: { url: assetOne.asset.path, alt: "舊素材描述", caption: "" } } };
    await jsonResponse(await giftsApi.PUT(request("/api/admin/gifts/landing", "PUT", { revision: state.revision, document })));
    const old = await fs.readFile(getGiftCmsFile());
    gifts = await giftUi();
    assert.equal(component(gifts.render(), "MediaAltEditor").props.alt, "舊圖手動描述");
    assert.deepEqual(await fs.readFile(getGiftCmsFile()), old);
  });
  await test("Gifts actual editor synchronizes both fields on new upload and Save/reopen", async () => {
    assetTwo = await uploadGift();
    assert.equal(assetTwo.fileName, "kdcoffee-gifts-hero-v02.png");
    await component(gifts.render(), "AssetUploadButton").props.onUploaded(assetTwo.asset);
    assert.equal(component(gifts.render(), "MediaAltEditor").props.alt, "KD Coffee 禮盒專區主視覺");
    component(gifts.render(), "MediaAltEditor").props.onChange({ alt: "新的手動禮盒描述", decorative: false });
    const saved = await saveGift(gifts);
    assert.equal(saved.hero.alt, "新的手動禮盒描述");
    assert.equal(saved.hero.image.alt, saved.hero.alt);
    gifts = await giftUi();
    assert.equal(component(gifts.render(), "MediaAltEditor").props.alt, saved.hero.alt);
  });
  await test("Gifts same-image library selection retains manual ALT and explicit decoration renders empty", async () => {
    button(gifts.render(), "從素材庫選擇圖片").props.onClick();
    component(gifts.render(), "ImageLibraryPicker").props.onChoose(assetTwo.asset);
    assert.equal(component(gifts.render(), "MediaAltEditor").props.alt, "新的手動禮盒描述");
    component(gifts.render(), "MediaAltEditor").props.onChange({ alt: "", decorative: true });
    const saved = await saveGift(gifts);
    assert.equal(saved.hero.alt, "");
    assert.equal(saved.hero.image.alt, "");
    const state = await jsonResponse(await giftsApi.GET(request("/api/admin/gifts/landing")));
    const html = renderToStaticMarkup(createElement(GiftExperience, { model: state.model, cms: state.document }));
    assert.ok(html.includes('alt=""'));
    assert.equal(saved.hero.image.url, assetTwo.asset.path);
    assert.deepEqual(await fs.readFile(path.join(getAssetsUploadDir("misc"), assetOne.fileName)), png);
    assert.deepEqual(await fs.readFile(path.join(getAssetsUploadDir("misc"), assetTwo.fileName)), png);
  });
  await test("Asset Manager protects current manual ALT from a delayed upload result", async () => {
    const library = (await assetsApi.GET()).status === 200 ? await (await assetsApi.GET()).json() : null;
    const manager = harness(AssetManager, {}, library);
    const uploadProps = component(manager.render(), "AssetUploadButton").props;
    let resume;
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => new Promise(resolve => { resume = () => resolve(Response.json({ asset: { ...libraryAsset, path: "/uploads/assets/misc/new-version.png" } })); });
    try {
      const upload = harness(AssetUploadButton, uploadProps);
      nodes(upload.render(), item => item.type === "input")[0].props.onChange({ currentTarget: { files: [new File([png], "camera.png", { type: "image/png" })], value: "" } });
      await new Promise(resolve => setTimeout(resolve, 0));
      assert.ok(resume);
      const alt = nodes(manager.render(), item => item.type === "textarea")[0];
      alt.props.onChange({ target: { value: "更新中的人工 ALT" } });
      upload.render(component(manager.render(), "AssetUploadButton").props);
      resume();
      for (let step = 0; step < 20; step++) await new Promise(resolve => setTimeout(resolve, 1));
      assert.equal(nodes(manager.render(), item => item.type === "textarea")[0].props.value, "更新中的人工 ALT");
    } finally { globalThis.fetch = savedFetch; }
  });
  await test("Page Builder delayed media replacement follows its Section ID after reorder", async () => {
    const page = createPage("整合驗收頁", []);
    const firstSection = createSection("gallery"), secondSection = createSection("gallery");
    firstSection.media = [{ id: "media-integration-a", enabled: true, media: { type: "image", provider: "local", url: "/uploads/assets/misc/old-a.png" }, alt: "舊圖描述" }];
    secondSection.media = [{ id: "media-integration-b", enabled: true, media: { type: "image", provider: "local", url: "/uploads/assets/misc/old-b.png" }, alt: "另一區塊描述" }];
    page.draft.sections = [firstSection, secondSection];
    const pageUi = harness(PageBuilderManager, { pageId: page.id }, undefined, { 0: { version: 1, pages: [page] }, 1: page });
    const sectionElement = component(pageUi.render(), "SectionEditor");
    const sectionUi = harness(sectionElement.type, { ...sectionElement.props, expanded: true });
    button(sectionUi.render(), "媒體").props.onClick();
    const mediaElement = component(sectionUi.render(), "MediaEditor");
    const mediaUi = harness(mediaElement.type, mediaElement.props);
    const lateResult = component(mediaUi.render(), "MediaUploader").props.onChange;
    sectionElement.props.onMove(1);
    const replacement = { type: "image", provider: "local", url: "/uploads/assets/misc/replaced-a.png", alt: "新區塊圖片描述" };
    lateResult(replacement);
    const sections = nodes(pageUi.render(), node => node.type?.name === "SectionEditor").map(node => node.props.section);
    assert.deepEqual(sections.map(item => item.id), [secondSection.id, firstSection.id]);
    assert.equal(sections[0].media[0].media.url, secondSection.media[0].media.url);
    assert.equal(sections[0].media[0].alt, "另一區塊描述");
    assert.equal(sections[1].media[0].media.url, replacement.url);
    assert.equal(sections[1].media[0].alt, replacement.alt);
  });
  await test("Homepage real media handlers replace descriptions and preserve same-media manual ALT", async () => {
    const homepage = { home002: { cards: [{ id: "home-card-test", title: "首頁內容", image: "/uploads/assets/misc/home-old.png", alt: "上一張描述" }] } };
    const setPath = (parts, value) => {
      let target = homepage;
      for (const part of parts.slice(0, -1)) target = target[part];
      target[parts.at(-1)] = value;
    };
    function mediaEditor() {
      const content = harness(ContentSectionEditor, { sectionKey: "home002", value: homepage.home002, collectionKey: "cards", assets: [], products: [], setPath, uploadImage: async () => { throw Error("No real upload"); } });
      const nested = component(content.render(), "NestedMediaEditor");
      return harness(nested.type, nested.props);
    }
    const replacement = { type: "image", provider: "local", url: "/uploads/assets/misc/home-new.png", alt: "首頁新圖片描述" };
    component(mediaEditor().render(), "MediaUploader").props.onChange(replacement);
    assert.equal(homepage.home002.cards[0].alt, replacement.alt);
    component(mediaEditor().render(), "MediaAltEditor").props.onChange({ alt: "首頁人工描述", decorative: false });
    homepage.home002.cards[0].title = "只修改內容標題";
    component(mediaEditor().render(), "MediaUploader").props.onChange(replacement);
    assert.equal(homepage.home002.cards[0].alt, "首頁人工描述");
    assert.equal(homepage.home002.cards[0].title, "只修改內容標題");
    component(mediaEditor().render(), "MediaAltEditor").props.onChange({ alt: "", decorative: true });
    component(mediaEditor().render(), "MediaUploader").props.onChange(replacement);
    assert.equal(homepage.home002.cards[0].alt, "");
    assert.equal(homepage.home002.cards[0].decorative, true);
  });
  let deepLink, initialToken;
  const openDirect = async id => harness(StoreWorkspace, { initialCatalog: await repository.read(), pointDisplayName: "測試點數", initialProductId: id });
  const token = editor => uploader(editor, "上傳主視覺").props.productMediaNaming.sectionId;
  const stableId = /^cs-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  await test("Direct product link signs, mock-uploads, finalizes and saves without list selection", async () => {
    deepLink = await openDirect(product.id);
    initialToken = token(deepLink);
    assert.match(initialToken, stableId);
    assert.equal(token(deepLink), initialToken, "Re-render must keep the session token");
    assert.equal(uploader(deepLink, "上傳相簿素材").props.productMediaNaming.sectionId, initialToken);
    const media = await mockImage(deepLink, "上傳主視覺");
    assert.match(media.publicId, /product-hero-[a-f0-9]{16}-image-v01$/);
    product = await saveStore(deepLink);
    assert.equal(product.heroMedia.publicId, media.publicId);
    assert.equal(token(deepLink), initialToken, "Saving keeps this editor session");
    assert.deepEqual([product.id, product.slug, product.sku, product.price, product.inventory, product.pvValue], protectedProductFields);
  });
  await test("Direct refresh gets an isolated token; hero and two gallery uploads persist independently", async () => {
    deepLink = await openDirect(product.id);
    assert.notEqual(token(deepLink), initialToken);
    const session = token(deepLink);
    const hero = await mockImage(deepLink, "上傳主視覺");
    const one = await mockImage(deepLink, "上傳相簿素材"), two = await mockImage(deepLink, "上傳相簿素材");
    assert.match(hero.publicId, /product-hero-[a-f0-9]{16}-image-v01$/);
    assert.match(one.publicId, /product-gallery-[a-f0-9]{16}-image-v01$/);
    assert.match(two.publicId, /product-gallery-[a-f0-9]{16}-image-v02$/);
    assert.equal(token(deepLink), session);
    product = await saveStore(deepLink);
    assert.equal(product.heroMedia.publicId, hero.publicId);
    assert.deepEqual(product.gallery.slice(-2).map(item => item.publicId), [one.publicId, two.publicId]);
    assert.ok(product.gallery.slice(-2).every(item => /相簿圖片/.test(item.alt)));
    component(deepLink.render(), "MediaAltEditor").props.onChange({ alt: "直接連結人工描述", decorative: false });
    product = await saveStore(deepLink);
    const reopened = await openDirect(product.id);
    assert.equal(component(reopened.render(), "MediaAltEditor").props.alt, "直接連結人工描述");
    assert.equal(component(reopened.render(), "MediaAltEditor").props.decorative, false);
    await button(deepLink.render(), "重新載入").props.onClick();
    assert.equal(token(deepLink), session, "Reloading the same editor keeps its valid token");
  });
  await test("Product switching rotates tokens and rejects the previous editor's late media result", async () => {
    const second = await jsonResponse(await productApi.POST(request("/api/admin/store/products", "POST",
      { ...storeDraftPayload("products", newStoreAdminDraft("products", section.id)), name: "第二個測試商品", slug: "integration-second", sku: "MEDIA1I", price: 600, inventory: 3 })), 201);
    deepLink = await openDirect(product.id);
    const previousToken = token(deepLink);
    const late = uploader(deepLink, "上傳主視覺").props.onChange;
    selectProduct(deepLink, second.name);
    assert.match(token(deepLink), stableId);
    assert.notEqual(token(deepLink), previousToken);
    const before = JSON.stringify(await repository.read());
    late({ type: "image", provider: "local", url: "/uploads/stale.png", alt: "不得套用" });
    assert.equal(nodes(deepLink.render(), node => node.type?.name === "MediaAltEditor").length, 0);
    assert.equal(JSON.stringify(await repository.read()), before);
    const media = await mockImage(deepLink, "上傳主視覺");
    assert.match(media.publicId, /kdcoffee-integration-second-product-hero-/);
    await saveStore(deepLink);
    const saved = (await repository.read()).products.find(item => item.id === second.id);
    assert.equal(saved.heroMedia.publicId, media.publicId);
    assert.equal(saved.heroMedia.alt, "第二個測試商品主視覺");
    assert.deepEqual((await repository.read()).products.find(item => item.id === product.id), product);
    const forged = { ...uploader(deepLink, "上傳主視覺").props.productMediaNaming, usage: "product", mediaType: "image", publicId: media.publicId, productSlug: product.slug, reservedPublicIds: [] };
    assert.equal((await finalize.POST(request("/api/admin/media/finalize", "POST", forged))).status, 400);
  });
  await test("Unknown and malformed product IDs expose no uploader; new products need a valid slug", async () => {
    for (const id of ["missing-product", "../bad", "", undefined]) {
      const invalid = await openDirect(id);
      assert.equal(nodes(invalid.render(), node => node.type?.name === "MediaUploader").length, 0);
    }
    button(deepLink.render(), "＋ 新增").props.onClick();
    assert.equal(uploader(deepLink, "上傳主視覺").props.disabled, true);
    assert.match(token(deepLink), stableId);
    const context = { ...uploader(deepLink, "上傳主視覺").props.productMediaNaming, usage: "product", mediaType: "image", fileName: "test.png", mimeType: "image/png", fileSize: 100 };
    assert.equal((await sign.POST(request("/api/admin/media/sign", "POST", context))).status, 400);
    context.productSlug = product.slug;
    context.sectionId = "";
    assert.equal((await sign.POST(request("/api/admin/media/sign", "POST", context))).status, 400);
  });
  await test("Server product query keys isolate client navigation sessions without changing access control", async () => {
    const { default: StorePage } = await import("../app/admin/store/page.tsx");
    const first = await StorePage({ searchParams: Promise.resolve({ product: product.id }) });
    const other = await StorePage({ searchParams: Promise.resolve({ product: "missing-product" }) });
    const list = await StorePage();
    assert.equal(first.props.initialProductId, product.id);
    assert.equal(first.key, product.id);
    assert.notEqual(first.key, other.key);
    assert.equal(list.key, "store");
  });
  console.log("MEDIA.1H/1I integration " + passed + " PASS; synthetic TEMP and Mock Cloudinary only.");
} finally {
  cloudinary.api.resources = originalResources; cloudinary.api.resource = originalResource;
  globalThis.fetch = realFetch; globalThis.window = realWindow;
  delete globalThis.__media1hHooks; delete globalThis.__media1hCookie;
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  assert.match(path.basename(root), /^kd-media1h-/);
  await fs.rm(root, { recursive: true, force: true });
}
