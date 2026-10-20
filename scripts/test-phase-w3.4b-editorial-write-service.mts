import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import * as util from "node:util";
import * as asyncHooks from "node:async_hooks";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { WorksEditorialWriteResult } from "../lib/worksArtworkEditorialWriteService.ts";

const project = fileURLToPath(new URL("../", import.meta.url));
const self = fileURLToPath(import.meta.url);
const realFile = path.join(project, "public/data/website-data.json");
const ownerFile = path.join(project, "public/data/homepage.json");
const expectedReal = "77b44042e32ef589c6c08a2c5a2589b15bc89d97e97542b11b0dd9769c18ad93";
const expectedOwner = "dbd97d72fd30bb548fff461084c3b497ec877e169d1f728c1fa408a92128cfac";
const hash = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function realFingerprints() {
  const entries: Array<[string, string]> = [];
  function visit(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name.endsWith(".json")) entries.push([path.relative(project, file), hash(file)]);
    }
  }
  visit(path.join(project, "data")); visit(path.join(project, "public/data"));
  return entries.sort((a, b) => a[0].localeCompare(b[0]));
}
function within(root: string, file: string) {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return relative !== "" && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}
const beforeReal = realFingerprints();
assert.equal(hash(realFile), expectedReal, "Real fixture fingerprint differs: abort");
assert.equal(hash(ownerFile), expectedOwner, "Owner fingerprint differs: abort");

if (!process.argv.includes("--temp-worker")) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "KD_Coffee_W3.4B_"));
  assert.ok(within(os.tmpdir(), temporary));
  assert.ok(!within(project, temporary));
  const fixture = path.join(temporary, "store/website-data.json");
  assert.ok(within(temporary, fixture));
  let status = 1;
  try {
    fs.mkdirSync(path.dirname(fixture), { recursive: true });
    fs.copyFileSync(realFile, fixture);
    const env: NodeJS.ProcessEnv = { ...process.env, KD_DATA_DIR: temporary, W34B_TEST_ROOT: temporary, GIT_OPTIONAL_LOCKS: "0" };
    delete env.RAILWAY_VOLUME_MOUNT_PATH;
    delete env.GIT_INDEX_FILE;
    const worker = spawnSync(process.execPath, ["--experimental-strip-types", self, "--temp-worker"], {
      cwd: project, env, stdio: "inherit", timeout: 180000,
    });
    status = worker.status ?? 1;
    if (worker.error) console.error("Focused worker did not complete normally.");
  } finally {
    // Verify real data before cleanup or reporting ANY success.
    assert.deepEqual(realFingerprints(), beforeReal, "REAL DATA CHANGED: STOP");
    // Resolve and check the recursive cleanup target entirely in this process.
    const cleanup = fs.realpathSync(temporary);
    assert.ok(within(fs.realpathSync(os.tmpdir()), cleanup));
    assert.ok(path.basename(cleanup).startsWith("KD_Coffee_W3.4B_"));
    assert.ok(!within(project, cleanup));
    fs.rmSync(cleanup, { recursive: true, force: true });
  }
  console.log("REAL DATA: website/homepage/protected JSON fingerprints unchanged.");
  process.exitCode = status;
} else {
  // Env is already isolated by the parent BEFORE any application module loads.
  const temporary = process.env.W34B_TEST_ROOT!;
  assert.ok(temporary && within(os.tmpdir(), temporary));
  assert.equal(process.env.KD_DATA_DIR, temporary);
  assert.equal(process.env.RAILWAY_VOLUME_MOUNT_PATH, undefined);
  const initial = fs.readFileSync(path.join(temporary, "store/website-data.json"));
  assert.equal(crypto.createHash("sha256").update(initial).digest("hex"), expectedReal);
  const canonical = JSON.parse(initial.toString("utf8"));
  const products = canonical.menu.products as Array<Record<string, any>>;
  assert.equal(products.length, 25);
  const target = "giotto-awakening";
  assert.ok(products.some(p => p.slug === target));
  const other = products.find(p => p.slug !== target)!.slug as string;
  const keys = ["hero.supportingCopy", "story.body", "flavor.narrative"] as const;
  const ids = { "hero.supportingCopy": "content.hero", "story.body": "content.story", "flavor.narrative": "content.flavor" };
  type Data = Record<string, any>;
  type Fault = "write" | "sync" | "rename" | "unlock" | undefined;
  let fault: Fault, network = 0;
  let io = { reads: [] as boolean[], tempOpens: 0, tempWrites: 0, renames: 0, commits: 0 };
  let website = "";
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async () => { network++; throw Error("Network forbidden in focused tests"); };
  function guard(file: unknown): asserts file is string {
    assert.equal(typeof file, "string");
    assert.ok(within(temporary, file as string), "Application IO escaped TEMP");
  }
  function injected(): never {
    throw Object.assign(new Error("PRIVATE_FAULT_MARKER"), { code: "EACCES" });
  }
  // Loader-bound filesystem facade delegates to REAL temp filesystem + REAL
  // production jsonFileStore/lock protocol. It is not an in-memory store/writer.
  // Only fault points and access guards are substituted, never business results.
  const safeFs = {
    async readFile(file: string, ...args: any[]) {
      guard(file);
      if (file === website) io.reads.push(fs.existsSync(website + ".lock"));
      return (fsp.readFile as any)(file, ...args);
    },
    async open(file: string, ...args: any[]) {
      guard(file);
      const handle = await (fsp.open as any)(file, ...args);
      const temp = path.basename(file).endsWith(".tmp");
      if (temp) io.tempOpens++;
      return new Proxy(handle, { get(object, name) {
        if (name === "writeFile") return async (...values: any[]) => {
          if (temp) { io.tempWrites++; if (fault === "write") injected(); }
          return object.writeFile(...values);
        };
        if (name === "sync") return async () => {
          if (temp && fault === "sync") injected();
          return object.sync();
        };
        const value = Reflect.get(object, name, object);
        return typeof value === "function" ? value.bind(object) : value;
      } });
    },
    async rename(from: string, to: string) {
      guard(from); guard(to); io.renames++;
      if (fault === "rename") injected();
      await fsp.rename(from, to); io.commits++;
    },
    async unlink(file: string) {
      guard(file);
      if (fault === "unlock" && file === website + ".lock") injected();
      await fsp.unlink(file);
    },
  };
  const allowed = new Set([
    "worksArtworkEditorialWriteService", "worksArtworkOwnerReadService", "worksArtworkOwnerProjection",
    "worksArtworkFieldRegistry", "worksArtworkReadModel", "worksArtworkSourceTrace",
    "worksArtworkContract", "worksArtworkValidation", "worksArtworkResolver", "worksArtworkWriteModel",
    "productPageContent", "productPageContentValidation", "productPageSections",
    "productVisualAssets", "cleanRoastingMedia", "media", "productListing",
    "storagePaths", "jsonFileStore", "commerceLockProtocol",
  ].map(n => "lib/" + n + ".ts"));
  function runtime(legacy = false) {
    const cache = new Map<string, { exports: any }>();
    function load(id: string): any {
      assert.ok(allowed.has(id), "Unreviewed application dependency: " + id);
      if (cache.has(id)) return cache.get(id)!.exports;
      const source = legacy && id === "lib/productPageContent.ts"
        ? execFileSync("git", ["--no-optional-locks", "show", "11f862c2abcd64650452b036138918b2093252f7:" + id], { cwd: project, encoding: "utf8" })
        : fs.readFileSync(path.join(project, id), "utf8");
      const code = ts.transpileModule(source, { fileName: id, compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
      } }).outputText;
      const module = { exports: {} }; cache.set(id, module);
      new Function("require", "module", "exports", code)((spec: string) => {
        if (spec === "server-only") return {};
        if (spec === "crypto" || spec === "node:crypto") return crypto;
        if (spec === "path" || spec === "node:path") return path;
        if (spec === "node:util") return util;
        if (spec === "node:async_hooks") return asyncHooks;
        if (spec === "node:fs/promises") return safeFs;
        if (spec === "fs") return { promises: safeFs };
        assert.ok(spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("@/"), "Forbidden runtime dependency");
        let resolved = spec.startsWith("@/") ? spec.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(id), spec));
        if (!resolved.endsWith(".ts")) resolved += ".ts";
        return load(resolved);
      }, module, module.exports);
      return module.exports;
    }
    return load;
  }

  const load = runtime();
  // HARD GATE: path proof BEFORE loading the writer.
  website = load("lib/storagePaths.ts").getWebsiteDataFile();
  guard(website);
  assert.equal(path.resolve(website), path.resolve(temporary, "store/website-data.json"));
  assert.notEqual(path.resolve(website).toLowerCase(), path.resolve(realFile).toLowerCase());
  assert.ok(!within(path.join(project, "public/data"), website));
  assert.ok(!path.resolve(website).replaceAll("\\", "/").match(/^\/data(?:\/|$)/i));
  console.log("TEMP ROOT: " + temporary);
  console.log("RESOLVED WEBSITE: " + website);
  console.log("PATH GUARD: PASS; isolated child env before application imports.");
  const engine = load("lib/worksArtworkEditorialWriteService.ts") as typeof import("../lib/worksArtworkEditorialWriteService.ts");
  const read = load("lib/worksArtworkOwnerReadService.ts") as typeof import("../lib/worksArtworkOwnerReadService.ts");
  const content = load("lib/productPageContent.ts") as typeof import("../lib/productPageContent.ts");
  const store = load("lib/jsonFileStore.ts") as typeof import("../lib/jsonFileStore.ts");
  const projection = load("lib/worksArtworkOwnerProjection.ts") as typeof import("../lib/worksArtworkOwnerProjection.ts");
  const oldContent = runtime(true)("lib/productPageContent.ts") as typeof import("../lib/productPageContent.ts");
  const counts: Record<string, { pass: number; fail: number }> = {};
  async function test(group: string, name: string, run: () => unknown | Promise<unknown>) {
    counts[group] ??= { pass: 0, fail: 0 };
    try { await run(); counts[group].pass++; }
    catch (error) {
      counts[group].fail++;
      console.error("FAIL " + group + ": " + name + ": " + (error instanceof Error ? error.message.split("\n")[0] : "assertion"));
    }
  }
  function reset(edit?: (data: Data) => void) {
    fault = undefined;
    if (fs.existsSync(website + ".lock")) throw Error("Unexpected leftover lock");
    const data = JSON.parse(initial.toString("utf8")); if (edit) edit(data);
    fs.writeFileSync(website, edit ? JSON.stringify(data, null, 2) + "\n" : initial);
    io = { reads: [], tempOpens: 0, tempWrites: 0, renames: 0, commits: 0 };
    return data;
  }
  const disk = (): Data => JSON.parse(fs.readFileSync(website, "utf8"));
  const product = (data: Data = disk(), slug = target): Data => data.menu.products.find((p: Data) => p.slug === slug);
  const prep = (p: Data = product()) => read.getWorksArtworkWritePreparation(p);
  let sequence = 0;
  function command(values: Array<[string, unknown]>, slug = target, pair = prep(product(disk(), slug))): Data {
    return { targetRef: slug, contractVersion: 1, expectedWorksRevision: pair.worksRevision,
      expectedEditToken: pair.editToken, requestId: "focused-request-" + (++sequence),
      operations: values.map(([field, value]) => ({ scope: "updateEditorialContent", field, state: { mode: "value", value } })) };
  }
  const send = (c: Data, slug: unknown = c.targetRef) => engine.writeWorksArtworkEditorialCommand(slug, c);
  function good(result: WorksEditorialWriteResult) {
    assert.ok(result.ok, result.ok ? "" : result.error.code);
    if (!result.ok) throw Error("Write failed");
    return result;
  }
  function field(model: any, id: string): any { const found = model.fields.find((f: any) => f.id === id); assert.ok(found); return found; }
  async function rejected(c: Data, code?: string, slug: unknown = c.targetRef) {
    const before = hash(website), commits = io.commits;
    const result = await send(c, slug);
    assert.equal(result.ok, false);
    if (result.ok) throw Error("Unexpected acceptance");
    if (code) assert.equal(result.error.code, code);
    assert.equal(result.error.commitState, "NOT_COMMITTED");
    assert.deepEqual(Object.keys(result).sort(), ["error", "ok"]);
    assert.ok(!JSON.stringify(result).includes("PRIVATE_FAULT_MARKER"));
    assert.ok(!JSON.stringify(result).includes(project));
    assert.equal(hash(website), before); assert.equal(io.commits, commits);
    return result;
  }
  function firewall(before: Data, after: Data, slug = target) {
    const expected = structuredClone(before);
    product(expected, slug).worksPage = product(after, slug).worksPage;
    expected.version = after.version; expected.updatedAt = after.updatedAt;
    assert.deepEqual(after, expected, "Canonical data escaped permitted Works/root metadata changes");
    const prior = { ...product(before, slug) }, next = { ...product(after, slug) };
    delete prior.worksPage; delete next.worksPage; assert.deepEqual(next, prior);
  }
  function state(fields: Data, revision = 1) { return { contractVersion: 1, revision, fields }; }

  try {
    for (const p of products) await test("Legacy", String(p.slug), () => {
      assert.equal(Object.hasOwn(p, "worksPage"), false);
      assert.deepEqual(content.resolveWorksProductPageContent(p), oldContent.resolveProductPageContent(p));
    });
    await test("Legacy", "Giotto explicit equality and flavor visibility", () => {
      const p = product(canonical), before = oldContent.resolveProductPageContent(p), after = content.resolveWorksProductPageContent(p);
      assert.deepEqual(after["product-hero"], before["product-hero"]);
      assert.deepEqual(after["flavor-notes"], before["flavor-notes"]);
    });
    for (const key of keys) {
      await test("SET/CLEAR", key + " SET Unicode exact sparse", async () => {
        const before = reset(); const value = "  新作品 café e\u0301 ☕😀\n第二行\r\n保留換行  ";
        const result = good(await send(command([[key, value]])));
        assert.equal(result.outcome, "SAVED"); assert.equal(result.worksRevision, 1);
        assert.deepEqual(result.changedFields, [key]);
        const after = disk(), p = product(after);
        assert.deepEqual(p.worksPage, state({ [key]: { mode: "value", value } }));
        firewall(before, after); assert.equal(io.commits, 1);
        assert.ok(io.reads.length > 0 && io.reads.every(Boolean), "Canonical read occurred outside file lock");
        assert.equal(field(result.ownerModel, ids[key]).value, value);
        assert.equal(field(result.ownerModel, ids[key]).source.connected, true);
        const fresh = await read.readWorksArtworkOwnerModel(target);
        assert.ok(fresh.ok); if (fresh.ok) assert.equal(field(fresh.data, ids[key]).value, value);
        const resolved = content.resolveWorksProductPageContent(p);
        const observed = key === keys[0] ? resolved["product-hero"].lead : key === keys[1] ? resolved["product-hero"].storyLead : resolved["flavor-notes"].description;
        assert.equal(observed, value);
      });
      await test("SET/CLEAR", key + " CLEAR after SET", async () => {
        reset(); good(await send(command([[key, "Custom first"]])));
        const result = good(await send(command([[key, ""]])));
        assert.equal(result.worksRevision, 2);
        assert.deepEqual(product().worksPage.fields[key], { mode: "value", value: "" });
        assert.equal(field(result.ownerModel, ids[key]).value, "");
        const c = content.resolveWorksProductPageContent(product());
        assert.equal(key === keys[0] ? c["product-hero"].lead : key === keys[1] ? c["product-hero"].storyLead : c["flavor-notes"].description, "");
      });
    }
    await test("Sparse/no-op", "Story first save leaves Hero/flavor/supplement and Product unchanged", async () => {
      const before = reset(), legacy = content.resolveProductPageContent(product(before));
      good(await send(command([["story.body", "Only story"]])));
      const p = product(), resolved = content.resolveWorksProductPageContent(p);
      assert.deepEqual(Object.keys(p.worksPage.fields), ["story.body"]);
      assert.equal(resolved["product-hero"].lead, legacy["product-hero"].lead);
      assert.equal(resolved["product-hero"].storySupportingCopy, legacy["product-hero"].storySupportingCopy);
      assert.deepEqual(resolved["flavor-notes"], legacy["flavor-notes"]); firewall(before, disk());
    });
    await test("Sparse/no-op", "same-as-legacy is a real explicit write", async () => {
      reset(); const value = content.resolveProductPageContent(product())["product-hero"].storyLead;
      const result = good(await send(command([["story.body", value]])));
      assert.equal(result.outcome, "SAVED"); assert.equal(result.worksRevision, 1); assert.equal(io.commits, 1);
      assert.equal(product().worksPage.fields["story.body"].value, value);
    });
    await test("Sparse/no-op", "identical state has zero persistence or metadata churn", async () => {
      reset(); good(await send(command([["story.body", "ABC"]])));
      const before = fs.readFileSync(website), metadata = disk(), commits = io.commits, opens = io.tempOpens;
      const result = good(await send(command([["story.body", "ABC"]])));
      assert.equal(result.outcome, "NO_CHANGE"); assert.equal(result.worksRevision, 1);
      assert.deepEqual(result.changedFields, []); assert.deepEqual(fs.readFileSync(website), before);
      assert.equal(io.commits, commits); assert.equal(io.tempOpens, opens);
      assert.equal(disk().version, metadata.version); assert.equal(disk().updatedAt, metadata.updatedAt);
    });
    await test("Sparse/no-op", "unrelated valid Works states preserved", async () => {
      reset(d => { product(d).worksPage = state({ "presentation.visible": { mode: "value", value: false }, "story.heading": { mode: "inherit" } }, 7); });
      const before = product().worksPage;
      good(await send(command([["story.body", "New story"]])));
      assert.deepEqual(product().worksPage.fields["presentation.visible"], before.fields["presentation.visible"]);
      assert.deepEqual(product().worksPage.fields["story.heading"], before.fields["story.heading"]);
      assert.equal(product().worksPage.revision, 8);
    });
    await test("Revision", "0 -> 1 -> 2; GET has zero writes", async () => {
      reset(); assert.equal(prep().worksRevision, 0);
      assert.equal(good(await send(command([["story.body", "One"]]))).worksRevision, 1);
      assert.equal(good(await send(command([["story.body", "Two"]]))).worksRevision, 2);
      const before = hash(website), commits = io.commits;
      const fresh = await read.readWorksArtworkOwnerModel(target);
      assert.ok(fresh.ok); if (fresh.ok) assert.equal(fresh.data.writePreparation?.worksRevision, 2);
      assert.equal(hash(website), before); assert.equal(io.commits, commits);
    });
    for (const revision of [-1, 1.5, null, Number.MAX_SAFE_INTEGER + 1]) await test("Revision", "invalid revision " + String(revision), async () => {
      reset(d => { product(d).worksPage = state({}, revision as number); });
      const c = command([["story.body", "Bad revision"]], target, { worksRevision: 0, editToken: "placeholder" });
      await rejected(c);
    });
    await test("Revision", "safe maximum rejects change but allows identical no-op", async () => {
      reset(d => { product(d).worksPage = state({ "story.body": { mode: "value", value: "ABC" } }, Number.MAX_SAFE_INTEGER); });
      await rejected(command([["story.body", "Different"]]), "VALIDATION_FAILED");
      const result = good(await send(command([["story.body", "ABC"]])));
      assert.equal(result.outcome, "NO_CHANGE"); assert.equal(result.worksRevision, Number.MAX_SAFE_INTEGER);
    });

    await test("Token", "deterministic prefix + object ordering", () => {
      const p = product(canonical);
      assert.match(prep(p).editToken, /^w3e1\.[a-f0-9]{64}$/);
      const reversed = Object.fromEntries(Object.entries(p).reverse());
      assert.equal(prep(p).editToken, prep(reversed).editToken);
      const a = { ...p, worksPage: state({ "story.body": { mode: "value", value: "ABC" }, "hero.supportingCopy": { mode: "value", value: "Intro" } }) };
      const b = { ...p, worksPage: { fields: { "hero.supportingCopy": { value: "Intro", mode: "value" }, "story.body": { value: "ABC", mode: "value" } }, revision: 1, contractVersion: 1 } };
      assert.equal(prep(a).editToken, prep(b).editToken);
    });
    for (const key of keys) await test("Token", "missing/empty/value " + key, () => {
      const p = product(canonical);
      const tokens = [prep(p).editToken, prep({ ...p, worksPage: state({ [key]: { mode: "value", value: "" } }) }).editToken,
        prep({ ...p, worksPage: state({ [key]: { mode: "value", value: "Value" } }) }).editToken];
      assert.equal(new Set(tokens).size, 3);
    });
    for (const key of ["shortCopy", "mood", "subtitle"]) await test("Token", "legacy dependency " + key, () => {
      const p = product(canonical); assert.notEqual(prep(p).editToken, prep({ ...p, [key]: "Changed dependency" }).editToken);
    });
    await test("Token", "flavor normalized value and whole-content validity", () => {
      const p = { ...product(canonical), productPageContent: { "flavor-notes": { description: "Apple" } } };
      const token = prep(p).editToken;
      assert.notEqual(token, prep({ ...p, productPageContent: { "flavor-notes": { description: "Berry" } } }).editToken);
      assert.equal(token, prep({ ...p, productPageContent: { "flavor-notes": { description: "  Apple  " } } }).editToken);
      const invalid = { ...p, productPageContent: { ...p.productPageContent, "clean-roasting": { proofs: "invalid" } } };
      assert.notEqual(token, prep(invalid).editToken);
      assert.equal(content.resolveProductPageContent(invalid)["flavor-notes"].description, "");
    });
    await test("Token", "validity bit independent from unchanged empty flavor text", () => {
      const p = { ...product(canonical), productPageContent: {} };
      const invalid = { ...p, productPageContent: { "clean-roasting": { proofs: "invalid" } } };
      assert.equal(content.resolveProductPageContent(p)["flavor-notes"].description, "");
      assert.equal(content.resolveProductPageContent(invalid)["flavor-notes"].description, "");
      assert.notEqual(prep(p).editToken, prep(invalid).editToken);
      const anotherInvalid = { ...p, productPageContent: { "before-you-order": { editorialFaqs: "invalid" } } };
      assert.equal(prep(invalid).editToken, prep(anotherInvalid).editToken);
    });
    const exclusions: Array<[string, (p: Data) => void]> = [
      ["layout", p => { p.pageLayout = { showGallery: false }; }],
      ["gallery/media", p => { p.assets = { gallery: { path: "/uploads/unrelated.webp" } }; }],
      ["animation", p => { p.productPageAnimations = { enabled: false }; }],
      ["relations", p => { p.relatedProducts = { productIds: [] }; }],
      ["SEO", p => { p.seo = { title: "Unrelated" }; }],
      ["price/stock", p => { p.price = 321; p.stock = 999; }],
      ["SKU", p => { p.skus = [{ id: "temp-only", price: 321, stock: 999 }]; }],
      ["flavor tags", p => { p.flavors = ["Changed tag"]; }],
      ["valid unrelated page copy", p => { p.productPageContent = { ...p.productPageContent, campaigns: { heading: "Unrelated" } }; }],
      ["future Works field", p => { p.worksPage = state({ "story.heading": { mode: "value", value: "Future" } }, 8); }],
      ["future presentation", p => { p.worksPage = state({ "presentation.visible": { mode: "value", value: false } }, 9); }],
      ["future animation", p => { p.worksPage = state({ "animation.enabled": { mode: "value", value: false } }, 10); }],
      ["future SEO", p => { p.worksPage = state({ "search.title": { mode: "value", value: "Future" } }, 11); }],
      ["future media", p => { p.worksPage = state({ "hero.media": { mode: "value", value: null } }, 12); }],
    ];
    for (const [name, mutate] of exclusions) await test("Token exclusions", name, () => {
      const p = structuredClone(product(canonical)); const token = prep(p).editToken;
      mutate(p); assert.equal(prep(p).editToken, token);
    });
    await test("Concurrency", "stale revision", async () => {
      reset(); const c = command([["story.body", "First"]]);
      good(await send(c));
      const stale = command([["story.body", "Second"]]); stale.expectedWorksRevision = 0;
      await rejected(stale, "REVISION_CONFLICT"); assert.equal(product().worksPage.fields["story.body"].value, "First");
    });
    for (const key of ["shortCopy", "mood", "flavor"]) await test("Concurrency", "Product fallback stale token " + key, async () => {
      reset(); const c = command([["story.body", "Stale"]]);
      const d = disk();
      if (key === "flavor") product(d).productPageContent = { "flavor-notes": { description: "New flavor" } };
      else product(d)[key] = "Changed by Product editor";
      fs.writeFileSync(website, JSON.stringify(d)); await rejected(c, "REVISION_CONFLICT");
      assert.equal(Object.hasOwn(product(), "worksPage"), false);
    });
    await test("Concurrency", "two editors same pair", async () => {
      reset(); const pair = prep();
      const a = command([["story.body", "Editor A"]], target, pair), b = command([["story.body", "Editor B"]], target, pair);
      good(await send(a)); await rejected(b, "REVISION_CONFLICT");
      assert.equal(product().worksPage.fields["story.body"].value, "Editor A");
    });
    await test("Concurrency", "actual concurrent same-artwork race", async () => {
      reset(); const a = command([["story.body", "Race A"]]), b = command([["story.body", "Race B"]]);
      const results = await Promise.all([send(a), send(b)]);
      assert.equal(results.filter(r => r.ok).length, 1);
      assert.equal(results.filter(r => !r.ok && r.error.code === "REVISION_CONFLICT").length, 1);
      assert.equal(product().worksPage.revision, 1); assert.equal(io.commits, 1);
    });
    await test("Concurrency", "two Products share actual lock and reread", async () => {
      reset(); const a = command([["story.body", "Product A"]]), b = command([["story.body", "Product B"]], other);
      const results = await Promise.all([send(a), send(b)]); results.forEach(good);
      assert.equal(product().worksPage.fields["story.body"].value, "Product A");
      assert.equal(product(disk(), other).worksPage.fields["story.body"].value, "Product B");
      assert.equal(io.commits, 2); assert.ok(io.reads.every(Boolean));
    });
    for (const key of keys) await test("Final-state", "unmodified inherit rejected " + key, async () => {
      reset(d => { product(d).worksPage = state({ [key]: { mode: "inherit" } }); });
      const requested = key === "story.body" ? "hero.supportingCopy" : "story.body";
      await rejected(command([[requested, "Must not persist"]]), "VALIDATION_FAILED");
      assert.deepEqual(product().worksPage.fields[key], { mode: "inherit" });
    });
    for (const [name, value] of [["null", null], ["bad text", { mode: "value", value: false }], ["unknown mode", { mode: "future" }]] as const) await test("Final-state", "malformed untouched field " + name, async () => {
      reset(d => { product(d).worksPage = state({ "flavor.narrative": value }); });
      await rejected(command([["story.body", "No commit"]], target, { worksRevision: 1, editToken: "placeholder" }));
    });
    await test("Final-state", "NO_CHANGE cannot bypass another unsupported state", async () => {
      reset(d => { product(d).worksPage = state({ "story.body": { mode: "value", value: "ABC" }, "hero.supportingCopy": { mode: "inherit" } }); });
      await rejected(command([["story.body", "ABC"]]), "VALIDATION_FAILED");
    });

    await test("Isolation/metadata", "Product resolver stays legacy, public opt-in gets three overrides", () => {
      const p = structuredClone(product(canonical));
      const legacy = oldContent.resolveProductPageContent(p);
      p.worksPage = state(Object.fromEntries(keys.map(k => [k, { mode: "value", value: "Works " + k }])));
      assert.deepEqual(content.resolveProductPageContent(p), legacy);
      const current = content.resolveWorksProductPageContent(p);
      assert.equal(current["product-hero"].lead, "Works hero.supportingCopy");
      assert.equal(current["product-hero"].storyLead, "Works story.body");
      assert.equal(current["flavor-notes"].description, "Works flavor.narrative");
      assert.equal(current["product-hero"].storySupportingCopy, legacy["product-hero"].storySupportingCopy);
    });
    await test("Isolation/metadata", "suppressed flavor stays suppressed despite override", () => {
      const p = { ...product(canonical), flavors: [], worksPage: state({ "flavor.narrative": { mode: "value", value: "Hidden narrative" } }) };
      const r = read.projectCurrentWorksArtworkOwner(p, [p]); assert.ok(r.ok); if (!r.ok) return;
      const f = field(r.value, "content.flavor");
      assert.equal(f.value, "Hidden narrative"); assert.equal(f.source.connected, true);
      assert.equal(f.display.visibility, "suppressed");
      assert.equal(content.resolveWorksProductPageContent(p)["flavor-notes"].flavors.length, 0);
      assert.equal(r.value.publicStates.detailPage.state, "UNKNOWN");
    });
    await test("Isolation/metadata", "invalid/unknown visibility evidence not upgraded", () => {
      const p = { ...product(canonical), productPageContent: { "flavor-notes": { description: "/private/internal-path" } },
        worksPage: state({ "flavor.narrative": { mode: "value", value: "Valid Works value" } }) };
      const r = read.projectCurrentWorksArtworkOwner(p, [p]); assert.ok(r.ok); if (!r.ok) return;
      const f = field(r.value, "content.flavor");
      assert.equal(f.value, "Valid Works value"); assert.equal(f.state, "invalid"); assert.ok(f.warning);
      assert.equal(f.display.visibility, "unknown"); assert.equal(f.source.connected, true);
    });
    await test("Isolation/metadata", "unknown and empty display remains unchanged", () => {
      const p = { ...product(canonical), shortCopy: "", subtitle: "", worksPage: state({ "hero.supportingCopy": { mode: "value", value: "New hero" } }) };
      const baseline = projection.projectWorksArtworkOwner({ product: p, catalog: [p] });
      const current = read.projectCurrentWorksArtworkOwner(p, [p]);
      assert.ok(baseline.ok && current.ok); if (!baseline.ok || !current.ok) return;
      assert.deepEqual(field(current.value, "content.hero").display, field(baseline.value, "content.hero").display);
      assert.equal(current.value.publicStates.detailPage.state, "UNKNOWN");
    });
    await test("Isolation/metadata", "connected namespace only lists actual three-field overrides", () => {
      const p = { ...product(canonical), worksPage: state({ "story.body": { mode: "value", value: "Bound" }, "story.heading": { mode: "value", value: "Future" } }) };
      const r = read.projectCurrentWorksArtworkOwner(p, [p]); assert.ok(r.ok); if (!r.ok) return;
      assert.equal(r.value.systemInfo.namespace, "WORKS_CONNECTED");
      assert.deepEqual(r.value.systemInfo.connectedFieldIds, ["story.body"]);
      assert.equal(r.value.futureCandidates.find(f => f.id === "content.heading")?.source.binding, "FUTURE_CANDIDATE");
    });
    await test("Isolation/metadata", "future-only namespace remains candidate", () => {
      const p = { ...product(canonical), worksPage: state({ "story.heading": { mode: "value", value: "Future" } }) };
      const r = read.projectCurrentWorksArtworkOwner(p, [p]); assert.ok(r.ok); if (!r.ok) return;
      assert.equal(r.value.systemInfo.namespace, "WORKS_CANDIDATE"); assert.equal(r.value.systemInfo.connectedFieldIds, undefined);
    });

    for (const key of keys) {
      for (const [name, value] of [["normal", "Normal"], ["emoji", "😀☕"], ["multiline exact", "  Cafe\u0301\nSecond\r\nThird\t  "], ["2000 ASCII", "a".repeat(2000)], ["2000 emoji", "😀".repeat(2000)], ["empty", ""]] as const) {
        await test("Text valid", key + " " + name, async () => {
          reset(); const result = good(await send(command([[key, value]])));
          assert.equal(product().worksPage.fields[key].value, value);
          assert.equal(field(result.ownerModel, ids[key]).value, value);
        });
      }
      for (const [name, value] of [
        ["2001", "a".repeat(2001)], ["whitespace", " \n\t "], ["false", false], ["zero", 0], ["null", null], ["array", []],
        ["object", {}], ["control", "A\u0001B"], ["DEL", "A\u007fB"], ["high surrogate", "A\ud800"], ["low surrogate", "A\udc00"], ["HTML", "<b>bad</b>"],
      ] as Array<[string, unknown]>) await test("Text invalid", key + " " + name, async () => {
        reset(); await rejected(command([[key, value]]));
      });
    }
    const badCommands: Array<[string, (c: Data) => void]> = [
      ["empty operations", c => { c.operations = []; }],
      ["duplicate field", c => { c.operations.push(structuredClone(c.operations[0])); }],
      ["unknown envelope", c => { c.extra = true; }],
      ["unknown operation", c => { c.operations[0].extra = true; }],
      ["version", c => { c.contractVersion = 2; }],
      ["unknown field", c => { c.operations[0].field = "unknown"; }],
      ["other Works", c => { c.operations[0].field = "story.heading"; }],
      ["inherit", c => { c.operations[0].state = { mode: "inherit" }; }],
      ["raw Product", c => { c.product = { name: "Attack" }; }],
      ["raw namespace", c => { c.worksPage = state({}); }],
      ["raw DTO", c => { c.ownerModel = { fields: [] }; }],
      ["property path", c => { c.operations[0].field = "menu.products[0].name"; }],
      ["state extra", c => { c.operations[0].state.extra = true; }],
      ["target mismatch", c => { c.targetRef = other; }],
    ];
    for (const [name, mutate] of badCommands) await test("Commands", name, async () => {
      reset(); const c = command([["story.body", "Attempt"]]); mutate(c); await rejected(c, undefined, target);
    });
    for (const ref of ["../private", "", "a/b"]) await test("Commands", "invalid reference " + ref, async () => {
      reset(); await rejected(command([["story.body", "Attempt"]]), "INVALID_REFERENCE", ref);
    });
    await test("Commands", "valid unknown slug", async () => {
      reset(); await rejected(command([["story.body", "Attempt"]], "missing-artwork", { worksRevision: 0, editToken: "placeholder" }), "ARTWORK_NOT_FOUND");
    });
    await test("Commands", "duplicate canonical slug", async () => {
      reset(d => { d.menu.products[1].slug = d.menu.products[0].slug; });
      await rejected(command([["story.body", "Attempt"]]), "INTERNAL_ERROR");
    });
    for (const key of ["name", "shortCopy", "mood", "subtitle", "flavors", "artist", "origin", "process", "roast", "SKU",
      "price", "stock", "inventory", "credit", "reward", "subscription", "purchase", "order", "fulfillment"]) {
      await test("Firewalls", key, async () => {
        const before = reset(); await rejected(command([[key, "Attack"]])); assert.deepEqual(disk(), before);
      });
    }
    await test("Atomic/persistence", "three-field success one commit/revision", async () => {
      const before = reset();
      const result = good(await send(command(keys.map(k => [k, "Together " + k]))));
      assert.equal(result.worksRevision, 1); assert.deepEqual(result.changedFields, [...keys]);
      assert.equal(io.commits, 1); assert.equal(io.tempWrites, 1); firewall(before, disk());
    });
    await test("Atomic/persistence", "second invalid operation leaves first untouched", async () => {
      reset(); await rejected(command([["story.body", "Must not persist"], ["flavor.narrative", false]]));
      assert.equal(Object.hasOwn(product(), "worksPage"), false); assert.equal(io.tempOpens, 0);
    });
    await test("Atomic/persistence", "malformed JSON preserved byte-for-byte", async () => {
      reset(); fs.writeFileSync(website, '{"broken":');
      await rejected(command([["story.body", "Never repair"]], target, { worksRevision: 0, editToken: "placeholder" }), "INTERNAL_ERROR");
      assert.equal(fs.readFileSync(website, "utf8"), '{"broken":');
    });
    for (const kind of ["write", "sync", "rename"] as const) await test("Atomic/persistence", "pre-commit " + kind + " failure", async () => {
      reset(); const c = command([["story.body", "Never partial"]]); fault = kind;
      try {
        const r = await rejected(c, "PERSISTENCE_FAILED"); assert.equal(r.error.commitState, "NOT_COMMITTED");
        assert.equal(io.commits, 0);
      } finally { fault = undefined; }
      assert.equal(fs.readdirSync(path.dirname(website)).some(n => n.endsWith(".tmp") || n.endsWith(".lock")), false);
    });
    await test("Atomic/persistence", "real held lock times out without writing", async () => {
      reset(); const c = command([["story.body", "Locked"]]);
      let release!: () => void, entered!: () => void;
      const signal = new Promise<void>(resolve => { entered = resolve; });
      const wait = new Promise<void>(resolve => { release = resolve; });
      const held = store.withFileLock(website, async () => { entered(); await wait; });
      await signal;
      const started = Date.now();
      try {
        await rejected(c, "PERSISTENCE_FAILED");
        assert.ok(Date.now() - started >= 4500 && Date.now() - started < 15000);
        assert.equal(io.commits, 0);
      } finally { release(); await held; }
      assert.equal(fs.existsSync(website + ".lock"), false);
    });
    await test("Atomic/persistence", "post-commit unlock error reports COMMITTED", async () => {
      reset(); fault = "unlock";
      try {
        const r = await send(command([["story.body", "Committed despite response failure"]]));
        assert.equal(r.ok, false); if (r.ok) throw Error("Expected classified failure");
        assert.equal(r.error.code, "PERSISTENCE_FAILED"); assert.equal(r.error.commitState, "COMMITTED");
        assert.equal(product().worksPage.fields["story.body"].value, "Committed despite response failure"); assert.equal(io.commits, 1);
      } finally {
        fault = undefined; if (fs.existsSync(website + ".lock")) fs.unlinkSync(website + ".lock");
      }
    });
    await test("Owner/read safety", "fresh sanitized 52-field/10-section model", async () => {
      reset(); const result = good(await send(command([["story.body", "Owner model"]])));
      const model = result.ownerModel;
      assert.equal(model.fields.length, 52); assert.equal(model.sections.length, 10);
      assert.equal(model.capability, "READ_ONLY"); assert.equal(model.contract, "DISPLAY_ONLY_NOT_WRITE_PAYLOAD");
      assert.equal(model.writePreparation?.worksRevision, result.worksRevision);
      assert.equal(model.writePreparation?.editToken, result.editToken);
      const current = await read.readWorksArtworkOwnerModel(target); assert.ok(current.ok);
      if (current.ok) assert.deepEqual(current.data, model);
      assert.equal(Object.hasOwn(result, "product"), false); assert.equal(Object.hasOwn(result, "worksPage"), false);
      assert.equal(Object.hasOwn(model, "menu"), false); assert.equal(Object.hasOwn(model, "worksPage"), false);
      assert.equal(model.commerceSummary.availability, "unknown"); assert.equal(model.commerceSummary.priceText, null);
      assert.ok(!JSON.stringify(result).includes(project)); assert.ok(!JSON.stringify(result).includes(temporary));
    });
    await test("Owner/read safety", "GET without namespace creates nothing", async () => {
      reset(); const before = hash(website);
      const current = await read.readWorksArtworkOwnerModel(target); assert.ok(current.ok);
      assert.equal(hash(website), before); assert.equal(Object.hasOwn(product(), "worksPage"), false);
      assert.equal(io.tempOpens, 0); assert.equal(io.commits, 0);
    });
    await test("Owner/read safety", "server boundary and no network", () => {
      assert.match(fs.readFileSync(path.join(project, "lib/worksArtworkEditorialWriteService.ts"), "utf8"), /import "server-only"/);
      assert.equal(network, 0);
      assert.ok([...allowed].every(id => !/line|email|membershipCommerce|fulfillment/i.test(id)));
    });
    await test("Owner/read safety", "real protected JSON set unchanged", () => { assert.deepEqual(realFingerprints(), beforeReal); });
  } finally {
    fault = undefined; globalThis.fetch = savedFetch;
    assert.deepEqual(realFingerprints(), beforeReal, "REAL DATA CHANGED: STOP");
  }
  let pass = 0, fail = 0;
  for (const [name, count] of Object.entries(counts)) {
    console.log(name + ": " + count.pass + " PASS / " + count.fail + " FAIL");
    pass += count.pass; fail += count.fail;
  }
  console.log("W3.4B FOCUSED: " + pass + " PASS / " + fail + " FAIL");
  console.log("EXTERNAL NETWORK CALLS: " + network);
  process.exitCode = fail ? 1 : 0;
}
