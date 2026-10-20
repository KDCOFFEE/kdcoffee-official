import assert from "node:assert/strict";
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import * as util from "node:util";
import * as asyncHooks from "node:async_hooks";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const project = fileURLToPath(new URL("../", import.meta.url));
const self = fileURLToPath(import.meta.url);
const realFile = path.join(project, "public/data/website-data.json");
const ownerFile = path.join(project, "public/data/homepage.json");
const expectedReal = "77b44042e32ef589c6c08a2c5a2589b15bc89d97e97542b11b0dd9769c18ad93";
const expectedOwner = "dbd97d72fd30bb548fff461084c3b497ec877e169d1f728c1fa408a92128cfac";
const hash = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function fingerprints() {
  const values: Array<[string, string]> = [];
  function visit(dir: string) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) visit(file);
      else if (item.isFile() && item.name.endsWith(".json")) values.push([path.relative(project, file), hash(file)]);
    }
  }
  visit(path.join(project, "data")); visit(path.join(project, "public/data"));
  return values.sort((a, b) => a[0].localeCompare(b[0]));
}
function within(root: string, file: string) {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return relative !== "" && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}
const beforeReal = fingerprints();
assert.equal(hash(realFile), expectedReal);
assert.equal(hash(ownerFile), expectedOwner);
assert.equal(beforeReal.length, 17);

if (!process.argv.includes("--temp-worker")) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "KD_Coffee_W3.4C_"));
  assert.ok(within(os.tmpdir(), temporary) && !within(project, temporary));
  try {
    const fixture = path.join(temporary, "store/website-data.json");
    fs.mkdirSync(path.dirname(fixture), { recursive: true });
    fs.copyFileSync(realFile, fixture);
    const env: NodeJS.ProcessEnv = { ...process.env, KD_DATA_DIR: temporary, W34C_TEST_ROOT: temporary,
      ADMIN_SESSION_SECRET: crypto.randomBytes(48).toString("hex"), NODE_ENV: "test", GIT_OPTIONAL_LOCKS: "0" };
    for (const key of ["RAILWAY_VOLUME_MOUNT_PATH", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID", "RAILWAY_ENVIRONMENT_ID",
      "DEV_PUBLIC_ORIGIN", "GIT_INDEX_FILE"]) delete env[key];
    const worker = spawnSync(process.execPath, ["--experimental-strip-types", self, "--temp-worker"], {
      cwd: project, env, stdio: "inherit", timeout: 120000,
    });
    if (worker.error) console.error("Transport TEMP worker failed to complete.");
    process.exitCode = worker.status ?? 1;
  } finally {
    assert.deepEqual(fingerprints(), beforeReal, "REAL DATA CHANGED");
    const cleanup = fs.realpathSync(temporary);
    assert.ok(within(fs.realpathSync(os.tmpdir()), cleanup));
    assert.ok(path.basename(cleanup).startsWith("KD_Coffee_W3.4C_") && !within(project, cleanup));
    fs.rmSync(cleanup, { recursive: true, force: true });
  }
  console.log("REAL DATA: 17/17 protected JSON unchanged; TEMP worker only.");
} else {
  // No application imports until TEMP environment/path isolation has been proved.
  const temporary = process.env.W34C_TEST_ROOT!;
  assert.ok(temporary && within(os.tmpdir(), temporary));
  assert.equal(process.env.KD_DATA_DIR, temporary);
  assert.equal(process.env.RAILWAY_VOLUME_MOUNT_PATH, undefined);
  const initial = fs.readFileSync(path.join(temporary, "store/website-data.json"));
  assert.equal(crypto.createHash("sha256").update(initial).digest("hex"), expectedReal);
  const routeId = "app/api/admin/works/[slug]/owner-write/route.ts";
  const allowed = new Set([routeId, ...[
    "adminAuth", "adminAuthorization", "publicSiteOrigin", "storagePaths", "jsonFileStore", "commerceLockProtocol",
    "worksArtworkEditorialWriteService", "worksArtworkOwnerReadService", "worksArtworkOwnerProjection",
    "worksArtworkFieldRegistry", "worksArtworkReadModel", "worksArtworkSourceTrace", "worksArtworkContract",
    "worksArtworkValidation", "worksArtworkResolver", "worksArtworkWriteModel", "productPageContent",
    "productPageContentValidation", "productPageSections", "productVisualAssets", "cleanRoastingMedia", "media", "productListing",
  ].map(n => "lib/" + n + ".ts")]);
  const cache = new Map<string, { exports: any }>();
  const jar = new Map<string, string>();
  const marker = "W34C_PRIVATE_ERROR_MARKER";
  let website = "", io = 0, serviceCalls = 0, cookieReads = 0, network = 0;
  let cookieFault = false, serviceFault = false, renameFault = false, unlockFault = false;
  function guard(file: unknown): asserts file is string {
    assert.equal(typeof file, "string");
    assert.ok(within(temporary, file as string), "Application filesystem access escaped TEMP");
  }
  const safeFs = {
    async readFile(file: string, ...args: any[]) { guard(file); io++; return (fsp.readFile as any)(file, ...args); },
    async open(file: string, ...args: any[]) { guard(file); io++; return (fsp.open as any)(file, ...args); },
    async rename(from: string, to: string) {
      guard(from); guard(to); io++;
      if (renameFault) throw Error(marker);
      return fsp.rename(from, to);
    },
    async unlink(file: string) {
      guard(file); io++;
      if (unlockFault && file === website + ".lock") throw Error(marker);
      return fsp.unlink(file);
    },
  };
  function load(id: string): any {
    assert.ok(allowed.has(id), "Unexpected application dependency: " + id);
    if (cache.has(id)) return cache.get(id)!.exports;
    const code = ts.transpileModule(fs.readFileSync(path.join(project, id), "utf8"), {
      fileName: id, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} }; cache.set(id, module);
    new Function("require", "module", "exports", code)((spec: string) => {
      if (spec === "server-only") return {};
      if (spec === "next/headers") return { cookies: async () => {
        cookieReads++; if (cookieFault) throw Error(marker);
        return { get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined };
      } };
      if (spec === "crypto" || spec === "node:crypto") return crypto;
      if (spec === "path" || spec === "node:path") return path;
      if (spec === "node:util") return util;
      if (spec === "node:async_hooks") return asyncHooks;
      if (spec === "node:fs/promises") return safeFs;
      if (spec === "fs") return { promises: safeFs };
      assert.ok(spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("@/"), "External dependency forbidden");
      let resolved = spec.startsWith("@/") ? spec.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(id), spec));
      if (!resolved.endsWith(".ts")) resolved += ".ts";
      return load(resolved);
    }, module, module.exports);
    return module.exports;
  }
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async () => { network++; throw Error("Network forbidden"); };
  website = load("lib/storagePaths.ts").getWebsiteDataFile();
  guard(website);
  assert.equal(path.resolve(website), path.resolve(temporary, "store/website-data.json"));
  assert.notEqual(path.resolve(website).toLowerCase(), path.resolve(realFile).toLowerCase());
  assert.ok(!within(path.join(project, "public/data"), website));
  assert.ok(!path.resolve(website).replaceAll("\\", "/").match(/^\/data(?:\/|$)/iu));
  console.log("RESOLVED TEMP WEBSITE: " + website);
  console.log("PATH GUARD: PASS before writer import; real application IO guarded.");
  const engine = load("lib/worksArtworkEditorialWriteService.ts");
  const originalWrite = engine.writeWorksArtworkEditorialCommand;
  engine.writeWorksArtworkEditorialCommand = async (...args: any[]) => {
    serviceCalls++; if (serviceFault) throw Error(marker);
    return originalWrite(...args);
  };
  const route = load(routeId) as typeof import("../app/api/admin/works/[slug]/owner-write/route.ts");
  const auth = load("lib/adminAuth.ts") as typeof import("../lib/adminAuth.ts");
  const read = load("lib/worksArtworkOwnerReadService.ts") as typeof import("../lib/worksArtworkOwnerReadService.ts");
  const ownerToken = auth.createAdminSessionValue({ adminId: "transport-owner", role: "owner" });
  const adminToken = auth.createAdminSessionValue({ adminId: "transport-admin", role: "admin" });
  const target = "giotto-awakening", origin = "http://localhost:3000";
  type Data = Record<string, any>;
  const disk = (): Data => JSON.parse(fs.readFileSync(website, "utf8"));
  const product = (data = disk(), slug = target): Data => data.menu.products.find((p: Data) => p.slug === slug);
  let sequence = 0, pass = 0, fail = 0;
  function payload(field = "story.body", value: unknown = "HTTP 作品故事 ☕😀\n第二行", slug = target) {
    const pair = read.getWorksArtworkWritePreparation(product(disk(), slug));
    return { contractVersion: 1, expectedWorksRevision: pair.worksRevision, expectedEditToken: pair.editToken,
      requestId: "transport-request-" + (++sequence), operations: [{ scope: "updateEditorialContent", field, state: { mode: "value", value } }] };
  }
  function reset() {
    cookieFault = serviceFault = renameFault = unlockFault = false;
    if (fs.existsSync(website + ".lock")) fs.unlinkSync(website + ".lock");
    fs.writeFileSync(website, initial);
    io = serviceCalls = cookieReads = 0;
    jar.clear(); jar.set(auth.adminCookieName, ownerToken);
    Object.assign(process.env, { NODE_ENV: "test" });
    for (const key of ["DEV_PUBLIC_ORIGIN", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID", "RAILWAY_ENVIRONMENT_ID"]) delete process.env[key];
  }
  function request(body: unknown = payload(), changes: Record<string, string | null> = {}, raw?: BodyInit | null, slug = target) {
    const headers = new Headers({ origin, "content-type": "application/json" });
    for (const [key, value] of Object.entries(changes)) value === null ? headers.delete(key) : headers.set(key, value);
    return new Request(origin + "/api/admin/works/" + encodeURIComponent(slug) + "/owner-write", {
      method: "POST", headers, body: raw === undefined ? JSON.stringify(body) : raw, duplex: "half",
    } as RequestInit & { duplex: string });
  }
  const invoke = (req: Request, slug: unknown = target) => route.POST(req, { params: Promise.resolve({ slug: slug as string }) });
  async function responseBody(response: Response, status: number, code?: string) {
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.equal(response.headers.get("vary"), "Cookie, Origin");
    assert.equal(response.headers.has("access-control-allow-origin"), false);
    assert.equal(response.headers.has("set-cookie"), false);
    const body = await response.json();
    assert.ok(!JSON.stringify(body).includes(marker));
    assert.ok(!JSON.stringify(body).includes(project));
    assert.ok(!JSON.stringify(body).includes(temporary));
    if (code) { assert.equal(body.ok, false); assert.equal(body.error.code, code); }
    return body;
  }
  async function blocked(req: Request, status: number, code: string, slug: unknown = target) {
    const before = hash(website);
    const body = await responseBody(await invoke(req, slug), status, code);
    assert.equal(serviceCalls, 0, "Rejected transport gate called writer");
    assert.equal(io, 0, "Rejected transport gate accessed canonical storage");
    assert.equal(hash(website), before);
    return body;
  }
  async function check(name: string, run: () => unknown | Promise<unknown>) {
    reset();
    try { await run(); pass++; }
    catch (error) { fail++; console.error("FAIL " + name + ": " + (error instanceof Error ? error.message : "assertion")); }
  }
  try {
    for (const name of ["absent", "member only", "unsigned", "tampered", "expired"]) await check("auth " + name, async () => {
      const req = request(); jar.clear();
      if (name === "member only") jar.set("kd_member_session", marker);
      if (name === "unsigned") jar.set(auth.adminCookieName, "owner");
      if (name === "tampered") jar.set(auth.adminCookieName, ownerToken.slice(0, -1) + (ownerToken.endsWith("a") ? "b" : "a"));
      if (name === "expired") jar.set(auth.adminCookieName, auth.createAdminSessionValue({ now: new Date(Date.now() - 13 * 3600000) }));
      await blocked(req, 401, "UNAUTHENTICATED");
    });
    const legacyPayload = Buffer.from(JSON.stringify({ role: "admin", expiresAt: Date.now() + 600000 })).toString("base64url");
    const legacyToken = legacyPayload + "." + crypto.createHmac("sha256", process.env.ADMIN_SESSION_SECRET!).update(legacyPayload).digest("base64url");
    for (const token of [adminToken, legacyToken]) await check("non-owner/legacy denied", async () => {
      const req = request(); jar.set(auth.adminCookieName, token);
      await blocked(req, 403, "FORBIDDEN");
    });
    for (const denied of [401, 403]) await check("auth precedes params/body " + denied, async () => {
      jar.clear(); if (denied === 403) jar.set(auth.adminCookieName, adminToken);
      const req = request(); let touched = 0;
      Object.defineProperty(req, "body", { get() { touched++; throw Error(marker); } });
      const res = await route.POST(req, { get params(): Promise<{ slug: string }> { touched++; throw Error(marker); } });
      await responseBody(res, denied, denied === 401 ? "UNAUTHENTICATED" : "FORBIDDEN");
      assert.equal(touched, 0); assert.equal(serviceCalls, 0); assert.equal(io, 0);
    });
    for (const slug of ["", "../private", "a/b", "a\\b", "%2e%2e", "x".repeat(129)]) await check("invalid slug " + slug, async () => {
      await blocked(request({}, { origin: "https://evil.test" }, "{"), 400, "INVALID_REFERENCE", slug);
    });
    for (const source of [null, "null", "https://evil.test", "http://localhost:3001", "http://localhost:3000/path",
      "http://user:password@localhost:3000", "http://localhost:3000#x"]) await check("origin " + source, async () => {
      await blocked(request(undefined, { origin: source }), 403, "INVALID_ORIGIN");
    });
    for (const site of ["cross-site", "same-site", "none"]) await check("fetch metadata " + site, async () => {
      await blocked(request(undefined, { "sec-fetch-site": site }), 403, "INVALID_ORIGIN");
    });
    await check("Origin before content type/body", async () => {
      const req = request(undefined, { origin: "https://evil.test", "content-type": "text/plain" });
      Object.defineProperty(req, "body", { get() { throw Error("Body was touched"); } });
      await blocked(req, 403, "INVALID_ORIGIN");
    });
    await check("untrusted forwarded host cannot authorize origin", async () => {
      await blocked(request(undefined, { origin: "https://evil.test", host: "evil.test", "x-forwarded-host": "evil.test",
        "x-forwarded-proto": "https" }), 403, "INVALID_ORIGIN");
    });
    await check("production canonical origin through internal proxy URL", async () => {
      Object.assign(process.env, { NODE_ENV: "production", RAILWAY_SERVICE_ID: "isolated-test" });
      await responseBody(await invoke(request(undefined, { origin: "https://www.kdcoffee1962.com", "sec-fetch-site": "same-origin" })), 200);
    });
    await check("production ignores DEV_PUBLIC_ORIGIN", async () => {
      Object.assign(process.env, { NODE_ENV: "production", DEV_PUBLIC_ORIGIN: "https://tunnel.test" });
      await blocked(request(undefined, { origin: "https://tunnel.test" }), 403, "INVALID_ORIGIN");
    });
    await check("development tunnel requires explicit server opt-in", async () => {
      await blocked(request(undefined, { origin: "https://tunnel.test" }), 403, "INVALID_ORIGIN");
    });
    await check("configured development tunnel accepted", async () => {
      process.env.DEV_PUBLIC_ORIGIN = "https://tunnel.test";
      await responseBody(await invoke(request(undefined, { origin: "https://tunnel.test" })), 200);
    });
    for (const contentType of [null, "text/plain", "application/x-www-form-urlencoded", "application/merge-patch+json"]) {
      await check("Content-Type " + contentType, async () => {
        await blocked(request(undefined, { "content-type": contentType }), 415, "UNSUPPORTED_MEDIA_TYPE");
      });
    }
    for (const contentType of ["application/json", "application/json; charset=utf-8", "Application/JSON; charset=UTF-8"]) {
      await check("JSON Content-Type accepted " + contentType, async () => {
        await responseBody(await invoke(request(undefined, { "content-type": contentType })), 200);
        assert.equal(serviceCalls, 1);
      });
    }
    for (const raw of ["{bad", "", "[] trailing", '{"operations":']) await check("malformed JSON " + raw, async () => {
      await blocked(request(undefined, {}, raw), 400, "INVALID_WRITE_REQUEST");
    });
    await check("malformed UTF-8 rejected", async () => {
      await blocked(request(undefined, {}, new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc0, 0xaf, 0x22, 0x7d])), 400, "INVALID_WRITE_REQUEST");
    });
    await check("missing body", async () => { await blocked(request(undefined, {}, null), 400, "INVALID_WRITE_REQUEST"); });
    await check("declared body too large", async () => {
      await blocked(request(undefined, { "content-length": "32769" }), 413, "PAYLOAD_TOO_LARGE");
    });
    await check("malformed declared body length", async () => {
      await blocked(request(undefined, { "content-length": "bad" }), 400, "INVALID_WRITE_REQUEST");
    });
    await check("actual bytes too large despite false Content-Length", async () => {
      await blocked(request(undefined, { "content-length": "1" }, " ".repeat(32769)), 413, "PAYLOAD_TOO_LARGE");
    });
    await check("stream capped and cancelled", async () => {
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) { controller.enqueue(new Uint8Array(4096).fill(32)); },
        cancel() { cancelled = true; },
      });
      await blocked(request(undefined, {}, stream), 413, "PAYLOAD_TOO_LARGE"); assert.equal(cancelled, true);
    });
    await check("exact 32 KiB boundary accepted", async () => {
      const raw = JSON.stringify(payload("story.body", "Boundary"));
      await responseBody(await invoke(request(undefined, {}, raw + " ".repeat(32768 - Buffer.byteLength(raw)))), 200);
    });
    for (const value of [null, [], true, 0, "text", {}]) await check("invalid envelope " + JSON.stringify(value), async () => {
      await blocked(request(value), 400, "INVALID_WRITE_REQUEST");
    });
    const attacks: Array<[string, (body: Data) => void]> = [
      ["body targetRef", b => { b.targetRef = "another-artwork"; }],
      ["body slug", b => { b.slug = "another-artwork"; }],
      ["raw Product", b => { b.product = { name: marker }; }],
      ["raw worksPage", b => { b.worksPage = {}; }],
      ["unknown envelope", b => { b.extra = true; }],
      ["missing revision", b => { delete b.expectedWorksRevision; }],
      ["wrong version", b => { b.contractVersion = 2; }],
      ["empty operations", b => { b.operations = []; }],
      ["duplicate field", b => { b.operations.push(b.operations[0]); }],
      ["operation extra", b => { b.operations[0].extra = true; }],
      ["state extra", b => { b.operations[0].state.extra = true; }],
      ["inherit", b => { b.operations[0].state = { mode: "inherit" }; }],
      ["wrong scope", b => { b.operations[0].scope = "updatePresentation"; }],
      ["whitespace only", b => { b.operations[0].state.value = " \n\t"; }],
      ["surrogate", b => { b.operations[0].state.value = "\ud800"; }],
      ["invalid requestId", b => { b.requestId = "../private"; }],
    ];
    for (const [name, mutate] of attacks) await check(name, async () => {
      const body = payload(); mutate(body); await blocked(request(body), 400, "INVALID_WRITE_REQUEST");
    });
    for (const field of ["name", "shortCopy", "mood", "price", "stock", "SKU", "hero.media", "story.heading", "search.title",
      "presentation.visible", "menu.products[0].name"]) await check("non-writable " + field, async () => {
      await blocked(request(payload(field)), 400, "INVALID_WRITE_REQUEST");
    });
    await check("URL slug selects only its canonical Product", async () => {
      const other = disk().menu.products.find((p: Data) => p.slug !== target).slug;
      const before = disk(), body = payload("story.body", "Other artwork only", other);
      const res = await invoke(request(body, {}, undefined, other), other);
      await responseBody(res, 200);
      assert.equal(product(disk(), other).worksPage.fields["story.body"].value, "Other artwork only");
      assert.deepEqual(product(), product(before));
    });
    await check("unknown valid slug is 404 from service", async () => {
      const before = hash(website);
      await responseBody(await invoke(request(payload()), "missing-artwork"), 404, "ARTWORK_NOT_FOUND");
      assert.equal(serviceCalls, 1); assert.equal(hash(website), before);
    });
    for (const key of ["expectedWorksRevision", "expectedEditToken"]) await check("stale CAS " + key, async () => {
      const body = payload();
      if (key === "expectedWorksRevision") body.expectedWorksRevision = 12;
      else body.expectedEditToken = "w3e1." + "0".repeat(64);
      const before = hash(website);
      await responseBody(await invoke(request(body)), 409, "REVISION_CONFLICT");
      assert.equal(serviceCalls, 1); assert.equal(hash(website), before);
    });
    for (const field of ["hero.supportingCopy", "story.body", "flavor.narrative"]) await check("SET/CLEAR " + field, async () => {
      const text = "  HTTP café e\u0301 😀\n第二行  ", body = payload(field, text);
      const result = await responseBody(await invoke(request(body)), 200);
      assert.equal(serviceCalls, 1); assert.equal(cookieReads, 1);
      assert.equal(result.requestId, body.requestId); assert.equal(result.worksRevision, 1);
      assert.deepEqual(Object.keys(result).sort(), ["changedFields", "editToken", "ok", "outcome", "ownerModel", "requestId", "worksRevision"].sort());
      assert.equal(result.ok, true); assert.equal(result.outcome, "SAVED");
      assert.equal(result.ownerModel.fields.length, 52); assert.equal(result.ownerModel.sections.length, 10);
      assert.equal(Object.hasOwn(result.ownerModel, "worksPage"), false); assert.equal(Object.hasOwn(result.ownerModel, "menu"), false);
      assert.deepEqual(result.changedFields, [field]); assert.equal(product().worksPage.fields[field].value, text);
      const clear = await responseBody(await invoke(request(payload(field, ""))), 200);
      assert.equal(clear.worksRevision, 2); assert.equal(product().worksPage.fields[field].value, "");
      const id = field === "hero.supportingCopy" ? "content.hero" : field === "story.body" ? "content.story" : "content.flavor";
      assert.equal(clear.ownerModel.fields.find((f: Data) => f.id === id).value, "");
    });
    await check("requestId correlation only; stale retry is conflict, not replay", async () => {
      const body = payload(), first = await responseBody(await invoke(request(body)), 200);
      const before = hash(website);
      await responseBody(await invoke(request(body)), 409, "REVISION_CONFLICT");
      assert.equal(hash(website), before);
      const again = payload(); again.requestId = body.requestId;
      const noChange = await responseBody(await invoke(request(again)), 200);
      assert.equal(noChange.outcome, "NO_CHANGE"); assert.equal(noChange.requestId, body.requestId);
      assert.equal(noChange.worksRevision, first.worksRevision); assert.equal(hash(website), before);
      assert.ok(!fs.readFileSync(website, "utf8").includes(body.requestId));
    });
    await check("malformed TEMP source fails safely without overwrite", async () => {
      const body = payload(); fs.writeFileSync(website, "{broken");
      await responseBody(await invoke(request(body)), 500, "INTERNAL_ERROR");
      assert.equal(fs.readFileSync(website, "utf8"), "{broken");
    });
    await check("pre-commit persistence failure remains safe", async () => {
      const body = payload(), before = hash(website); renameFault = true;
      const result = await responseBody(await invoke(request(body)), 500, "PERSISTENCE_FAILED");
      assert.equal(result.error.commitState, "NOT_COMMITTED"); assert.equal(hash(website), before);
    });
    await check("post-commit unlock failure retains COMMITTED classification", async () => {
      unlockFault = true;
      const result = await responseBody(await invoke(request(payload())), 500, "PERSISTENCE_FAILED");
      assert.equal(result.error.commitState, "COMMITTED"); assert.equal(product().worksPage.revision, 1);
    });
    await check("unexpected service exception is generic and not definitely unsaved", async () => {
      serviceFault = true;
      const result = await responseBody(await invoke(request()), 500, "INTERNAL_ERROR");
      assert.equal(Object.hasOwn(result.error, "commitState"), false);
    });
    await check("unexpected cookie exception stays generic", async () => {
      cookieFault = true;
      await responseBody(await invoke(request()), 500, "INTERNAL_ERROR");
      assert.equal(serviceCalls, 0); assert.equal(io, 0);
    });
    await check("POST-only exports; no GET writer", () => {
      assert.deepEqual(Object.keys(route).sort(), ["POST", "dynamic", "runtime"]);
      assert.equal(typeof route.POST, "function"); assert.equal("GET" in route, false); assert.equal(io, 0);
    });
    await check("no network / real data mutation", () => {
      assert.equal(network, 0); assert.deepEqual(fingerprints(), beforeReal);
    });
  } finally {
    unlockFault = false; globalThis.fetch = savedFetch;
    if (fs.existsSync(website + ".lock")) fs.unlinkSync(website + ".lock");
    assert.deepEqual(fingerprints(), beforeReal, "REAL DATA CHANGED");
  }
  console.log("W3.4C TRANSPORT: " + pass + " PASS / " + fail + " FAIL");
  console.log("EXTERNAL NETWORK CALLS: " + network);
  process.exitCode = fail ? 1 : 0;
}
