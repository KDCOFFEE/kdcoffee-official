import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { registerHooks, createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

const reactUrl = pathToFileURL(createRequire(import.meta.url).resolve("react")).href;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "next/headers") return { url: "data:text/javascript,export async function cookies(){return {get(){const value=globalThis.__storeAdminCookie;return value?{value}:undefined;}};}", shortCircuit: true };
  if (specifier === "react" && context.parentURL?.endsWith("/components/admin/StoreWorkspace.tsx")) return {
    url: "data:text/javascript," + encodeURIComponent(`import React from ${JSON.stringify(reactUrl)};export * from ${JSON.stringify(reactUrl)};export default React;export const useState=(value)=>globalThis.__storeUiFixture?globalThis.__storeUiFixture.useState(value):React.useState(value);export const useRef=(value)=>globalThis.__storeUiFixture?globalThis.__storeUiFixture.useRef(value):React.useRef(value);`), shortCircuit: true,
  };
  if (specifier === "react" && context.parentURL?.endsWith("/components/admin/ImageLibraryPicker.tsx")) return {
    url: "data:text/javascript," + encodeURIComponent(`import React from ${JSON.stringify(reactUrl)};export * from ${JSON.stringify(reactUrl)};export default React;export const useState=(value)=>globalThis.__storePickerFixture?globalThis.__storePickerFixture.useState(value):React.useState(value);export const useMemo=(factory,deps)=>globalThis.__storePickerFixture?factory():React.useMemo(factory,deps);`), shortCircuit: true,
  };
  if (specifier === "react" && context.parentURL?.endsWith("/components/admin/MediaUploader.tsx")) return {
    url: "data:text/javascript," + encodeURIComponent(`import React from ${JSON.stringify(reactUrl)};export * from ${JSON.stringify(reactUrl)};export default React;export const useState=(value)=>globalThis.__storeMediaFixture?globalThis.__storeMediaFixture.useState(value):React.useState(value);export const useRef=(value)=>globalThis.__storeMediaFixture?globalThis.__storeMediaFixture.useRef(value):React.useRef(value);`), shortCircuit: true,
  };
  return nextResolve(specifier, context);
} });

const protectedFiles = [
  "components/layout/Header.tsx", "components/layout/HeaderNavigation.tsx", "components/layout/Footer.tsx",
  "app/globals.css", "app/works/page.tsx", "app/works/[slug]/page.tsx",
  "app/cart/page.tsx", "app/checkout/page.tsx", "app/api/orders/route.ts",
  "lib/membershipCommerce.ts", "lib/referralPv.ts", "lib/membershipBusinessRules.ts", "lib/fulfillment.ts",
  "components/admin/MediaUploader.tsx", "components/admin/HeroMediaLibraryPicker.tsx", "lib/cloudinaryCleanup.ts",
  "components/store/StoreProductCard.tsx", "components/store/StoreFilters.tsx", "lib/storePublicSelectors.ts",
  "lib/storePublicMetadata.ts", "package.json", "package-lock.json",
  "public/data/assets.json", "public/data/homepage.json", "public/data/website-data.json", "public/data/pages.json",
  "data/store-domain/catalog.json",
  "components/admin/HomepageManager.tsx", "components/admin/ImageLibraryPicker.tsx",
  "app/api/admin/homepage/upload/route.ts", "lib/storagePaths.ts", "lib/media.ts",
  "components/home/HomepageV3.tsx", "components/home/HomepageMotion.tsx", "lib/homepageCms.ts", "lib/pageBuilderVisualStyle.ts", "data/homepageData.ts",
];
const hashes = async () => Object.fromEntries(await Promise.all(protectedFiles.map(async file =>
  [file, createHash("sha256").update(await fs.readFile(file)).digest("hex")])));
const before = await hashes();
const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6d2a-hero-"));
const previousData = process.env.KD_DATA_DIR, previousMount = process.env.RAILWAY_VOLUME_MOUNT_PATH, previousSecret = process.env.ADMIN_SESSION_SECRET;
const previousFetch = globalThis.fetch;
process.env.KD_DATA_DIR = root;
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.ADMIN_SESSION_SECRET = randomBytes(32).toString("hex");
let passed = 0;
async function test(label, run) {
  try { await run(); console.log(`PASS ${String(++passed).padStart(3, "0")} ${label}`); }
  catch (error) { console.error(`FAIL ${label}`); throw error; }
}
function nodes(tree, predicate, result = []) {
  if (Array.isArray(tree)) { for (const item of tree) nodes(item, predicate, result); return result; }
  if (!tree || typeof tree !== "object") return result;
  if (predicate(tree)) result.push(tree);
  nodes(tree.props?.children, predicate, result);
  return result;
}
function text(tree) {
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join("");
  return text(tree.props?.children);
}
function button(tree, label) {
  const found = nodes(tree, node => node.type === "button" && text(node) === label)[0];
  assert.ok(found, "Missing button: " + label); return found;
}
function control(tree, label) {
  const owner = nodes(tree, node => node.type === "label" && text(node).startsWith(label))[0];
  assert.ok(owner, "Missing label: " + label);
  const input = nodes(owner, node => ["input", "textarea", "select"].includes(node.type))[0];
  assert.ok(input); return input;
}
try {
  const { createStoreRepository, emptyStoreCatalog, StoreRevisionConflictError, StoreRepositoryIntegrityError } = await import("../lib/storeRepository.ts");
  const { validateStoreCatalog, StoreValidationError } = await import("../lib/storeValidation.ts");
  const { readPublicStoreIndex } = await import("../lib/storePublicReadModel.ts");
  const { selectPublicStoreIndex } = await import("../lib/storePublicSelectors.ts");
  const { publicStoreHero, DEFAULT_STORE_HERO, storeHeroStyle, resolveStoreHeroTiming } = await import("../lib/storeHero.ts");
  const { uploadStoreHeroImage, storeHeroLibraryAssets } = await import("../lib/storeHeroMedia.ts");
  const { default: MediaUploader } = await import("../components/admin/MediaUploader.tsx");
  const { default: ImageLibraryPicker } = await import("../components/admin/ImageLibraryPicker.tsx");
  const uploadApi = await import("../app/api/admin/homepage/upload/route.ts");
  const sharp = createRequire(import.meta.url)("sharp");
  const { createAdminSessionValue } = await import("../lib/adminAuth.ts");
  const api = await import("../app/api/admin/store/settings/route.ts");
  const catalogApi = await import("../app/api/admin/store/route.ts");
  const { default: StoreWorkspace } = await import("../components/admin/StoreWorkspace.tsx");
  const { default: StorePage } = await import("../app/store/page.tsx");
  const repository = createStoreRepository();
  const origin = "http://127.0.0.1:4318";
  const request = (value, headers = {}) => new Request(origin + "/api/admin/store/settings", {
    method: "PATCH", headers: { origin, "content-type": "application/json", ...headers },
    body: typeof value === "string" ? value : JSON.stringify(value),
  });
  const cookie = (role = "owner") => { globalThis.__storeAdminCookie = createAdminSessionValue({ role }); };
  const visualDefaults = { titleFontSize: 48, titleColor: "#251b16", subtitleFontSize: 16, subtitleColor: "#514336", motionEnabled: false, timing: { mediaDuration: 1600, headlineLine1Start: 1740, leadStart: 2110 } };
  const image = { type: "image", url: "https://example.com/editorial.webp", alt: "  Owner image ALT  ", provider: "cloudinary", publicId: "private/hero", width: 1800, height: 1000, format: "webp", bytes: 5000 };
  const diskBytes = () => fs.readFile(repository.catalogPath, "utf8");

  await test("Legacy catalog validates without settings or schema-version migration", () => validateStoreCatalog(emptyStoreCatalog()));
  await test("Absent catalog read remains write-free and returns unchanged legacy index shape", async () => {
    assert.deepEqual(await readPublicStoreIndex(), selectPublicStoreIndex(emptyStoreCatalog()));
    assert.deepEqual(await fs.readdir(root), []);
  });
  await test("Default Hero uses a tracked existing coffee image without persisted fallback", async () => {
    assert.deepEqual(publicStoreHero(), DEFAULT_STORE_HERO);
    await fs.access("public" + DEFAULT_STORE_HERO.backgroundImage.url);
    assert.equal(Object.hasOwn(await repository.read(), "settings"), false);
  });
  await test("Hero API denies unauthenticated users before creating runtime data", async () => {
    assert.equal((await api.PATCH(request({ expectedRevision: 0, changes: { title: "denied" } }))).status, 401);
    assert.deepEqual(await fs.readdir(root), []);
  });
  await test("Hero API denies non-owner role", async () => {
    cookie("admin"); assert.equal((await api.PATCH(request({ expectedRevision: 0, changes: { title: "denied" } }))).status, 403);
  });
  cookie();
  await test("Hero API rejects cross-origin request", async () => assert.equal((await api.PATCH(request({}, { origin: "https://foreign.example" }))).status, 403));
  await test("Hero API rejects non-JSON body", async () => assert.equal((await api.PATCH(request("{}", { "content-type": "text/plain" }))).status, 415));
  await test("Hero API rejects malformed JSON", async () => assert.equal((await api.PATCH(request("{broken"))).status, 400));
  await test("Hero API rejects oversized declared payload", async () => assert.equal((await api.PATCH(request({}, { "content-length": String(512 * 1024 + 1) }))).status, 413));
  await test("First Hero edit accepts catalog revision zero, increments revision and keeps schema 1", async () => {
    const response = await api.PATCH(request({ expectedRevision: 0, changes: { title: "  Owner 商店  ", subtitle: "Owner\n精選", backgroundImage: image } }));
    assert.equal(response.status, 200, await response.clone().text());
    const catalog = await response.json();
    assert.equal(catalog.revision, 1); assert.equal(catalog.schemaVersion, 1);
    assert.deepEqual(catalog.settings.hero, { title: "  Owner 商店  ", subtitle: "Owner\n精選", backgroundImage: image });
    assert.equal(response.headers.get("cache-control"), "no-store");
    validateStoreCatalog(catalog);
  });
  await test("Settings survive a fresh repository read with an unchanged validated pre-save backup", async () => {
    assert.deepEqual((await createStoreRepository().read()).settings.hero.backgroundImage, image);
    const backups = await fs.readdir(path.join(path.dirname(repository.catalogPath), "backups"));
    assert.equal(backups.length, 1);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(path.dirname(repository.catalogPath), "backups", backups[0]), "utf8")), emptyStoreCatalog());
  });
  await test("Public Hero DTO contains only title subtitle URL ALT, with no internal media fields", async () => {
    const index = await readPublicStoreIndex();
    assert.deepEqual(index.hero, { ...visualDefaults, title: "  Owner 商店  ", subtitle: "Owner\n精選", backgroundImage: { url: image.url, alt: image.alt }, mobileBackgroundImage: { url: image.url, alt: image.alt } });
    assert.doesNotMatch(JSON.stringify(index.hero), /publicId|provider|bytes|width|height|format|revision/);
    const bytes = await diskBytes(); await readPublicStoreIndex(); assert.equal(await diskBytes(), bytes);
  });
  await test("Hero patch preserves omitted subtitle and image", async () => {
    await repository.updateHero(1, { title: "Revised title" });
    const saved = await repository.read();
    assert.equal(saved.settings.hero.subtitle, "Owner\n精選"); assert.deepEqual(saved.settings.hero.backgroundImage, image);
  });
  await test("Stale Hero revision returns 409 and preserves exact stored bytes", async () => {
    const bytes = await diskBytes();
    const response = await api.PATCH(request({ expectedRevision: 1, changes: { title: "stale" } }));
    assert.equal(response.status, 409); assert.match((await response.json()).error, /重新載入/);
    assert.equal(await diskBytes(), bytes);
  });
  for (const [label, changes] of [
    ["title type", { title: 123 }], ["title limit", { title: "x".repeat(201) }],
    ["subtitle limit", { subtitle: "x".repeat(501) }], ["video", { backgroundImage: { type: "video", url: "https://example.com/a.mp4", alt: "" } }],
    ["YouTube", { backgroundImage: { type: "youtube", url: "https://youtu.be/abcdefghijk", videoId: "abcdefghijk", alt: "" } }],
    ["unsafe URL", { backgroundImage: { type: "image", url: "javascript:alert(1)", alt: "" } }],
    ["traversal URL", { backgroundImage: { type: "image", url: "/uploads/../private", alt: "" } }],
    ["ALT limit", { backgroundImage: { type: "image", url: "/images/a.webp", alt: "x".repeat(301) } }],
    ["unknown hero key", { eyebrow: "NEW" }], ["empty patch", {}],
  ]) await test("Invalid Hero " + label + " rejects with 400 without changing catalog", async () => {
    const bytes = await diskBytes(), revision = (await repository.read()).revision;
    const response = await api.PATCH(request({ expectedRevision: revision, changes }));
    assert.equal(response.status, 400, await response.clone().text()); assert.equal(await diskBytes(), bytes);
  });
  for (const revision of [-1, 1.5, "2", 9007199254740992]) await test("Invalid catalog revision " + revision + " rejected", async () => {
    assert.equal((await api.PATCH(request({ expectedRevision: revision, changes: { title: "invalid" } }))).status, 400);
  });
  await test("Unknown envelope fields and prototype-shaped domain patches reject", async () => {
    assert.equal((await api.PATCH(request({ expectedRevision: 2, changes: { title: "x" }, dataRoot: root }))).status, 400);
    await assert.rejects(async () => repository.updateHero(2, JSON.parse('{"__proto__":{}}')), StoreValidationError);
  });
  await test("Concurrent Hero writers allow one winner and preserve optimistic revision safety", async () => {
    const revision = (await repository.read()).revision;
    const results = await Promise.allSettled([repository.updateHero(revision, { title: "writer A" }), createStoreRepository().updateHero(revision, { title: "writer B" })]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    const rejected = results.find(result => result.status === "rejected"); assert.ok(rejected.reason instanceof StoreRevisionConflictError);
  });
  await test("Hero edits preserve existing Section Category Product values and PV", async () => {
    await repository.createSection({ id: "section", name: "Section", slug: "section" });
    await repository.createCategory({ id: "category", sectionId: "section", name: "Category", slug: "category" });
    await repository.createProduct({ id: "product", sectionId: "section", categoryId: "category", name: "Product", slug: "product", sku: "SKU", price: 0, inventory: 0, pvValue: 2.5 });
    const catalog = await repository.read();
    await repository.updateHero(catalog.revision, { subtitle: "Preserve entities" });
    const saved = await repository.read();
    for (const key of ["sections", "categories", "products"]) assert.deepEqual(saved[key], catalog[key]);
  });
  await test("Clearing optional Hero settings restores display fallback without persisting defaults", async () => {
    await repository.updateHero((await repository.read()).revision, { title: null, subtitle: "  ", backgroundImage: null });
    const catalog = await repository.read(); assert.equal(Object.hasOwn(catalog, "settings"), false);
    assert.deepEqual(await readPublicStoreIndex(), selectPublicStoreIndex(catalog));
  });
  await test("Malformed persisted Hero settings fail closed as integrity errors with no replacement", async () => {
    const bytes = await diskBytes();
    await fs.writeFile(repository.catalogPath, JSON.stringify({ ...JSON.parse(bytes), settings: { hero: { title: 12 } } }));
    const malformed = await diskBytes();
    await assert.rejects(readPublicStoreIndex(), StoreRepositoryIntegrityError);
    assert.equal((await catalogApi.GET()).status, 500);
    assert.equal((await api.PATCH(request({ expectedRevision: JSON.parse(bytes).revision, changes: { title: "x" } }))).status, 500);
    assert.equal(await diskBytes(), malformed); await fs.writeFile(repository.catalogPath, bytes);
  });
  await test("Backup integrity failure remains 500 with original catalog intact", async () => {
    const backupPath = path.join(path.dirname(repository.catalogPath), "backups"), moved = backupPath + "-held";
    await fs.rename(backupPath, moved);
    try {
      await fs.writeFile(backupPath, "not a directory");
      const bytes = await diskBytes();
      assert.equal((await api.PATCH(request({ expectedRevision: JSON.parse(bytes).revision, changes: { title: "x" } }))).status, 500);
      assert.equal(await diskBytes(), bytes);
    } finally { await fs.unlink(backupPath); await fs.rename(moved, backupPath); }
  });


  await test("Mobile image is optional in schema 1 and pure projection falls back to Desktop URL and ALT", async () => {
    validateStoreCatalog({ ...await repository.read(), settings: { hero: { backgroundImage: image } } });
    assert.deepEqual(publicStoreHero({ backgroundImage: image }).mobileBackgroundImage, { url: image.url, alt: image.alt });
    assert.equal(DEFAULT_STORE_HERO.title, "KD Coffee 商店");
    assert.equal(DEFAULT_STORE_HERO.subtitle, "為日常咖啡，選一件真正喜歡的器物。");
    const source = await fs.readFile("lib/storeHero.ts", "utf8");
    assert.match(source, /import type/);
    assert.doesNotMatch(source, /(?:from|import\s*\()[^\n]*(?:node:|server-only|Repository|Commerce)|process\.env|\bfetch\s*\(|writeFile|readFile/);
    assert.match(source, /type === "image"/);
    assert.deepEqual(publicStoreHero({ backgroundImage: { type: "video", url: "/bad.mp4", alt: "" } }), DEFAULT_STORE_HERO);
  });
  for (const [label, media] of [
    ["video", { type: "video", url: "/a.mp4", alt: "" }],
    ["managed video", { type: "video", provider: "cloudinary", publicId: "managed/hero", url: "https://example.com/a.mp4", alt: "" }],
    ["YouTube", { type: "youtube", url: "https://youtu.be/abcdefghijk", videoId: "abcdefghijk", alt: "" }],
    ["unsafe URL", { type: "image", url: "javascript:alert(1)", alt: "" }],
    ["traversal", { type: "image", url: "/uploads/../private", alt: "" }],
    ["ALT limit", { type: "image", url: "/a.webp", alt: "x".repeat(301) }],
  ]) await test("Invalid Mobile Hero " + label + " rejects with 400 and leaves exact catalog bytes intact", async () => {
    const bytes = await diskBytes();
    const response = await api.PATCH(request({ expectedRevision: (await repository.read()).revision, changes: { mobileBackgroundImage: media } }));
    assert.equal(response.status, 400, await response.clone().text()); assert.equal(await diskBytes(), bytes);
  });
  await test("Mobile image persists independently, projects URL/ALT only and clears without touching Desktop", async () => {
    const mobile = { ...image, url: "https://example.com/mobile.webp", alt: "Mobile ALT", publicId: "private/mobile" };
    await repository.updateHero((await repository.read()).revision, { backgroundImage: image, mobileBackgroundImage: mobile });
    const saved = await createStoreRepository().read();
    assert.equal(saved.schemaVersion, 1); assert.deepEqual(saved.settings.hero.mobileBackgroundImage, mobile);
    const projected = (await readPublicStoreIndex()).hero;
    assert.deepEqual(projected.mobileBackgroundImage, { url: mobile.url, alt: mobile.alt });
    assert.doesNotMatch(JSON.stringify(projected), /provider|publicId|bytes|width|height|format|revision/);
    await repository.updateHero(saved.revision, { mobileBackgroundImage: null });
    assert.deepEqual((await repository.read()).settings.hero.backgroundImage, image);
    assert.equal(Object.hasOwn((await repository.read()).settings.hero, "mobileBackgroundImage"), false);
    assert.deepEqual((await readPublicStoreIndex()).hero.mobileBackgroundImage, { url: image.url, alt: image.alt });
    await repository.updateHero((await repository.read()).revision, { backgroundImage: null });
    assert.equal(Object.hasOwn(await repository.read(), "settings"), false);
  });
  await test("Reusable uploader image-only mode hides all video/YouTube controls while Homepage default retains video", () => {
    const video = { type: "video", url: "/a.mp4" };
    const props = { label: "Hero", usage: "hero", value: video, onChange() {} };
    const imageOnly = renderToStaticMarkup(createElement(MediaUploader, { ...props, imageOnly: true }));
    assert.equal((imageOnly.match(/type="file"/g) || []).length, 1);
    assert.match(imageOnly, /accept="image\/\*"/); assert.doesNotMatch(imageOnly, /video|影片|YouTube|iframe/);
    const unchangedDefault = renderToStaticMarkup(createElement(MediaUploader, props));
    assert.equal((unchangedDefault.match(/type="file"/g) || []).length, 2);
    assert.match(unchangedDefault, /<video/); assert.match(unchangedDefault, /更換影片/);
    assert.match(unchangedDefault, /video\/mp4/);
  });


  for (const [key, value] of [["titleFontSize", 60], ["titleColor", "#a1b2c3"], ["subtitleFontSize", 20], ["subtitleColor", "gold"]]) await test("Hero " + key + " persists through actual settings API and fresh read with unchanged entities", async () => {
    const old = await repository.read();
    const response = await api.PATCH(request({ expectedRevision: old.revision, changes: { [key]: value } }));
    assert.equal(response.status, 200, await response.clone().text());
    const saved = await createStoreRepository().read(); assert.equal(saved.settings.hero[key], value);
    assert.equal((await readPublicStoreIndex()).hero[key], value);
    for (const name of ["sections", "categories", "products"]) assert.deepEqual(saved[name], old[name]);
  });
  for (const [key, value] of [
    ["titleFontSize", 27], ["titleFontSize", 121], ["titleFontSize", 48.5], ["titleFontSize", "48"],
    ["subtitleFontSize", 13], ["subtitleFontSize", 29], ["subtitleFontSize", 16.5],
    ["titleColor", "red"], ["titleColor", "#abc"], ["titleColor", "var(--secret)"], ["subtitleColor", "url(javascript:alert(1))"],
    ["motionEnabled", "true"], ["motionEnabled", 1],
    ["timing", { mediaDuration: -1 }], ["timing", { leadStart: 10001 }],
    ["timing", { mediaDuration: 123 }], ["timing", { mediaDuration: "1000" }],
    ["timing", { headlineLine1Start: 2000, leadStart: 1000 }],
    ["timing", { primaryCtaStart: 1000 }], ["timing", []],
  ]) await test("Invalid Hero visual " + key + "=" + JSON.stringify(value) + " returns 400 and preserves exact bytes", async () => {
    const bytes = await diskBytes();
    const response = await api.PATCH(request({ expectedRevision: (await repository.read()).revision, changes: { [key]: value } }));
    assert.equal(response.status, 400, await response.clone().text()); assert.equal(await diskBytes(), bytes);
  });
  await test("Hero animation config uses Homepage timing roles and survives persistence without unrelated Homepage controls", async () => {
    const timing = { mediaDuration: 1000, headlineLine1Start: 300, leadStart: 600 };
    const response = await api.PATCH(request({ expectedRevision: (await repository.read()).revision, changes: { motionEnabled: true, timing } }));
    assert.equal(response.status, 200, await response.clone().text());
    assert.deepEqual((await createStoreRepository().read()).settings.hero.timing, timing);
    assert.deepEqual((await readPublicStoreIndex()).hero.timing, timing);
    assert.equal((await readPublicStoreIndex()).hero.motionEnabled, true);
    assert.deepEqual(resolveStoreHeroTiming(timing), timing);
    assert.equal(storeHeroStyle((await readPublicStoreIndex()).hero)["--store-hero-text-animation"], "home-hero-enter");
  });
  await test("Clearing only visual overrides restores safe defaults without saving them or migrating schema", async () => {
    await repository.updateHero((await repository.read()).revision, { titleFontSize: null, titleColor: null, subtitleFontSize: null, subtitleColor: null, motionEnabled: null, timing: null });
    const catalog = await repository.read(); assert.equal(catalog.schemaVersion, 1); assert.equal(Object.hasOwn(catalog, "settings"), false);
    assert.deepEqual(publicStoreHero(), { title: "KD Coffee 商店", subtitle: "為日常咖啡，選一件真正喜歡的器物。", backgroundImage: DEFAULT_STORE_HERO.backgroundImage, mobileBackgroundImage: DEFAULT_STORE_HERO.backgroundImage, ...visualDefaults });
    assert.deepEqual(await readPublicStoreIndex(), selectPublicStoreIndex(catalog));
  });

  let state = [], refs = [], stateIndex = 0, refIndex = 0;
  let initialCatalog = await repository.read();
  globalThis.__storeUiFixture = {
    useState(initial) { const index = stateIndex++; if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial; return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; },
    useRef(initial) { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }); },
  };
  globalThis.window = { confirm: () => true };
  const ui = () => { stateIndex = refIndex = 0; return StoreWorkspace({ initialCatalog, pointDisplayName: "KD 點" }); };
  const panel = target => {
    const found = nodes(ui(), node => node.type === "section" && node.props["aria-labelledby"] === "store-hero-" + target + "-heading")[0];
    assert.ok(found); return found;
  };
  const preview = target => nodes(panel(target), node => node.type === "img")[0];
  const uploader = target => {
    const found = nodes(panel(target), node => node.type === MediaUploader)[0];
    assert.ok(found); return found;
  };
  const submit = () => nodes(ui(), node => node.type === "form")[0].props.onSubmit({ preventDefault() {} });
  const picker = () => { const found = nodes(ui(), node => node.type === ImageLibraryPicker)[0]; assert.ok(found); return found; };
  const imageAsset = { id: "image-asset", name: "咖啡情境", originalFileName: "coffee-editorial.webp", path: "/images/editorial.webp", alt: "Coffee library ALT", category: "hero", status: "active" };
  const mobileAsset = { ...imageAsset, id: "mobile-asset", name: "手機器物", originalFileName: "mobile-cup.webp", path: "/images/mobile.webp", alt: "Mobile library ALT" };
  const inactiveAsset = { ...imageAsset, id: "missing", name: "Missing", path: "/missing.webp", status: "missing" };
  const videoAsset = { ...imageAsset, id: "video", name: "Video", path: "/a.mp4" };
  const requests = [], uploads = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, method: options.method || "GET" });
    if (url === "/api/admin/store/settings") return api.PATCH(request(options.body));
    if (url === "/api/admin/store") return catalogApi.GET();
    if (url === "/api/admin/assets") return Response.json({ assets: [imageAsset, mobileAsset, inactiveAsset, videoAsset] });
    if (url === "/api/admin/homepage/upload") {
      assert.equal(options.method, "POST"); assert.ok(options.body instanceof FormData);
      assert.equal(options.body.get("artworkSlug"), "homepage");
      assert.match(options.body.get("desiredName"), /^kd-coffee-store-hero-(desktop|mobile)-[a-f0-9]{8}$/);
      assert.match(options.body.get("assetType"), /^store-hero-(desktop|mobile)$/);
      assert.equal(options.body.get("file").type, "image/png");
      const response = await uploadApi.POST(new Request(origin + url, { method: "POST", body: options.body }));
      const result = await response.clone().json();
      assert.equal(response.status, 200, JSON.stringify(result)); assert.equal(result.optimized, true);
      assert.match(result.path, /^\/uploads\/artworks\/homepage\/kdcoffee-kd-coffee-store-hero-(desktop|mobile)-.*\.webp$/);
      uploads.push(result); return response;
    }
    throw new Error("Unexpected write/upload/commerce request: " + url);
  };
  await test("Admin Settings keeps text/ALT fields, separate visible previews and optional Mobile without a raw select or URL field", () => {
    button(ui(), "設定").props.onClick();
    for (const label of ["Hero 標題", "Hero 副標", "桌機 Hero ALT", "手機 Hero ALT"]) assert.ok(control(ui(), label));
    assert.equal(nodes(ui(), node => node.type === "form").length, 1);
    assert.equal(nodes(ui(), node => node.type === "select").length, 0);
    assert.doesNotMatch(text(ui()), /背景圖片網址|從素材庫選擇背景圖片/);
    for (const target of ["desktop", "mobile"]) {
      assert.equal(preview(target).props.src, DEFAULT_STORE_HERO.backgroundImage.url);
      assert.equal(uploader(target).props.imageOnly, true);
      assert.equal(uploader(target).props.imageActionLabel, "選擇圖片 / 上傳圖片");
      assert.ok(button(panel(target), "從素材庫選擇"));
    }
    assert.match(text(panel("mobile")), /手機 Hero 素材（選填）/);
    assert.match(text(panel("mobile")), /未設定時自動使用桌機 Hero。/);
  });
  await test("Hero text edits remain unsaved until explicit submission", async () => {
    const bytes = await diskBytes();
    control(ui(), "Hero 標題").props.onChange({ target: { value: "Owner 編輯標題" } });
    control(ui(), "Hero 副標").props.onChange({ target: { value: "Owner 編輯副標" } });
    assert.match(text(ui()), /尚未儲存/); assert.equal(await diskBytes(), bytes);
  });
  await test("Store upload helper rejects video and empty image files before any upload request", async () => {
    const count = requests.length;
    await assert.rejects(() => uploadStoreHeroImage(new File(["video"], "a.mp4", { type: "video/mp4" }), "desktop"), /只接受圖片/);
    await assert.rejects(() => uploadStoreHeroImage(new File([], "empty.png", { type: "image/png" }), "mobile"), /圖片大小/);
    assert.equal(requests.length, count);
  });
  const png = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#a38462" } }).png().toBuffer();
  for (const target of ["desktop", "mobile"]) await test(target + " native image input uploads via unchanged Homepage API and immediately previews optimized image without saving settings", async () => {
    const bytes = await diskBytes();
    const props = uploader(target).props;
    let mediaState = [], mediaRefs = [], mediaIndex = 0, mediaRefIndex = 0;
    globalThis.__storeMediaFixture = {
      useState(initial) { const index = mediaIndex++; if (!(index in mediaState)) mediaState[index] = initial; return [mediaState[index], value => { mediaState[index] = typeof value === "function" ? value(mediaState[index]) : value; }]; },
      useRef(initial) { const index = mediaRefIndex++; return mediaRefs[index] ?? (mediaRefs[index] = { current: initial }); },
    };
    try {
      const tree = MediaUploader(props);
      const input = nodes(tree, node => node.type === "input" && node.props.type === "file")[0];
      assert.equal(input.props.accept, "image/*"); assert.equal(input.props.disabled, false);
      await input.props.onChange({ target: { files: [new File([png], target + ".png", { type: "image/png" })], value: "picked" } });
    } finally { delete globalThis.__storeMediaFixture; }
    assert.equal(uploads.length, target === "desktop" ? 1 : 2);
    const uploaded = uploads.at(-1);
    assert.equal(preview(target).props.src, uploaded.path);
    assert.equal(await diskBytes(), bytes);
    const storedFile = path.join(root, ...uploaded.path.split("/").filter(Boolean));
    const metadata = await sharp(await fs.readFile(storedFile)).metadata();
    assert.equal(metadata.format, "webp"); assert.equal(metadata.width, 32); assert.equal(metadata.height, 24);
    assert.match(text(ui()), /圖片已選擇，請儲存主視覺/);
  });
  await test("Both uploaded references persist and fresh Admin reopening retains previews", async () => {
    control(ui(), "桌機 Hero ALT").props.onChange({ target: { value: "Uploaded desktop ALT" } });
    control(ui(), "手機 Hero ALT").props.onChange({ target: { value: "Uploaded mobile ALT" } });
    await submit();
    const saved = await createStoreRepository().read();
    assert.equal(saved.settings.hero.backgroundImage.url, uploads[0].path);
    assert.equal(saved.settings.hero.mobileBackgroundImage.url, uploads[1].path);
    initialCatalog = saved; state = []; refs = []; button(ui(), "設定").props.onClick();
    assert.equal(preview("desktop").props.src, uploads[0].path); assert.equal(preview("desktop").props.alt, "Uploaded desktop ALT");
    assert.equal(preview("mobile").props.src, uploads[1].path); assert.equal(preview("mobile").props.alt, "Uploaded mobile ALT");
  });
  for (const [target, asset] of [["desktop", imageAsset], ["mobile", mobileAsset]]) await test(target + " visual library uses existing thumbnail modal with readable filename/label and immediate selected preview", async () => {
    const bytes = await diskBytes();
    await button(panel(target), "從素材庫選擇").props.onClick();
    const selected = picker();
    assert.equal(selected.props.title, target === "desktop" ? "選擇桌機 Hero 圖片" : "選擇手機 Hero 圖片");
    assert.deepEqual(selected.props.assets.map(item => item.id), [imageAsset.id, mobileAsset.id]);
    const markup = renderToStaticMarkup(createElement(ImageLibraryPicker, selected.props));
    assert.match(markup, /role="dialog"/); assert.match(markup, /aria-modal="true"/);
    assert.match(markup, /page-asset-grid/); assert.match(markup, /coffee-editorial.webp/); assert.match(markup, /手機器物/);
    assert.equal((markup.match(/<img/g) || []).length, 2);
    assert.doesNotMatch(markup, /<select|image-asset|mobile-asset|a.mp4|missing.webp/);
    selected.props.onChoose(selected.props.assets.find(item => item.id === asset.id));
    assert.equal(preview(target).props.src, asset.path); assert.equal(preview(target).props.alt, asset.alt);
    assert.equal(await diskBytes(), bytes);
    assert.equal(nodes(ui(), node => node.type === ImageLibraryPicker).length, 0);
  });
  await test("Existing picker search finds labels filenames and ALT while opaque names get readable fallback without registry mutation", () => {
    const records = [imageAsset, mobileAsset];
    const beforeAssets = structuredClone(records);
    const assets = storeHeroLibraryAssets(records);
    let query = "";
    globalThis.__storePickerFixture = { useState: () => [query, value => { query = value; }] };
    try {
      for (const [search, expectedPath] of [["coffee-editorial", imageAsset.path], ["手機器物", mobileAsset.path], ["Mobile library ALT", mobileAsset.path]]) {
        const props = { assets, onChoose() {}, onClose() {} };
        control(ImageLibraryPicker(props), "搜尋素材").props.onChange({ target: { value: search } });
        assert.deepEqual(nodes(ImageLibraryPicker(props), node => node.type === "img").map(node => node.props.src), [expectedPath]);
      }
    } finally { delete globalThis.__storePickerFixture; }
    assert.deepEqual(records, beforeAssets);
    const opaqueAsset = { ...imageAsset, name: "12345678-1234-1234-1234-123456789abc", alt: "日常咖啡" };
    assert.equal(storeHeroLibraryAssets([opaqueAsset])[0].name, "日常咖啡 · coffee-editorial.webp");
  });
  await test("Actual Hero form submits selected desktop/mobile through owner-authenticated revision API and persists all fields", async () => {
    control(ui(), "桌機 Hero ALT").props.onChange({ target: { value: "Owner ALT" } });
    control(ui(), "手機 Hero ALT").props.onChange({ target: { value: "Owner Mobile ALT" } });
    await submit();
    const saved = await repository.read();
    assert.deepEqual(saved.settings.hero, {
      title: "Owner 編輯標題", subtitle: "Owner 編輯副標",
      backgroundImage: { type: "image", provider: "local", url: imageAsset.path, alt: "Owner ALT" },
      mobileBackgroundImage: { type: "image", provider: "local", url: mobileAsset.path, alt: "Owner Mobile ALT" },
    });
    assert.match(text(ui()), /主視覺已儲存/);
  });
  await test("Public landing presents distinct desktop/mobile URLs and ALT with saved escaped text and no internal media fields", async () => {
    const page = await StorePage({ searchParams: Promise.resolve({}) });
    const hero = nodes(page, node => node.type === "header" && node.props.className?.split(" ").includes("hero"))[0];
    assert.ok(hero);
    const markup = renderToStaticMarkup(hero);
    assert.match(markup, /Owner 編輯標題/); assert.match(markup, /Owner 編輯副標/); assert.match(markup, /alt="Owner ALT"/);
    assert.doesNotMatch(markup, /publicId|bytes|provider|videoId|posterUrl/);
    for (const node of nodes(hero, node => node.type === "img")) assert.deepEqual(Object.keys(node.props).filter(key => /publicId|bytes|provider|duration|videoId|posterUrl/.test(key)), []);
    assert.equal(nodes(hero, node => node.type === "h1").length, 1);
    assert.equal(nodes(hero, node => node.type === "p").length, 1);
    assert.equal(nodes(hero, node => ["video", "iframe"].includes(node.type)).length, 0);
    assert.deepEqual(nodes(hero, node => node.type === "img").map(node => [node.props.className, node.props.src, node.props.alt]), [
      ["heroImage", imageAsset.path, "Owner ALT"], ["heroMobileImage", mobileAsset.path, "Owner Mobile ALT"],
    ]);
    assert.doesNotMatch(text(hero), /STORE|COLLECTION|KD COFFEE ·/);
  });

  const appearance = () => { const found = nodes(ui(), node => node.props?.className?.split(" ").includes("heroAppearanceFrame"))[0]; assert.ok(found); return found; };
  await test("Admin unsaved typography/colors/media update the same immediate preview without persistence or animation replay", async () => {
    const bytes = await diskBytes(), count = requests.length, key = appearance().key;
    control(ui(), "主標題字體大小").props.onChange({ target: { value: "6" } });
    assert.equal(control(ui(), "主標題字體大小").props.value, 6, "Keep a transient typed value instead of resetting the numeric input");
    assert.equal(appearance().props.style["--store-hero-title-size"], "28px", "Preview remains within the shared safe range while typing");
    control(ui(), "主標題字體大小").props.onChange({ target: { value: "60" } });
    control(ui(), "主標題文字顏色自訂色").props.onChange({ target: { value: "#445566" } });
    control(ui(), "副標字體大小").props.onChange({ target: { value: "18" } });
    nodes(ui(), node => node.type === "button" && node.props["aria-label"] === "副標文字顏色：品牌金")[0].props.onClick();
    const frame = appearance();
    assert.equal(frame.props.style["--store-hero-title-size"], "60px");
    assert.equal(frame.props.style["--store-hero-title-color"], "#445566");
    assert.equal(frame.props.style["--store-hero-subtitle-size"], "18px");
    assert.equal(frame.props.style["--store-hero-subtitle-color"], "#b7905a");
    assert.equal(frame.props["data-store-hero-motion"], "off"); assert.equal(frame.key, key);
    assert.equal(nodes(frame, node => node.type === "img")[0].props.src, imageAsset.path);
    assert.match(text(frame), /Owner 編輯標題/); assert.match(text(frame), /Owner 編輯副標/);
    button(ui(), "手機預覽").props.onClick();
    assert.equal(nodes(appearance(), node => node.type === "img")[0].props.src, mobileAsset.path);
    assert.equal(appearance().props.style["--store-hero-title-mobile-size"], "43px");
    assert.equal(await diskBytes(), bytes); assert.equal(requests.length, count);
  });
  await test("Homepage-style animation controls persist and explicit preview is the only replay trigger", async () => {
    const bytes = await diskBytes();
    control(ui(), "啟用主視覺進場動畫").props.onChange({ target: { checked: true } });
    control(ui(), "圖片浮現時間").props.onChange({ target: { value: "1" } });
    control(ui(), "主標題開始").props.onChange({ target: { value: "0.3" } });
    control(ui(), "副標開始").props.onChange({ target: { value: "0.6" } });
    assert.equal(appearance().props["data-store-hero-motion"], "off");
    const key = appearance().key; button(ui(), "預覽進場動畫").props.onClick();
    assert.notEqual(appearance().key, key); assert.equal(appearance().props["data-store-hero-motion"], "on");
    assert.equal(appearance().props.style["--store-hero-title-start"], "300ms");
    assert.equal(appearance().props.style["--store-hero-subtitle-start"], "600ms");
    assert.equal(await diskBytes(), bytes);
    await submit();
    const saved = await repository.read();
    assert.equal(saved.settings.hero.titleFontSize, 60); assert.equal(saved.settings.hero.titleColor, "#445566");
    assert.equal(saved.settings.hero.subtitleFontSize, 18); assert.equal(saved.settings.hero.subtitleColor, "gold");
    assert.equal(saved.settings.hero.motionEnabled, true);
    assert.deepEqual(saved.settings.hero.timing, { mediaDuration: 1000, headlineLine1Start: 300, leadStart: 600 });
    initialCatalog = saved; state = []; refs = []; button(ui(), "設定").props.onClick();
    assert.equal(control(ui(), "主標題字體大小").props.value, 60);
    assert.equal(control(ui(), "副標字體大小").props.value, 18);
    assert.equal(appearance().props["data-store-hero-motion"], "off");
    assert.equal(preview("desktop").props.src, imageAsset.path); assert.equal(preview("mobile").props.src, mobileAsset.path);
  });
  await test("Public Hero receives safe configured typography/color and shared Homepage animation config as Server Component markup", async () => {
    const page = await StorePage({ searchParams: Promise.resolve({}) });
    const hero = nodes(page, node => node.type === "header" && node.props.className?.split(" ").includes("hero"))[0];
    assert.equal(hero.props["data-store-hero-motion"], "on");
    assert.equal(hero.props.style["--store-hero-title-size"], "60px");
    assert.equal(hero.props.style["--store-hero-title-color"], "#445566");
    assert.equal(hero.props.style["--store-hero-subtitle-size"], "18px");
    assert.equal(hero.props.style["--store-hero-subtitle-color"], "#b7905a");
    assert.equal(hero.props.style["--store-hero-media-animation"], "home-hero-media-emerge");
    assert.equal(hero.props.style["--store-hero-media-duration"], "1000ms");
    assert.equal(hero.props.style["--store-hero-title-start"], "300ms");
    const markup = renderToStaticMarkup(hero);
    assert.doesNotMatch(markup, /<video|<iframe|publicId|provider|bytes|videoId|posterUrl/);
  });

  await test("Removing Mobile override is draft-only until save, then falls back to Desktop without deleting uploaded files", async () => {
    const bytes = await diskBytes(), desktop = (await repository.read()).settings.hero.backgroundImage;
    button(ui(), "移除手機覆蓋").props.onClick();
    assert.equal(await diskBytes(), bytes);
    assert.equal(preview("mobile").props.src, imageAsset.path); assert.equal(preview("mobile").props.alt, "Owner ALT");
    assert.match(text(panel("mobile")), /未設定時自動使用桌機 Hero。/);
    await submit();
    const saved = await repository.read();
    assert.deepEqual(saved.settings.hero.backgroundImage, desktop);
    assert.equal(Object.hasOwn(saved.settings.hero, "mobileBackgroundImage"), false);
    assert.deepEqual((await readPublicStoreIndex()).hero.mobileBackgroundImage, { url: desktop.url, alt: desktop.alt });
    for (const uploaded of uploads) await fs.access(path.join(root, ...uploaded.path.split("/").filter(Boolean)));
  });
  await test("Removing Desktop reference changes draft until save; refined fallback is not persisted and shared image is never deleted", async () => {
    const bytes = await diskBytes(); button(ui(), "移除桌機圖片引用").props.onClick();
    assert.equal(preview("desktop").props.src, DEFAULT_STORE_HERO.backgroundImage.url); assert.equal(await diskBytes(), bytes);
    await submit();
    assert.equal(Object.hasOwn((await repository.read()).settings.hero, "backgroundImage"), false);
    const page = await StorePage({ searchParams: Promise.resolve({}) });
    const hero = nodes(page, node => node.type === "header" && node.props.className?.split(" ").includes("hero"))[0];
    assert.match(renderToStaticMarkup(hero), /kd-coffee-first-specialty-coffee-drip-bag-v01.png/);
    assert.ok(requests.every(item => item.method === "GET" || item.url === "/api/admin/store/settings" || (item.url === "/api/admin/homepage/upload" && item.method === "POST")));
    for (const uploaded of uploads) await fs.access(path.join(root, ...uploaded.path.split("/").filter(Boolean)));
  });
  await test("409 preserves unsaved Hero draft and disables save until reload", async () => {
    control(ui(), "Hero 標題").props.onChange({ target: { value: "Unsaved Owner" } });
    await repository.updateHero((await repository.read()).revision, { title: "Other Owner" });
    await submit();
    assert.equal(control(ui(), "Hero 標題").props.value, "Unsaved Owner");
    assert.equal(nodes(ui(), node => node.type === "fieldset")[0].props.disabled, true);
    assert.match(text(ui()), /其他操作更新/);
    await button(ui(), "重新載入最新版本").props.onClick();
    assert.equal(control(ui(), "Hero 標題").props.value, "Other Owner");
    assert.equal(nodes(ui(), node => node.type === "fieldset")[0].props.disabled, false);
  });
  await test("Hero CSS keeps restrained desktop typography/local gradient and mobile image-before-ivory-text with separate override", async () => {
    const css = await fs.readFile("components/store/StorePublic.module.css", "utf8");
    assert.match(css, /min-height: 500px/); assert.match(css, /object-fit: cover/);
    assert.match(css, /radial-gradient\(ellipse at left bottom/);
    assert.match(css, /width: min\(460px/);
    assert.match(css, /font-size: var\(--store-hero-title-size, clamp\(42px, 4.2vw, 52px\)\)/);
    assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.heroImage \{ display: none;/);
    assert.match(css, /\.heroMobileImage \{ display: block;/);
    assert.match(css, /\.heroContent \{ width: 100%;[^}]*background: #faf6ed/);
    assert.match(css, /font-size: var\(--store-hero-title-mobile-size, clamp\(30px, 8.5vw, 36px\)\)/);
    assert.doesNotMatch(css, /heroRule|heroSignature|heroEyebrow|animation:|transition:/);
    const adminCss = await fs.readFile("components/admin/StoreWorkspace.module.css", "utf8");
    assert.match(adminCss, /\.heroPreview img/); assert.match(adminCss, /aspect-ratio:\s*4\s*\/\s*3/);
  });

  await test("Hero motion reuses existing Homepage keyframes once, keeps first paint visible and safely disables reduced motion without an engine", async () => {
    const css = await fs.readFile("components/store/StoreHeroMotion.module.css", "utf8");
    const globals = await fs.readFile("app/globals.css", "utf8");
    assert.match(globals, /@keyframes home-hero-enter/); assert.match(globals, /@keyframes home-hero-media-emerge/);
    assert.match(css, /prefers-reduced-motion: no-preference/); assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(css, /animation: none !important/); assert.match(css, /opacity: 1 !important/);
    assert.match(css, /animation-iteration-count: 1/);
    assert.doesNotMatch(css, /@keyframes|infinite|display: none|opacity: 0|transition:/);
    const source = await fs.readFile("lib/storeHero.ts", "utf8");
    assert.match(source, /resolveHeroTiming/); assert.match(source, /resolveVisualColor/);
    assert.doesNotMatch(source, /useEffect|IntersectionObserver|setInterval|requestAnimationFrame|fetch\(|writeFile|process\.env/);
    const page = await fs.readFile("app/store/page.tsx", "utf8");
    assert.doesNotMatch(page, /useEffect|IntersectionObserver|data-home-hero|data-works-motion|onAnimationEnd|onScroll/);
    const admin = await fs.readFile("components/admin/StoreWorkspace.tsx", "utf8");
    assert.equal((admin.match(/setHeroPreviewKey\(key => key \+ 1\)/g) || []).length, 1);
    assert.match(admin, /type="button" onClick=\{\(\) => \{ setHeroPreviewKey/);
  });

  await test("Hero subtitle/title HTML stays plain escaped text and no new public detail/API exists", async () => {
    await repository.updateHero((await repository.read()).revision, { title: "<script>bad</script>", subtitle: "<b>text</b>" });
    const page = await StorePage({ searchParams: Promise.resolve({}) });
    const hero = nodes(page, node => node.type === "header" && node.props.className?.split(" ").includes("hero"))[0];
    const markup = renderToStaticMarkup(hero);
    assert.match(markup, /&lt;script&gt;/); assert.match(markup, /&lt;b&gt;/); assert.doesNotMatch(markup, /<script>bad/);
    await assert.rejects(fs.access("app/store/[slug]"), { code: "ENOENT" });
    await assert.rejects(fs.access("app/api/store"), { code: "ENOENT" });
  });
  await test("Protected commerce member media Artwork data packages remain unchanged", async () => assert.deepEqual(await hashes(), before));
  console.log(`J.6D.2A Store Hero: ${passed}/${passed} PASS; isolated fixtures only; ${protectedFiles.length} protected hashes unchanged.`);
} finally {
  globalThis.fetch = previousFetch;
  delete globalThis.__storeAdminCookie; delete globalThis.__storeUiFixture; delete globalThis.__storeMediaFixture; delete globalThis.__storePickerFixture; delete globalThis.window;
  for (const [key, value] of [["KD_DATA_DIR", previousData], ["RAILWAY_VOLUME_MOUNT_PATH", previousMount], ["ADMIN_SESSION_SECRET", previousSecret]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  await fs.rm(root, { recursive: true, force: true });
}
