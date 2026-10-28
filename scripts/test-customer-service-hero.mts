import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import * as modules from "node:module";
import sharp from "sharp";
import "./gift-frontend-test-bootstrap.mjs";
const { optimizeWebsiteImage } = await import("../lib/websiteImages");
const saved = { ...process.env }, root = await fs.mkdtemp(path.resolve("qa-output/cs1f/hero-unit-"));
process.env.KD_DATA_DIR = root; delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.ADMIN_SESSION_SECRET = crypto.randomBytes(48).toString("hex");
const globals = globalThis as unknown as { __csHeroCookie?: string };
const hook = (modules as unknown as { registerHooks: (hooks: { resolve: (s: string, c: unknown, next: (s: string, c: unknown) => unknown) => unknown }) => { deregister: () => void } }).registerHooks({ resolve(specifier, context, next) { return specifier === "next/headers" ? { url: "data:text/javascript,export async function cookies(){return {get:()=>globalThis.__csHeroCookie?{value:globalThis.__csHeroCookie}:undefined}}", shortCircuit: true } : next(specifier, context); } });
const { createAdminSessionValue } = await import("../lib/adminAuth");
const { POST } = await import("../app/api/admin/customer-service/route");
const { DEFAULT_SERVICE_DOCUMENT, ServiceValidationError, validateServiceDocument } = await import("../lib/customerServiceContent");
const { DEFAULT_SERVICE_HERO } = await import("../lib/customerServiceHero");
const { resolveServiceHero, assertServiceHeroAvailable } = await import("../lib/customerServiceHeroServer");
const { readCustomerServiceState, saveCustomerServiceState, getCustomerServiceFile, ServiceConflictError } = await import("../lib/customerServiceStore");
await fs.mkdir(path.join(root, "store"), { recursive: true }); await fs.writeFile(path.join(root, "store/assets.json"), JSON.stringify({ version: 1, updatedAt: "", assets: [] }));
const bytes = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#8a6b4a" } }).png().toBuffer();
const file = () => new File([new Uint8Array(bytes)], "Owner Hero.png", { type: "image/png" });
const request = (image: File, origin: string | null = "http://localhost:3321", fields: Record<string, string> = { create: "true" }) => {
  const form = new FormData(); form.set("file", image); for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request("http://localhost:3321/api/admin/customer-service", { method: "POST", headers: origin ? { Origin: origin, "Sec-Fetch-Site": origin.includes("localhost") ? "same-origin" : "cross-site" } : {}, body: form });
};
let count = 0;
async function test(name: string, run: () => Promise<void> | void) { await run(); console.log("PASS " + (++count) + " " + name); }
try {
  await test("Hero upload requires authentication and Owner role", async () => {
    assert.equal((await POST(request(file()))).status, 401); globals.__csHeroCookie = createAdminSessionValue({ role: "admin" }); assert.equal((await POST(request(file()))).status, 403); globals.__csHeroCookie = createAdminSessionValue({ role: "owner" });
  });
  await test("Hero upload rejects missing and foreign Origin", async () => { for (const origin of [null, "https://evil.test"]) assert.equal((await POST(request(file(), origin))).status, 403); });
  await test("Hero upload cannot write protected fallback storage", async () => { delete process.env.KD_DATA_DIR; try { assert.equal((await POST(request(file()))).status, 503); } finally { process.env.KD_DATA_DIR = root; } });
  await test("Hero is create-only and never overwrites an existing Asset ID", async () => { assert.equal((await POST(request(file(), undefined, { assetId: "LOGO001" }))).status, 400); });
  await test("MIME, extension, executable content and mismatched bytes are rejected", async () => {
    for (const image of [new File([new Uint8Array(bytes)], "bad.exe", { type: "image/png" }), new File([new Uint8Array(bytes)], "bad.jpg", { type: "image/jpeg" }), new File(["<svg><script>alert(1)</script></svg>"], "bad.png", { type: "image/png" }), new File([new Uint8Array(bytes)], "bad.png", { type: "text/plain" }), new File(["not an image"], "bad.png", { type: "image/png" })]) assert.equal((await POST(request(image))).status, 400);
  });
  await test("File size, dimensions and filename traversal are rejected", async () => {
    const wide = await sharp({ create: { width: 12001, height: 1, channels: 3, background: "#000" } }).png().toBuffer();
    for (const image of [new File([new Uint8Array(12 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }), new File([new Uint8Array(wide)], "wide.png", { type: "image/png" }), new File([new Uint8Array(bytes)], "../bad.png", { type: "image/png" })]) assert.equal((await POST(request(image))).status, 400);
  });
  let asset: { id: string; path: string };
  await test("Legal Hero upload reuses shared AssetRecord, immutable safe path and atomic library persistence", async () => {
    const response = await POST(request(file(), undefined, { create: "true", category: "../../elsewhere", seoStem: "../bad" })); assert.equal(response.status, 201); asset = (await response.json()).asset;
    assert.match(asset.path, /^\/uploads\/assets\/page-builder\/[a-z0-9-]+-v01\.webp$/); assert.deepEqual(await fs.readFile(path.join(root, asset.path.slice(1))), await optimizeWebsiteImage(bytes));
    const library = JSON.parse(await fs.readFile(path.join(root, "store/assets.json"), "utf8")); assert.equal(library.assets.length, 1); assert.equal(library.assets[0].id, asset.id); assert.equal(library.version, 2);
    for (const format of ["jpeg", "webp"] as const) {
      const encoded = await sharp(bytes).toFormat(format).toBuffer();
      const result = await POST(request(new File([new Uint8Array(encoded)], "Legal." + format, { type: "image/" + format })));
      assert.equal(result.status, 201);
      const uploaded = (await result.json()).asset;
      assert.deepEqual(await fs.readFile(path.join(root, uploaded.path.slice(1))), await optimizeWebsiteImage(encoded));
    }
  });
  await test("Legacy config gains current Hero in memory without GET writes or revision changes", async () => {
    const document = structuredClone(DEFAULT_SERVICE_DOCUMENT); delete document.config.hero; (validateServiceDocument as (value: unknown) => void)(document);
    const file = getCustomerServiceFile(); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify({ schemaVersion: 1, revision: 7, document }));
    const before = await fs.readFile(file), state = await readCustomerServiceState(); assert.equal(state.revision, 7); assert.deepEqual(state.document.config.hero, DEFAULT_SERVICE_HERO); assert.deepEqual(await fs.readFile(file), before);
  });
  await test("Existing public Asset Library photos remain selectable without copying or writing their bytes", async () => {
    const source = JSON.parse(await fs.readFile("public/data/assets.json", "utf8"));
    const asset = source.assets.find((item: { path: string; status: string }) => item.status === "active" && /^\/uploads\/assets\/.*\.(jpe?g|png|webp)$/i.test(item.path));
    assert.ok(asset); const file = path.join(process.cwd(), "public", asset.path.slice(1)), bytes = await fs.readFile(file);
    const libraryFile = path.join(root, "store/assets.json"), library = JSON.parse(await fs.readFile(libraryFile, "utf8")); library.assets.push(asset); await fs.writeFile(libraryFile, JSON.stringify(library));
    const hero = { src: asset.path as string, alt: "既有安全素材", position: "center" as const };
    await assertServiceHeroAvailable(hero); assert.deepEqual(await resolveServiceHero(hero), hero); assert.deepEqual(await fs.readFile(file), bytes);
  });
  await test("Hero config saves, reloads and resolves the canonical image/alt/position", async () => {
    const state = await readCustomerServiceState(); state.document.config.hero = { src: asset.path, alt: "Owner 的咖啡情境", position: "top" };
    const next = await saveCustomerServiceState({ revision: state.revision, document: state.document }); assert.equal(next.revision, 8);
    assert.deepEqual((await readCustomerServiceState()).document.config.hero, state.document.config.hero); assert.deepEqual(await resolveServiceHero(next.document.config.hero), state.document.config.hero);
  });
  await test("Unsafe Hero JSON, HTML alt and unsupported focal values are rejected", () => {
    for (const patch of [{ src: "data:image/png;base64,AAAA" }, { src: "https://evil.test/a.png" }, { src: "/uploads/assets/misc/../a.png" }, { alt: "<script>" }, { position: "expression(x)" }]) { const document = structuredClone(DEFAULT_SERVICE_DOCUMENT); Object.assign(document.config.hero!, patch); assert.throws(() => validateServiceDocument(document), ServiceValidationError); }
  });
  await test("Missing Hero uses original fallback and unknown assets cannot be saved", async () => {
    assert.deepEqual(await resolveServiceHero(null), DEFAULT_SERVICE_HERO);
    const state = await readCustomerServiceState(), before = await fs.readFile(getCustomerServiceFile()); state.document.config.hero!.src = "/uploads/assets/misc/no-such-asset.png";
    await assert.rejects(saveCustomerServiceState({ revision: state.revision, document: state.document }), ServiceValidationError); assert.deepEqual(await fs.readFile(getCustomerServiceFile()), before);
    assert.deepEqual(await resolveServiceHero(state.document.config.hero), DEFAULT_SERVICE_HERO);
  });
  await test("A deleted asset cannot be newly saved and stored stale references safely fall back", async () => {
    await fs.unlink(path.join(root, asset.path.slice(1))); const state = await readCustomerServiceState(); assert.deepEqual(await resolveServiceHero(state.document.config.hero), DEFAULT_SERVICE_HERO);
    await assert.rejects(saveCustomerServiceState({ revision: state.revision, document: state.document }), ServiceValidationError); await fs.writeFile(path.join(root, asset.path.slice(1)), await optimizeWebsiteImage(bytes));
  });
  await test("Revision conflict preserves an already-uploaded asset and authoritative CMS bytes", async () => {
    const state = await readCustomerServiceState(), before = await fs.readFile(getCustomerServiceFile()); state.document.config.title = "衝突草稿";
    await assert.rejects(saveCustomerServiceState({ revision: state.revision - 1, document: state.document }), ServiceConflictError); assert.deepEqual(await fs.readFile(getCustomerServiceFile()), before); assert.deepEqual(await fs.readFile(path.join(root, asset.path.slice(1))), await optimizeWebsiteImage(bytes));
  });
  console.log("CUSTOMER SERVICE HERO: " + count + " PASS");
} finally { hook.deregister(); delete globals.__csHeroCookie; for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]; Object.assign(process.env, saved); }
