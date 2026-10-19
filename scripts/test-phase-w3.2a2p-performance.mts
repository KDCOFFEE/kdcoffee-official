import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { WorksOwnerProjectionInput } from "../lib/worksArtworkOwnerProjection.ts";
import type { WorksOwnerProjectionResult } from "../lib/worksArtworkReadModel.ts";

// This immutable checkpoint is the pre-optimization oracle. All compilation,
// fault injection and references stay in memory; --capture writes ONLY stdout.
const checkpoint = "b434b884f8d795b51b2bf981877ecfa046babefa";
const root = fileURLToPath(new URL("../", import.meta.url));
const allowed = new Set(["worksArtworkOwnerProjection","worksArtworkFieldRegistry","worksArtworkReadModel","worksArtworkResolver","worksArtworkSourceTrace","worksArtworkContract","worksArtworkValidation","productVisualAssets","productPageContent","productPageContentValidation","productPageSections","cleanRoastingMedia","media"].map(v => "lib/" + v + ".ts"));
type Fn = (...args: any[]) => any;
type Runtime = { project: (input: WorksOwnerProjectionInput) => WorksOwnerProjectionResult; trace: Record<string, Fn>; calls: number; safety: number; functional: number; traceMs: number; reset: () => void; loadMs: number };
function runtime(baseline: boolean): Runtime {
  const start = performance.now(), cache = new Map<string, { exports: any }>();
  function load(id: string): any {
    assert.ok(allowed.has(id), "unexpected dependency");
    if (cache.has(id)) return cache.get(id)!.exports;
    const source = baseline ? execFileSync("git", ["show", checkpoint + ":" + id], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) : readFileSync(path.join(root, id), "utf8");
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const mod = { exports: {} }; cache.set(id, mod);
    new Function("require","module","exports",code)((s: string) => {
      let target = s.startsWith("@/") ? s.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(id), s));
      if (!target.endsWith(".ts")) target += ".ts";
      return load(target);
    }, mod, mod.exports);
    return mod.exports;
  }
  const m = load("lib/worksArtworkOwnerProjection.ts"), trace = load("lib/worksArtworkSourceTrace.ts");
  const r: Runtime = { project: m.projectWorksArtworkOwner, trace, calls: 0, safety: 0, functional: 0, traceMs: 0, loadMs: performance.now() - start, reset() { r.calls = r.safety = r.functional = r.traceMs = 0; } };
  const original = trace.traceWorksArtwork;
  trace.traceWorksArtwork = (...args: any[]) => {
    r.calls++;
    const keys = Object.keys(args[0] ?? {});
    if (keys.length === 1 && ["mood","flavors"].includes(keys[0])) r.safety++; else r.functional++;
    const t = performance.now();
    try { return original(...args); } finally { r.traceMs += performance.now() - t; }
  };
  return r;
}
function freeze<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    for (const d of Object.values(Object.getOwnPropertyDescriptors(v))) if (Object.hasOwn(d, "value")) freeze(d.value);
    Object.freeze(v);
  }
  return v;
}
type Fixture = { name: string; input: WorksOwnerProjectionInput; fault?: "gallery" | "malformed" | "exception" | "unknown" | "candidate" };
const base = { name: "Artwork", nameEn: "Art", artist: "Artist", id: "art-1", sku: "art-sku", slug: "self", tag: "Tag", origin: "Origin", process: "Washed", roast: "Light", variety: "Bourbon", altitude: "1800m", flavors: ["Floral"], shortCopy: "Intro", subtitle: "Sub", mood: "Story" };
const image = (n: string) => ({ path: "/uploads/" + n + ".webp" });
const catalog = [{ slug: "self", name: "Self", inMonthlyMenu: true }, { slug: "off", name: "Off", active: false, inMonthlyMenu: true }, { slug: "a", name: "A", inMonthlyMenu: true }, { slug: "hidden", name: "Hidden", status: "hidden", inMonthlyMenu: true }, { slug: "b", name: "B", inMonthlyMenu: true }];
const galleryProduct = { ...base, pageLayout: { galleryAssets: ["fix1GalleryOnly"] }, assets: { hero: image("hero"), productPhoto: image("product"), artworkCover: image("cover"), fix1GalleryOnly: { ...image("gallery"), caption: "FIX1_GALLERY_OPTIONAL_SOURCE" } }, relatedProducts: { productIds: ["fix1-related"] } };
function synthetics(): Fixture[] {
  const fixtures: Fixture[] = [];
  const add = (name: string, product: unknown, extra: Partial<WorksOwnerProjectionInput> = {}, fault?: Fixture["fault"]) => fixtures.push({ name, input: freeze({ product, ...extra }), fault });
  add("story-mood", base); add("story-short", { ...base, mood: " " }); add("story-subtitle", { ...base, mood: "", shortCopy: "" });
  add("story-fixed", { ...base, mood: "", shortCopy: "", subtitle: "" }); add("supplement-suppressed", { ...base, mood: "same", shortCopy: "same" });
  add("beans-disabled", { ...base, showRoastedBeanPhoto: false, assets: { roastedBeanPhoto: { gallery: [image("bean")] } } });
  add("beans-empty", { ...base, showRoastedBeanPhoto: true, assets: { roastedBeanPhoto: { gallery: [] } } });
  add("beans-filtered", { ...base, showRoastedBeanPhoto: true, assets: { roastedBeanPhoto: { gallery: [null, {}] } } });
  add("manual-empty", { ...base, relatedProducts: { productIds: [] } }, { catalog });
  add("auto-legacy", base, { catalog }); add("invalid-reference", { ...base, relatedProducts: { productIds: ["missing", "hidden", "a"] } }, { catalog });
  add("seo-whitespace", { ...base, shortCopy: "   " });
  add("seo-inner-fallback", { ...base, pageLayout: { heroAsset: "missing" }, assets: { productPhoto: image("photo") } });
  add("hero-model", { ...base, assets: { hero: image("hero") } });
  add("commerce", base, { commerceSummary: { priceText: "NT$ 700", availability: "available", variantLabels: ["227g", "耳掛"], availableChoiceCount: 2 } });
  add("sold-out", base, { commerceSummary: { priceText: "NT$ 700", availability: "sold_out", variantLabels: [] }, publicStates: { detailPage: "YES", worksList: "NO", purchase: "NO" } });
  add("commerce-unknown", base); add("completeness-missing", { name: "Minimal" });
  add("candidate-empty", { ...base, worksPage: { contractVersion: 1, revision: 3, fields: { "story.body": { mode: "value", value: "" } } } });
  add("gallery-healthy", galleryProduct, { catalog: [{ slug: "fix1-related", name: "Related artwork" }] });
  for (const fault of ["gallery", "malformed", "exception", "unknown"] as const) add("fault-" + fault, galleryProduct, { catalog: [{ slug: "fix1-related", name: "Related artwork" }] }, fault);
  add("candidate-malformed", { ...base, worksPage: { contractVersion: 1, revision: 3, fields: { "story.body": { mode: "value", value: "Future" } } } }, {}, "candidate");
  add("giotto", { ...base, slug: "giotto-awakening" }); add("duplicate-manual", { ...base, relatedProducts: { productIds: ["dup"] } }, { catalog: [{ slug: "dup", name: "First" }, { slug: "dup", name: "Last" }] });
  add("duplicate-auto", base, { catalog: [{ slug: "dup", name: "First", inMonthlyMenu: true }, { slug: "dup", name: "Last", inMonthlyMenu: true }] });
  // Differential corpus preserves string boundaries; a "/" must never be
  // concatenated into harmless prose. Covers Unicode, URLs and bounded input.
  const strings = ["", " ", "/", "\\", "Safe", "/uploads/a.webp", "“/srv/private/a.txt”", "「/mnt/private/a」", "【/opt/private/a】", "F:\\private\\a", "../secret", "a/../../b", "https://example.com/a", "https://example.com/?token=secret", "at fn (file:///private/a)", "\n at fn (node:internal)", "a".repeat(4001), "💐".repeat(100), "\u200b/var/private", "／srv／private", "\0", "Safe\nmultiline"];
  for (let i = 0; i < strings.length; i++) {
    add("string-fact-" + i, { ...base, origin: strings[i] });
    add("string-flavor-" + i, { ...base, flavors: ["Safe", strings[i], "Other"] });
  }
  const accessor = { ...base };
  Object.defineProperty(accessor, "origin", { enumerable: true, get() { throw Error("accessor must not execute"); } });
  add("accessor-optional", accessor);
  add("large-labels", { ...base, flavors: Array.from({ length: 64 }, (_, i) => "Flavor " + i) }, { commerceSummary: { priceText: "Price", variantLabels: Array.from({ length: 20 }, (_, i) => "Variant " + i) } });
  return fixtures;
}
function invoke(r: Runtime, fixture: Fixture): { result: WorksOwnerProjectionResult; injections: number } {
  const original = r.trace.traceWorksArtwork, candidate = r.trace.traceWorksCandidate; let injections = 0;
  r.trace.traceWorksArtwork = (...args: any[]) => {
    const target = args[0]?.assets?.fix1GalleryOnly?.caption === "FIX1_GALLERY_OPTIONAL_SOURCE";
    if (fixture.fault === "malformed") return { ok: true, value: {} };
    if (target && fixture.fault) {
      injections++;
      if (fixture.fault === "exception") throw Error("PRIVATE_INTERNAL");
      return { ok: false, errors: [{ code: fixture.fault === "unknown" ? "INTERNAL_FAILURE" : "UNSAFE_OR_UNSUPPORTED_SNAPSHOT", ruleId: "artwork", message: "PRIVATE_INTERNAL" }] };
    }
    return original(...args);
  };
  if (fixture.fault === "candidate") r.trace.traceWorksCandidate = () => ({ ok: true, value: {} });
  try { return { result: r.project(fixture.input), injections }; }
  finally { r.trace.traceWorksArtwork = original; r.trace.traceWorksCandidate = candidate; }
}
function median(values: number[]) { const sorted = [...values].sort((a,b) => a-b); return sorted[Math.floor(sorted.length / 2)]; }
function benchmark(r: Runtime, products: any[]) {
  for (let i = 0; i < 3; i++) r.project({ product: products[0], catalog: products });
  const single: number[] = [], batches: number[] = [];
  for (let i = 0; i < 9; i++) { const t = performance.now(); assert.ok(r.project({ product: products[0], catalog: products }).ok); single.push(performance.now() - t); }
  for (const product of products) assert.ok(r.project({ product, catalog: products }).ok);
  for (let i = 0; i < 3; i++) { const t = performance.now(); for (const product of products) assert.ok(r.project({ product, catalog: products }).ok); batches.push(performance.now() - t); }
  r.reset(); const t = performance.now(); r.project({ product: products[0], catalog: products }); const representativeMs = performance.now() - t;
  return { moduleLoadMs: r.loadMs, singleMedianMs: median(single), batch25MedianMs: median(batches), singleSamplesMs: single, batchSamplesMs: batches, expensiveCalls: r.calls, safetyCalls: r.safety, functionalCalls: r.functional, traceMs: r.traceMs, representativeMs };
}
const fetchBefore = globalThis.fetch; let networkCalls = 0, pass = 0, fail = 0;
globalThis.fetch = async () => { networkCalls++; throw Error("Network forbidden"); };
function check(name: string, fn: () => void) { try { fn(); pass++; } catch { fail++; console.error("FAIL: " + name); } }
try {
  const jsonStart = performance.now(), dataBytes = readFileSync(path.join(root, "public/data/website-data.json"));
  const products = freeze(JSON.parse(dataBytes.toString("utf8")).menu.products) as any[], jsonLoadMs = performance.now() - jsonStart;
  assert.equal(products.length, 25);
  const baseline = runtime(true), fixtures = [...products.map((product, i) => ({ name: "canonical-" + i, input: freeze({ product, catalog: products }) })), ...synthetics()];
  console.error("Collecting checkpoint references: " + fixtures.length + " fixtures");
  const refs = fixtures.map(f => ({ name: f.name, ...invoke(baseline, f) }));
  assert.ok(refs.slice(0,25).every(r => r.result.ok && !r.result.value.warnings.length));
  console.error("Benchmarking checkpoint (startup and JSON load excluded)");
  const before = benchmark(baseline, products);
  if (process.argv.includes("--capture")) {
    console.log(JSON.stringify({ checkpoint, jsonLoadMs, sourceSha: createHash("sha256").update(dataBytes).digest("hex"), refs, before }));
  } else {
    const referenceFlag = process.argv.indexOf("--reference");
    if (referenceFlag !== -1) {
      const captured = JSON.parse(readFileSync(process.argv[referenceFlag + 1], "utf8").replace(/^\uFEFF/, ""));
      check("pre-edit reference checkpoint", () => assert.equal(captured.checkpoint, checkpoint));
      check("pre-edit reference exact JSON", () => assert.equal(JSON.stringify(captured.refs), JSON.stringify(refs)));
    }
    const current = runtime(false), outputs = fixtures.map(f => invoke(current, f));
    for (let i = 0; i < fixtures.length; i++) check("exact oracle: " + fixtures[i].name, () => assert.equal(JSON.stringify(outputs[i]), JSON.stringify({ result: refs[i].result, injections: refs[i].injections })));
    for (let i = 0; i < 25; i++) check("canonical bounded trace builds " + i, () => {
      current.reset(); const r = current.project({ product: products[i], catalog: products });
      assert.ok(r.ok); assert.ok(current.calls <= 20, "expensive trace bound"); if (!r.ok) return;
      assert.equal(r.value.fields.length, 52); assert.equal(r.value.sections.length, 10); assert.deepEqual(r.value.warnings, []);
    });
    const gallery = outputs[fixtures.findIndex(f => f.name === "fault-gallery")], healthy = outputs[fixtures.findIndex(f => f.name === "gallery-healthy")];
    check("FIX1 exactly one gallery failure, unrelated 51 fields and related unchanged", () => {
      assert.equal(gallery.injections, 1); assert.ok(gallery.result.ok && healthy.result.ok); if (!gallery.result.ok || !healthy.result.ok) return;
      assert.equal(gallery.result.value.warnings.length, 1); assert.equal(gallery.result.value.warnings[0].fieldId, "media.gallery");
      assert.deepEqual(gallery.result.value.fields.filter(f => f.id !== "media.gallery"), healthy.result.value.fields.filter(f => f.id !== "media.gallery"));
      assert.deepEqual(gallery.result.value.relatedWorks, healthy.result.value.relatedWorks);
    });
    for (const name of ["fault-malformed","fault-exception","fault-unknown","candidate-malformed"]) check("safe fatal " + name, () => assert.deepEqual(outputs[fixtures.findIndex(f => f.name === name)].result, { ok: false, errors: [{ code: "UNSAFE_PROJECTION", label: "來源需要確認" }] }));
    const a = freeze({ product: products[0], catalog: products, commerceSummary: { priceText: "A price", availability: "sold_out", variantLabels: ["A variant"] }, publicStates: { detailPage: "YES", worksList: "NO", purchase: "NO" } });
    const b = freeze({ product: products[1], catalog: products, commerceSummary: { priceText: "B price", availability: "available", variantLabels: ["B variant"] }, publicStates: { detailPage: "NO", worksList: "YES", purchase: "YES" } });
    const originalInputs = JSON.stringify([a,b]), a1 = current.project(a), br = current.project(b), a2 = current.project(a);
    check("A-B-A exact without stale cross-artwork values", () => { assert.equal(JSON.stringify(a1), JSON.stringify(a2)); assert.equal(JSON.stringify(a1), JSON.stringify(baseline.project(a))); assert.equal(JSON.stringify(br), JSON.stringify(baseline.project(b))); assert.notEqual(JSON.stringify(a1), JSON.stringify(br)); });
    check("frozen input data and own descriptors unchanged", () => { assert.equal(JSON.stringify([a,b]), originalInputs); assert.ok(Object.isFrozen(a.product)); assert.deepEqual(Object.keys(a), ["product","catalog","commerceSummary","publicStates"]); });
    check("same product changed caller inputs have no stale state", () => {
      const changed = { ...a, commerceSummary: b.commerceSummary, publicStates: b.publicStates };
      assert.equal(JSON.stringify(current.project(changed)), JSON.stringify(baseline.project(changed)));
      assert.equal(JSON.stringify(current.project(a)), JSON.stringify(a1));
    });
    check("large labels bounded independently of output string count", () => { current.reset(); const r = invoke(current, fixtures.find(f => f.name === "large-labels")!); assert.ok(r.result.ok); assert.ok(current.calls <= 20); });
    console.error("Benchmarking current projection");
    const after = benchmark(current, products);
    check("no real network", () => assert.equal(networkCalls, 0));
    console.log("W3.2A-2P PERFORMANCE: " + pass + " PASS / " + fail + " FAIL");
    console.log(JSON.stringify({ checkpoint, canonical: 25, synthetic: fixtures.length - 25, jsonLoadMs, before, after, singleSpeedup: before.singleMedianMs / after.singleMedianMs, batchSpeedup: before.batch25MedianMs / after.batch25MedianMs, structuralRatio: before.expensiveCalls / after.expensiveCalls, networkCalls }, null, 2));
    if (fail) process.exitCode = 1;
  }
} finally { globalThis.fetch = fetchBefore; }
