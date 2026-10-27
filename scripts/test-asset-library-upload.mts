import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import * as modules from "node:module";
import sharp from "sharp";
import "./gift-frontend-test-bootstrap.mjs";

const savedEnv = { ...process.env }, root = await fs.mkdtemp(path.join(os.tmpdir(), "KD_Asset_Upload_Test_"));
process.env.KD_DATA_DIR = root; delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.ADMIN_SESSION_SECRET = crypto.randomBytes(48).toString("hex");
const state = globalThis as unknown as { __assetUploadCookie?: string };
const hooks = (modules as unknown as { registerHooks: (hooks: { resolve: (s: string, c: unknown, next: (s: string, c: unknown) => unknown) => unknown }) => { deregister: () => void } }).registerHooks({ resolve(s, c, next) { return s === "next/headers" ? { url: "data:text/javascript,export async function cookies(){return {get:()=>globalThis.__assetUploadCookie?{value:globalThis.__assetUploadCookie}:undefined}}", shortCircuit: true } : next(s, c); } });
const { createAdminSessionValue } = await import("../lib/adminAuth");
const { POST } = await import("../app/api/admin/assets/upload/route");
const { getAssetLibrary } = await import("../lib/assets");
const libraryFile = path.join(root, "store/assets.json"), cmsFile = path.join(root, "gift-cms/content.json");
await fs.mkdir(path.dirname(libraryFile), { recursive: true }); await fs.mkdir(path.dirname(cmsFile), { recursive: true });
await fs.writeFile(cmsFile, JSON.stringify({ untouched: "canonical Gift CMS must not be written by upload" }));
const cmsBefore = await fs.readFile(cmsFile);
const existing = { id: "LIB-EXISTING", category: "Brand / Test", name: "既有圖片", usage: "品牌", path: "", recommendedSize: "1600", displaySize: "自適應", format: "JPG", alt: "保留 ALT", seoStem: " Owner / Photo ", status: "missing" };
await fs.writeFile(libraryFile, JSON.stringify({ version: 1, updatedAt: "2026-01-01T00:00:00Z", assets: [existing] }));
const bytes = await sharp({ create: { width: 24, height: 16, channels: 3, background: "#73583d" } }).png().toBuffer();
const request = (file?: File, assetId?: string, create = false, extra: Record<string, string> = {}) => {
  const form = new FormData(); if (file) form.append("file", file); if (assetId) form.append("assetId", assetId); if (create) form.append("create", "true");
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  return new Request("http://127.0.0.1/api/admin/assets/upload", { method: "POST", body: form });
};
let passed = 0;
const test = async (name: string, run: () => Promise<void>) => { await run(); console.log(`PASS ${++passed} ${name}`); };
try {
  await test("Anonymous upload remains rejected before any metadata change", async () => { const before = await fs.readFile(libraryFile); assert.equal((await POST(request(new File([new Uint8Array(bytes)], "ok.png", { type: "image/png" }), undefined, true))).status, 401); assert.deepEqual(await fs.readFile(libraryFile), before); });
  state.__assetUploadCookie = createAdminSessionValue({ role: "owner" });
  await test("Missing file/ID and unknown existing IDs retain canonical rejection", async () => {
    assert.equal((await POST(request())).status, 400);
    const file = new File([new Uint8Array(bytes)], "ok.png", { type: "image/png" });
    assert.equal((await POST(request(file))).status, 400);
    assert.equal((await POST(request(file, "UNKNOWN"))).status, 404);
  });
  for (const format of ["jpeg", "png", "webp"] as const) await test(`Legal ${format} creates one shared AssetRecord with canonical bytes and metadata`, async () => {
    const buffer = await sharp(bytes).toFormat(format).toBuffer(), before = await getAssetLibrary();
    const file = new File([new Uint8Array(buffer)], `Owner Image.${format}`, { type: `image/${format}` });
    const response = await POST(request(file, undefined, true, { category: "gifts-only", seoStem: "../escape" })); assert.equal(response.status, 200);
    const result = await response.json(), after = await getAssetLibrary(), asset = result.asset;
    assert.equal(after.assets.length, before.assets.length + 1); assert.equal(after.version, before.version + 1);
    assert.equal(asset.category, "misc"); assert.match(asset.id, /^ASSET-[0-9a-f-]+$/); assert.match(asset.path, /^\/uploads\/assets\/misc\/kd-coffee-owner-image-[0-9a-f-]+-v01\.(jpg|png|webp)$/);
    assert.equal(asset.originalFileName, file.name); assert.equal(asset.status, "active"); assert.equal(asset.alt, "Owner Image"); assert.ok(asset.updatedAt);
    assert.deepEqual(after.assets.find(a => a.id === asset.id), asset); assert.deepEqual(await fs.readFile(path.join(root, asset.path.slice(1))), buffer);
  });
  await test("Existing Asset ID keeps normalization, identity, metadata and version naming", async () => {
    const file = new File([new Uint8Array(bytes)], "Phone.JPEG", { type: "image/jpeg" }); const before = await getAssetLibrary();
    const first = await (await POST(request(file, existing.id))).json(); const second = await (await POST(request(file, existing.id))).json();
    assert.equal(first.path, "/uploads/assets/brand-test/owner-photo-v01.jpg"); assert.equal(second.path, "/uploads/assets/brand-test/owner-photo-v02.jpg");
    assert.equal(second.asset.id, existing.id); assert.equal(second.asset.alt, existing.alt); assert.equal(second.asset.usage, existing.usage); assert.equal((await getAssetLibrary()).assets.length, before.assets.length);
  });
  for (const mode of ["create", "existing"] as const) await test(`${mode} mode preserves MIME, extension and 12 MB rejection without metadata writes`, async () => {
    const before = await fs.readFile(libraryFile);
    for (const [file, message] of [[new File([new Uint8Array(bytes)], "bad.png", { type: "text/plain" }), "目前資產管理只接受圖片"], [new File([new Uint8Array(bytes)], "bad.exe", { type: "image/png" }), "不支援的圖片格式"], [new File([new Uint8Array(12 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }), "圖片不可超過 12 MB"]] as const) {
      const response = await POST(request(file, mode === "existing" ? existing.id : undefined, mode === "create")); assert.equal(response.status, 400); assert.equal((await response.json()).error, message); assert.deepEqual(await fs.readFile(libraryFile), before);
    }
  });
  await test("Existing Admin permission remains identical to canonical library upload", async () => { state.__assetUploadCookie = createAdminSessionValue({ role: "admin" }); assert.equal((await POST(request(new File([new Uint8Array(bytes)], "admin.png", { type: "image/png" }), undefined, true))).status, 200); });
  await test("Uploads never write Gift CMS and share one UI/API implementation", async () => {
    assert.deepEqual(await fs.readFile(cmsFile), cmsBefore);
    const button = await fs.readFile("components/admin/AssetUploadButton.tsx", "utf8"), manager = await fs.readFile("components/admin/AssetManager.tsx", "utf8"), gifts = await fs.readFile("components/admin/GiftCmsEditor.tsx", "utf8");
    assert.match(manager, /AssetUploadButton/); assert.match(gifts, /AssetUploadButton/); assert.match(button, /\/api\/admin\/assets\/upload/);
    assert.doesNotMatch(manager, /new FormData|assets\/upload/); assert.doesNotMatch(gifts, /new FormData|gifts\/upload|base64|writeFile/);
  });
  console.log(`CANONICAL ASSET UPLOAD: ${passed} PASS / 0 FAIL; TEMP ${root}`);
} finally {
  hooks.deregister(); delete state.__assetUploadCookie;
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key]; Object.assign(process.env, savedEnv);
}
