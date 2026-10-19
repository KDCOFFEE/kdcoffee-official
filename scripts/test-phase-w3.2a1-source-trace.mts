import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import ts from "typescript";
import type { EffectiveSourceTrace, TraceResult } from "../lib/worksArtworkSourceTrace.ts";

// In-memory CommonJS loader: existing pure helpers use extensionless/@ imports.
// No temp files, resolver changes, application stores, React rendering or network.
const allowed = new Set([
  "lib/worksArtworkSourceTrace.ts", "lib/productPageContent.ts", "lib/productPageContentValidation.ts",
  "lib/productPageSections.ts", "lib/productVisualAssets.ts", "lib/cleanRoastingMedia.ts", "lib/media.ts",
  "lib/worksArtworkValidation.ts", "lib/worksArtworkContract.ts",
]);
const modules = new Map<string, { exports: unknown }>();
function loadPure(id: string): unknown {
  if (!allowed.has(id)) throw new Error("Unexpected dependency: " + id);
  const cached = modules.get(id); if (cached) return cached.exports;
  const source = readFileSync(new URL("../" + id, import.meta.url), "utf8");
  const tree = ts.createSourceFile(id, source, ts.ScriptTarget.Latest, true);
  for (const statement of tree.statements) if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
    assert.ok(statement.moduleSpecifier.text.startsWith(".") || statement.moduleSpecifier.text.startsWith("@/"));
  }
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} as unknown }; modules.set(id, module);
  const requirePure = (spec: string): unknown => {
    let target = spec.startsWith("@/") ? spec.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(id), spec));
    if (!target.endsWith(".ts")) target += ".ts";
    return loadPure(target);
  };
  new Function("require", "module", "exports", '"use strict";\n' + js)(requirePure, module, module.exports);
  return module.exports;
}
const groups = ["Text", "Roasting text", "Roasted Beans", "Gallery", "Related", "SEO", "Hero model", "Clean media", "Works candidates", "Parity and safety", "Canonical legacy", "Output safety", "SEO fallback layers", "Unicode boundaries", "Unicode surfaces", "Root and prose", "Public resource boundaries"] as const;
type Group = typeof groups[number];
const counts = Object.fromEntries(groups.map(g => [g, { pass: 0, fail: 0 }])) as Record<Group, { pass: number; fail: number }>;
function test(group: Group, label: string, run: () => void) { try { run(); counts[group].pass++; } catch (e) { counts[group].fail++; console.error("FAIL " + group + ": " + label + ": " + (e instanceof Error ? e.message.split("\n")[0] : "assertion")); } }
function good<T>(r: TraceResult<T>): T { if (!r.ok) throw Error(r.errors.map(e => e.code).join(",")); return r.value; }
function bad(r: TraceResult<unknown>) { assert.equal(r.ok, false); assert.equal(Object.hasOwn(r, "value"), false); if (!r.ok) assert.ok(r.errors.length); }
function freeze<T>(v: T): T { if (v && typeof v === "object" && !Object.isFrozen(v)) { for (const child of Object.values(v)) freeze(child); Object.freeze(v); } return v; }
type Fixture = Record<string, unknown>;
const networkBefore = globalThis.fetch; let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw Error("Network forbidden"); };
try {
  const model = loadPure("lib/worksArtworkSourceTrace.ts") as typeof import("../lib/worksArtworkSourceTrace.ts");
  const content = loadPure("lib/productPageContent.ts") as typeof import("../lib/productPageContent.ts");
  const visual = loadPure("lib/productVisualAssets.ts") as typeof import("../lib/productVisualAssets.ts");
  const clean = loadPure("lib/cleanRoastingMedia.ts") as typeof import("../lib/cleanRoastingMedia.ts");
  const media = loadPure("lib/media.ts") as typeof import("../lib/media.ts");
  const trace = (p: Fixture, catalog: readonly unknown[] = []) => good(model.traceWorksArtwork(p, catalog));
  const img = (name: string, caption = "") => ({ path: "/uploads/" + name + ".webp", caption });
  const video = (name: string) => ({ type: "video" as const, url: "https://res.cloudinary.com/demo/video/upload/" + name + ".mp4", posterUrl: "/uploads/" + name + "-poster.webp" });
  const base = freeze({ id: "a", slug: "a", name: "A", mood: "Story", shortCopy: "Intro", subtitle: "Subtitle", flavors: ["Floral"], assets: {}, pageLayout: {} });

  // Independent inline route references. No expected winner is inferred from model values.
  function refRelated(p: Fixture, rows: Fixture[]): unknown[] {
    const settings = p.relatedProducts && typeof p.relatedProducts === "object" ? p.relatedProducts as { productIds?: unknown[] } : null;
    const seen = new Set(); const by = new Map(rows.map(v => [v.slug, v]));
    return settings
      ? (Array.isArray(settings.productIds) ? settings.productIds : []).filter(slug => { if (seen.has(slug)) return false; seen.add(slug); return true; })
        .map(slug => by.get(slug)).filter(v => v && v.slug !== p.slug && v.status !== "hidden" && v.active !== false).slice(0, 3).map(v => v!.slug)
      : rows.filter(v => v.slug !== p.slug && v.status !== "hidden" && v.inMonthlyMenu).slice(0, 3).map(v => v.slug);
  }
  function refRoasted(p: Fixture) {
    const a = p.assets as Record<string, { gallery?: unknown[]; media?: unknown; caption?: unknown }> | undefined;
    const asset = a?.roastedBeanPhoto || {};
    const source = Array.isArray(asset.gallery) ? asset.gallery.map((v, index) => ({ v, index })).filter(({ v }) => v && typeof v === "object" && ((v as Fixture).path || (v as Fixture).media)) : [];
    const imagePath = visual.resolveStaticProductAssetImage(p, "roastedBeanPhoto");
    const items = source.length ? source.map(({ v, index }) => ({ item: v as Fixture, index }))
      : imagePath || asset.media ? [{ item: { id: "legacy-roasted-1", path: imagePath, media: asset.media || null, caption: asset.caption || "" } as Fixture, index: null }] : [];
    return items.map(({ item, index }) => { const m = media.resolveMediaAsset(item.media, typeof item.path === "string" ? item.path : undefined); return {
      id: typeof item.id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(item.id) ? item.id : null, originalGalleryIndex: index,
      primary: m?.url || null, type: m?.type || null, caption: item.caption || (m?.type === "video" || m?.type === "youtube" ? "實際烘焙豆影片" : "實際烘焙豆影像"),
    }; });
  }
  const oracleChecks = (p: Fixture, rows: Fixture[]) => {
    const t = trace(p, rows); const c = content.resolveProductPageContent(p);
    assert.equal(t.heroSupportingCopy.effectiveValue, c["product-hero"].lead);
    assert.equal(t.story.effectiveValue, c["product-hero"].storyLead);
    assert.equal(t.storySupplement.effectiveValue, c["product-hero"].storySupportingCopy);
    assert.equal(t.flavorNarrative.effectiveValue, c["flavor-notes"].description);
    assert.deepEqual(t.flavorTags.effectiveValue, c["flavor-notes"].flavors);
    assert.equal(t.roastingDescription.effectiveValue, c["clean-roasting"].description);
    assert.deepEqual(t.roastingProofs.effectiveValue, c["clean-roasting"].proofs.map(v => ({ id: v.id, title: v.title, body: v.body, icon: v.icon || null })));
    assert.equal(t.relatedTitle.effectiveValue, c["related-products"].heading);
    assert.deepEqual(t.relatedWorks.effectiveValue, refRelated(p, rows));
    assert.deepEqual(t.roastedBeans.effectiveValue, refRoasted(p));
    assert.deepEqual(t.gallery.effectiveValue, visual.resolveGalleryAssets(p).map(v => ({ role: v.key, path: v.path, caption: v.caption || "" })));
    const seo = visual.resolveHeroAsset(p) || visual.resolveProductAsset(p) || visual.resolveListAsset(p);
    assert.deepEqual(t.seoImage.effectiveValue, seo ? { role: seo.key, path: seo.path } : null);
    const seoDescription = p.shortCopy || p.mood;
    assert.deepEqual(t.seoDescription.effectiveValue, seoDescription === undefined ? null : seoDescription);
    const config = clean.normalizeCleanRoastingMedia(p.cleanRoastingMedia, p.slug === "giotto-awakening" ? clean.CLEAN_ROASTING_LEGACY_CONFIG : undefined);
    assert.deepEqual(t.cleanRoastingMedia.effectiveValue, { enabled: config.enabled !== false, items: clean.enabledCleanRoastingMediaItems(config).map(v => ({ id: v.id, type: v.type, src: v.src, order: v.order ?? 0 })) });
    return t;
  };
  for (const [label, p, key, value] of [
    ["shortCopy", { shortCopy: " intro ", subtitle: "sub" }, "product.shortCopy", "intro"],
    ["subtitle", { shortCopy: "", subtitle: " sub " }, "product.subtitle", "sub"],
    ["absent", {}, "absent.heroCopy", ""],
    ["whitespace", { shortCopy: " \t", subtitle: " sub " }, "product.subtitle", "sub"],
  ] as const) test("Text", "Hero " + label, () => { const t = trace(p).heroSupportingCopy; assert.equal(t.sourceKey, key); assert.equal(t.effectiveValue, value); oracleChecks(p, []); });
  for (const [p, key, depth] of [
    [{ mood: " mood ", shortCopy: "short", subtitle: "sub" }, "product.mood", 0],
    [{ mood: " ", shortCopy: " short ", subtitle: "sub" }, "product.shortCopy", 1],
    [{ mood: "", shortCopy: "", subtitle: " sub " }, "product.subtitle", 2],
    [{}, "legacy.fixedStory", 3],
  ] as const) test("Text", "story depth " + depth, () => { const t = trace(p).story; assert.equal(t.sourceKey, key); assert.equal(t.fallbackDepth, depth); assert.equal(t.isFallback, depth > 0); oracleChecks(p, []); });
  test("Text", "equal values still choose mood", () => { const t = trace({ mood: "same", shortCopy: "same", subtitle: "same" }); assert.equal(t.story.sourceKey, "product.mood"); assert.equal(t.heroSupportingCopy.sourceKey, "product.shortCopy"); });
  test("Text", "supplement visible", () => { const t = trace(base).storySupplement; assert.equal(t.effectiveValue, "Intro"); assert.equal(t.visibility, "visible"); assert.equal(t.sourceKey, "product.shortCopy"); });
  test("Text", "supplement duplicate is suppressed, not missing", () => { const t = trace({ mood: "same", shortCopy: " same " }).storySupplement; assert.equal(t.effectiveValue, ""); assert.equal(t.hasValue, true); assert.equal(t.visibility, "suppressed"); assert.equal(t.visibilityReason, "duplicate-of-main-story"); });
  test("Text", "supplement empty", () => { const t = trace({}).storySupplement; assert.equal(t.hasValue, false); assert.equal(t.visibility, "empty"); });
  test("Text", "flavor configured and facts separate", () => { const p = { flavors: [" Tag "], productPageContent: { "flavor-notes": { description: " Narrative " } } }; const t = oracleChecks(p, []); assert.equal(t.flavorNarrative.sourceOwner, "WORKS"); assert.equal(t.flavorNarrative.effectiveValue, "Narrative"); assert.deepEqual(t.flavorTags.effectiveValue, [" Tag "]); });
  test("Text", "flavor absent", () => assert.equal(trace({}).flavorNarrative.sourceOwner, "ABSENT"));
  test("Text", "bad unrelated content invalidates whole legacy content", () => { const p = { productPageContent: { "flavor-notes": { description: "discarded" }, "coffee-profile": null } }; const t = oracleChecks(p, []); assert.equal(t.flavorNarrative.effectiveValue, ""); assert.ok(t.flavorNarrative.steps.some(s => s.reason === "legacy-normalization-failed-entire-content")); });

  const customProof = { id: "own", title: "Own", body: "Only one proof", icon: "air" };
  for (const p of [{}, { cleanRoastingMedia: {} }, { cleanRoastingMedia: [] }, { productPageContent: { "clean-roasting": { description: " custom " } } }]) test("Roasting text", "description branch parity", () => oracleChecks(p, []));
  test("Roasting text", "managed empty has no fixed text owner", () => { const t = trace({ cleanRoastingMedia: {} }).roastingDescription; assert.equal(t.effectiveValue, ""); assert.equal(t.sourceOwner, "ABSENT"); assert.equal(t.sourceKind, "MANAGED_MEDIA_EMPTY"); });
  test("Roasting text", "fixed description belongs to legacy", () => assert.equal(trace({}).roastingDescription.sourceOwner, "LEGACY_FIXED"));
  test("Roasting text", "configured one proof is not padded", () => { const p = { productPageContent: { "clean-roasting": { proofs: [customProof] } } }; const t = oracleChecks(p, []).roastingProofs; assert.equal(t.children.length, 1); assert.equal(t.children[0].sourceKey, 'product.productPageContent["clean-roasting"].proofs[0]'); });
  test("Roasting text", "configured identical legacy values retain configured origin", () => { const p = { productPageContent: { "clean-roasting": { proofs: content.LEGACY_CLEAN_ROASTING_PROOFS.map(v => ({ ...v })) } } }; const t = oracleChecks(p, []).roastingProofs; for (const c of t.children) assert.equal(c.sourceOwner, "WORKS"); });
  test("Roasting text", "empty proofs uses all legacy items", () => { const t = oracleChecks({ productPageContent: { "clean-roasting": { proofs: [] } } }, []).roastingProofs; assert.equal(t.children.length, 3); t.children.forEach((v, i) => { assert.equal(v.sourceKey, "legacy.cleanRoastingProofs[" + i + "]"); assert.equal(v.sourceOwner, "LEGACY_FIXED"); }); });

  const rb = (asset: Fixture) => ({ showRoastedBeanPhoto: true, assets: { roastedBeanPhoto: asset } });
  for (const [label, p] of [
    ["gallery", rb({ gallery: [{ id: "g1", ...img("bean"), caption: "gallery" }] })],
    ["filtered then single", rb({ gallery: [null, {}, false], ...img("legacy", "asset") })],
    ["single", rb(img("single", "asset"))], ["none", {}],
    ["empty configured", rb({ gallery: [], ...img("single") })], ["absent gallery", rb(img("single"))],
    ["video", rb({ gallery: [{ id: "v", media: video("bean") }] })],
    ["invalid media payload", rb({ gallery: [{ media: "not-media" }] })],
  ] as const) test("Roasted Beans", label + " parity", () => oracleChecks(p, []));
  test("Roasted Beans", "original index survives filtering", () => { const t = trace(rb({ gallery: [null, {}, { id: "safe", ...img("x") }] })).roastedBeans; assert.equal(t.children[0].sourceKey, "product.assets.roastedBeanPhoto.gallery[2]"); assert.equal((t.effectiveValue as { originalGalleryIndex: number }[])[0].originalGalleryIndex, 2); });
  test("Roasted Beans", "filtered empty distinct from absent", () => { assert.equal(trace(rb({ gallery: [{}] })).roastedBeans.configurationState, "GALLERY_FILTERED_EMPTY"); assert.equal(trace(rb({})).roastedBeans.configurationState, "GALLERY_ABSENT"); });
  test("Roasted Beans", "gallery caption exact source", () => { const c = trace(rb({ gallery: [{ ...img("x"), caption: "same" }], caption: "same" })).roastedBeans.children[0].children[0]; assert.equal(c.sourceKey, "product.assets.roastedBeanPhoto.gallery[0].caption"); assert.equal(c.sourceOwner, "MEDIA"); });
  test("Roasted Beans", "single asset caption exact source", () => assert.equal(trace(rb(img("x", "asset"))).roastedBeans.children[0].children[0].sourceKey, "product.assets.roastedBeanPhoto.caption"));
  test("Roasted Beans", "viewer image fallback fixed", () => { const c = trace(rb(img("x"))).roastedBeans.children[0].children[0]; assert.equal(c.sourceKey, "legacy.viewerImageCaption"); assert.equal(c.sourceOwner, "LEGACY_FIXED"); });
  test("Roasted Beans", "viewer video fallback fixed", () => { const c = trace(rb({ media: video("x") })).roastedBeans.children[0].children[0]; assert.equal(c.sourceKey, "legacy.viewerVideoCaption"); assert.equal(c.effectiveValue, "實際烘焙豆影片"); });
  test("Roasted Beans", "false visibility flag preserves selected media", () => { const t = trace({ ...rb(img("x")), showRoastedBeanPhoto: false }).roastedBeans; assert.equal(t.visibility, "disabled"); assert.equal(t.children.length, 1); });
  test("Roasted Beans", "single poster provenance", () => { const t = oracleChecks(rb({ media: { type: "image", url: "/uploads/full.webp", posterUrl: "/uploads/poster.webp" } }), []).roastedBeans; assert.equal(t.children[0].media?.fallback?.sourceKey, "product.assets.roastedBeanPhoto.media.posterUrl"); });

  const galleryP = { assets: { hero: img("hero"), productPhoto: img("product"), label: img("label", " caption "), other: img("label") }, pageLayout: { galleryAssets: ["hero", "productPhoto", "label", "label", "other"] } };
  test("Gallery", "production helper parity", () => oracleChecks(galleryP, []));
  for (const reason of ["hero-duplicate", "product-photo-duplicate", "duplicate-asset", "duplicate-path"]) test("Gallery", reason, () => assert.ok(trace(galleryP).gallery.steps.some(s => s.reason === reason)));
  test("Gallery", "non-array uses label", () => { const p = { ...galleryP, pageLayout: { galleryAssets: null } }; assert.equal(oracleChecks(p, []).gallery.sourceOwner, "LEGACY_FIXED"); });
  test("Gallery", "explicit array empty stays empty", () => { const p = { ...galleryP, pageLayout: { galleryAssets: [] } }; const t = oracleChecks(p, []).gallery; assert.deepEqual(t.effectiveValue, []); assert.equal(t.configurationState, "CONFIGURED_EMPTY"); });
  test("Gallery", "original role index after blank entries", () => { const p = { ...galleryP, pageLayout: { galleryAssets: ["", " label "] } }; const t = oracleChecks(p, []).gallery; assert.equal(t.children[0].dependencies[0], "product.pageLayout.galleryAssets[1]"); });
  test("Gallery", "hide does not erase source", () => assert.equal(trace({ ...galleryP, pageLayout: { galleryAssets: ["label"], showGallery: false } }).gallery.visibility, "disabled"));
  test("Gallery", "poster precedes same-valued path", () => { const p = { assets: { label: { path: "/uploads/same.webp", media: { type: "image", url: "/uploads/main.webp", posterUrl: "/uploads/same.webp" } } } }; const t = oracleChecks(p, []).gallery.children[0]; assert.equal(t.sourceKey, "product.assets.label.media.posterUrl"); });

  const rows = freeze([{ slug: "a", inMonthlyMenu: true }, { slug: "b", inMonthlyMenu: true }, { slug: "hidden", status: "hidden", inMonthlyMenu: true }, { slug: "inactive", active: false, inMonthlyMenu: true }, { slug: "c", inMonthlyMenu: true }, { slug: "d", inMonthlyMenu: true }, { slug: "e", inMonthlyMenu: false }]);
  const relatedP = { slug: "a", relatedProducts: { productIds: ["c", "c", "a", "missing", "hidden", "inactive", "b", "d", "e"] } };
  test("Related", "manual ordered parity", () => { const t = oracleChecks(relatedP, rows).relatedWorks; assert.deepEqual(t.effectiveValue, ["c", "b", "d"]); assert.equal(t.selectionMode, "MANUAL"); });
  for (const reason of ["duplicate", "self", "unresolved", "hidden", "inactive", "max-three"]) test("Related", reason, () => assert.ok(trace(relatedP, rows).relatedWorks.steps.some(s => s.reason === reason)));
  test("Related", "explicit [] is manual zero", () => { const p = { slug: "a", relatedProducts: { productIds: [] } }; const t = oracleChecks(p, rows).relatedWorks; assert.deepEqual(t.effectiveValue, []); assert.equal(t.selectionMode, "MANUAL"); assert.equal(t.isFallback, false); });
  test("Related", "missing array in existing config is manual zero", () => assert.deepEqual(oracleChecks({ slug: "a", relatedProducts: {} }, rows).relatedWorks.effectiveValue, []));
  test("Related", "array object matches existing typeof-object branch", () => assert.equal(oracleChecks({ slug: "a", relatedProducts: [] }, rows).relatedWorks.selectionMode, "MANUAL"));
  test("Related", "auto legacy permits inactive exactly as route", () => { const t = oracleChecks({ slug: "a" }, rows).relatedWorks; assert.equal(t.selectionMode, "AUTO_LEGACY"); assert.deepEqual(t.effectiveValue, ["b", "inactive", "c"]); });
  test("Related", "disabled still traces selection", () => assert.equal(oracleChecks({ ...relatedP, relatedProducts: { ...relatedP.relatedProducts, enabled: false } }, rows).relatedWorks.visibility, "disabled"));
  test("Related", "custom title trimmed", () => assert.equal(oracleChecks({ relatedProducts: { title: " Custom " } }, []).relatedTitle.effectiveValue, "Custom"));
  test("Related", "empty title fixed", () => assert.equal(oracleChecks({ relatedProducts: { title: "" } }, []).relatedTitle.sourceOwner, "LEGACY_FIXED"));

  for (const [p, key, value] of [[{ shortCopy: "short", mood: "mood" }, "product.shortCopy", "short"], [{ shortCopy: "", mood: " mood " }, "product.mood", " mood "], [{}, "absent.routeSeoDescription", null], [{ shortCopy: "   ", mood: "mood" }, "product.shortCopy", "   "]] as const) test("SEO", "description " + key, () => { const t = oracleChecks(p, []).seoDescription; assert.equal(t.sourceKey, key); assert.equal(t.effectiveValue, value); });
  for (const [role, assets] of [["hero", { hero: img("h") }], ["productPhoto", { productPhoto: img("p") }], ["artworkCover", { artworkCover: img("l") }]] as const) test("SEO", "image " + role, () => { const t = oracleChecks({ assets }, []).seoImage; assert.equal((t.effectiveValue as { role: string }).role, role); });
  test("SEO", "image absent", () => assert.equal(oracleChecks({}, []).seoImage.hasValue, false));
  test("SEO", "image differs from Giotto Hero", () => { const p = { slug: "giotto-awakening", assets: { productPhoto: img("p"), artworkCover: img("a") } }; const t = oracleChecks(p, []); assert.equal(t.seoImage.sourceKey, "product.assets.productPhoto.path"); assert.equal(t.heroMedia.sourceKey, "product.assets.artworkCover.path"); });

  for (const [branch, p] of [
    ["HERO_IMAGE", { assets: { hero: img("hero") } }],
    ["VIDEO", { assets: { hero: { media: video("hero"), path: "/uploads/fallback.webp" } } }],
    ["PRODUCT_VISUAL", { pageLayout: { heroAsset: "productVisual" }, assets: { productVisual: img("pv") } }],
    ["PRODUCT_PHOTO", { assets: { productPhoto: img("product") } }],
    ["PACKAGE_VISUAL", {}],
    ["GIOTTO_LIST_COMPATIBILITY", { slug: "giotto-awakening", assets: { artworkCover: img("art") } }],
  ] as const) test("Hero model", branch, () => { const t = trace(p).heroMedia; assert.equal((t.effectiveValue as { branch: string }).branch, branch); assert.equal(t.bindingStatus, "MODEL_ONLY"); });
  test("Hero model", "empty productVisual does not invent photo fallback", () => { const t = trace({ pageLayout: { heroAsset: "productVisual" }, assets: { productPhoto: img("p") } }).heroMedia; assert.deepEqual(t.effectiveValue, { branch: "PRODUCT_VISUAL", path: "" }); });
  test("Hero model", "resource layers separate and unknown browser load", () => { const t = trace({ assets: { hero: { media: video("hero"), path: "/uploads/fallback.webp" } } }).heroMedia; assert.equal(t.media?.configured?.sourceKey, "product.assets.hero.media.url"); assert.equal(t.media?.poster?.sourceKey, "product.assets.hero.media.posterUrl"); assert.equal(t.media?.fallback?.sourceKey, "product.assets.hero.path"); assert.equal(t.media?.loadStatus, "UNKNOWN_SERVER_SIDE"); });

  const cleanItems = [{ id: "late", type: "image", src: "/uploads/late.webp", order: 4 }, { id: "first", type: "video", src: "/videos/first.mp4", order: 0 }, { id: "off", type: "image", src: "/uploads/off.webp", enabled: false }, { id: "late", type: "image", src: "/uploads/dup.webp" }, { id: "bad", type: "video", src: "/uploads/not-video.webp" }];
  for (const [label, p] of [["configured", { cleanRoastingMedia: { items: cleanItems } }], ["disabled", { cleanRoastingMedia: { enabled: false, items: cleanItems } }], ["absent normal", {}], ["Giotto legacy", { slug: "giotto-awakening" }], ["Giotto explicit empty", { slug: "giotto-awakening", cleanRoastingMedia: { items: [] } }], ["Giotto array legacy", { slug: "giotto-awakening", cleanRoastingMedia: [] }]] as const) test("Clean media", label + " parity", () => oracleChecks(p, []));
  test("Clean media", "order and original provenance", () => { const t = trace({ cleanRoastingMedia: { items: cleanItems } }).cleanRoastingMedia; assert.deepEqual((t.effectiveValue as { items: { id: string }[] }).items.map(v => v.id), ["first", "late"]); assert.equal(t.children[1].sourceKey, "product.cleanRoastingMedia.items[1].src"); });
  test("Clean media", "duplicate and invalid reasons", () => { const t = trace({ cleanRoastingMedia: { items: cleanItems } }).cleanRoastingMedia; for (const reason of ["duplicate-id", "invalid-media", "item-disabled"]) assert.ok(t.steps.some(v => v.reason === reason)); });
  test("Clean media", "default ids preserve original indexes", () => oracleChecks({ cleanRoastingMedia: { items: [{ type: "bad", src: "" }, { type: "image", src: "/uploads/x.webp" }] } }, []));
  test("Clean media", "max eight source slots", () => { const items = Array.from({ length: 9 }, (_, i) => ({ id: "i" + i, type: "image", src: "/uploads/" + i + ".webp" })); const t = oracleChecks({ cleanRoastingMedia: { items } }, []).cleanRoastingMedia; assert.ok(t.steps.some(v => v.reason === "max-eight-source-items")); });

  for (const [field, value] of [["story.body", ""], ["presentation.visible", false], ["presentation.spacing", 0], ["relatedWorks.items", []], ["hero.media", null]] as const) test("Works candidates", "explicit " + field, () => { const t = good(model.traceWorksCandidate({ field, state: { mode: "value", value } })); assert.deepEqual(t.effectiveValue, value); assert.equal(t.hasValue, true); assert.equal(t.isExplicitWorksOverride, true); assert.equal(t.snapshotKind, "WORKS_CANDIDATE"); assert.equal(t.bindingStatus, "MODEL_ONLY"); });
  test("Works candidates", "inherit actual provider leaf source", () => { const provider = trace({ mood: "Default story" }).story; const t = good(model.traceWorksCandidate({ field: "story.body", state: { mode: "inherit" }, inheritProvider: { providerKey: "product.story", trace: provider } })); assert.equal(t.sourceKey, "product.mood"); assert.equal(t.effectiveValue, "Default story"); assert.equal(t.isInherited, true); assert.equal(t.bindingStatus, "MODEL_ONLY"); });
  test("Works candidates", "missing provider errors, no pretend website default", () => bad(model.traceWorksCandidate({ field: "story.body", state: { mode: "inherit" } })));
  test("Works candidates", "wrong provider errors", () => bad(model.traceWorksCandidate({ field: "story.body", state: { mode: "inherit" }, inheritProvider: { providerKey: "wrong", trace: trace({ mood: "x" }).story } })));
  for (const field of ["name", "price", "copy.4", "copy.8", "copy.16", "copy.18", "copy.20", "copy.29"]) test("Works candidates", "blocked " + field, () => bad(model.traceWorksCandidate({ field, state: { mode: "value", value: "x" } })));
  test("Works candidates", "namespace never becomes current public binding", () => { const p = { mood: "Public old", worksPage: { contractVersion: 1, revision: 1, fields: { "story.body": { mode: "value", value: "Unwired candidate" } } } }; assert.equal(trace(p).story.effectiveValue, "Public old"); });

  test("Parity and safety", "inline route reference guards", () => {
    const code = readFileSync(new URL("../app/works/[slug]/page.tsx", import.meta.url), "utf8");
    for (const snippet of ["description: product?.shortCopy || product?.mood", "explicitRoastedBeanGallery.length", "seenRelatedSlugs.has(relatedSlug)", 'item.status !== "hidden" && item.active !== false', '.slice(0, 3)', 'const isProductVisualHero = layout.heroAsset === "productVisual"']) assert.ok(code.includes(snippet), snippet);
    const viewer = readFileSync(new URL("../components/commerce/RoastedBeanViewer.tsx", import.meta.url), "utf8");
    for (const snippet of ['activeItem?.caption ||', '"實際烘焙豆影片" : "實際烘焙豆影像"']) assert.ok(viewer.includes(snippet));
  });
  test("Parity and safety", "all trace outputs serialize without loss", () => { const t = trace({ ...base, assets: { hero: { media: video("x") } } }, rows); assert.deepEqual(JSON.parse(JSON.stringify(t)), t); });
  test("Parity and safety", "no production-bound output anywhere", () => { const t = trace(base, rows); const walk = (v: EffectiveSourceTrace) => { assert.notEqual(v.bindingStatus, "PRODUCTION_BOUND"); v.children.forEach(walk); }; Object.values(t).forEach(walk); });
  test("Parity and safety", "sensitive extras never leak", () => { const p = { ...base, auth: "AUTH_SENTINEL", member: "MEMBER_SENTINEL", orders: "ORDER_SENTINEL", credentials: "SECRET_SENTINEL", commerce: { stock: "COMMERCE_SENTINEL" }, history: "HISTORY_SENTINEL", assets: { hero: { ...img("hero"), credentials: "ASSET_SECRET_SENTINEL" } } }; const out = JSON.stringify(trace(p)); for (const marker of ["AUTH_SENTINEL", "MEMBER_SENTINEL", "ORDER_SENTINEL", "SECRET_SENTINEL", "COMMERCE_SENTINEL", "HISTORY_SENTINEL", "ASSET_SECRET_SENTINEL"]) assert.ok(!out.includes(marker)); });
  for (const url of ["F:\\private\\image.webp", "file:///etc/private", "/data/private.webp", "https://user:pass@example.com/image.webp", "https://example.com/image.webp?token=private"]) test("Parity and safety", "unsafe resource rejected", () => bad(model.traceWorksArtwork({ assets: { hero: { path: url } } })));
  test("Parity and safety", "HTTPS public resource accepted", () => assert.equal(trace({ assets: { hero: { path: "https://cdn.example.com/image.webp" } } }).heroMedia.media?.configured?.url, "https://cdn.example.com/image.webp"));
  test("Parity and safety", "filesystem path cannot leak through editorial", () => bad(model.traceWorksArtwork({ mood: "F:\\private\\secret" })));
  test("Parity and safety", "hook input rejected without execution", () => { let calls = 0; const a = Object.defineProperty({}, "path", { enumerable: true, get() { calls++; throw Error("private"); } }); bad(model.traceWorksArtwork({ assets: { hero: a } })); assert.equal(calls, 0); });
  test("Parity and safety", "toJSON never executes", () => { let calls = 0; const x = { toJSON() { calls++; throw Error("private"); } }; bad(model.traceWorksArtwork({ productPageContent: x })); assert.equal(calls, 0); });
  test("Parity and safety", "caller input and output arrays detached", () => { const p = freeze({ ...base, flavors: ["Original"], assets: { label: img("label") } }); const before = JSON.stringify(p); const t = trace(p); (t.flavorTags.effectiveValue as string[]).push("Candidate only"); t.gallery.steps.push({ sourceKey: "test", disposition: "excluded", reason: "test", index: null }); assert.equal(JSON.stringify(p), before); });
  test("Parity and safety", "same URLs retain role/source winner", () => { const p = { pageLayout: { heroAsset: "custom" }, assets: { custom: img("same"), hero: img("same") } }; const t = oracleChecks(p, []); assert.equal(t.seoImage.sourceKey, "product.assets.custom.path"); });
  test("Parity and safety", "module contains no I/O or unsafe evaluation", () => {
    const text = readFileSync(new URL("../lib/worksArtworkSourceTrace.ts", import.meta.url), "utf8"); const ast = ts.createSourceFile("trace.ts", text, ts.ScriptTarget.Latest, true);
    const visit = (n: ts.Node) => { if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) assert.ok(/^\.\/(?:productPageContentValidation|productPageContent|cleanRoastingMedia|media|worksArtworkContract|worksArtworkValidation)\.ts$/u.test(n.moduleSpecifier.text));
      if (ts.isCallExpression(n)) assert.notEqual(n.expression.kind, ts.SyntaxKind.ImportKeyword);
      if (ts.isIdentifier(n) && !((ts.isPropertyAccessExpression(n.parent) || ts.isPropertyAssignment(n.parent) || ts.isPropertySignature(n.parent)) && n.parent.name === n)) assert.ok(!["process", "fetch", "require", "setTimeout", "setInterval", "eval", "globalThis"].includes(n.text));
      if (ts.isNewExpression(n) && ts.isIdentifier(n.expression)) assert.notEqual(n.expression.text, "Function"); ts.forEachChild(n, visit); }; visit(ast);
  });

  test("Text", "normalized empty flavor has a skip explanation", () => { const t = trace({ productPageContent: { "flavor-notes": { description: "  " } } }).flavorNarrative; assert.equal(t.effectiveValue, ""); assert.equal(t.steps[0].disposition, "skipped"); assert.equal(t.steps[0].sourceKey, 'product.productPageContent["flavor-notes"].description'); });
  test("Roasting text", "managed-empty branch explains both choices", () => { const t = trace({ cleanRoastingMedia: {} }).roastingDescription; assert.equal(t.steps[0].disposition, "skipped"); assert.equal(t.steps[1].reason, "managed-media-empty-result"); });
  test("SEO", "raw fallback explanation keeps whitespace", () => { assert.equal(trace({ shortCopy: "  " }).seoDescription.steps[0].reason, "raw-truthy-value"); assert.equal(trace({ mood: "x" }).seoDescription.steps[0].reason, "raw-falsy-value"); });
  test("Roasted Beans", "YouTube caption follows video branch", () => { const p = rb({ gallery: [{ media: { type: "youtube", url: "https://www.youtube.com/watch?v=abc123" } }] }); const t = oracleChecks(p, []).roastedBeans; assert.equal(t.children[0].children[0].sourceKey, "legacy.viewerVideoCaption"); });
  for (const url of ["/srv/private.webp", "/uploads/../data/private.webp", "/uploads/%2e%2e/data/private.webp", "/uploads/x.webp?access_token=private", "https://127.0.0.1/image.webp"]) test("Parity and safety", "public resource boundary fails closed", () => bad(model.traceWorksArtwork({ assets: { hero: { path: url } } })));
  test("Parity and safety", "unsafe winner cannot be replaced to claim parity", () => bad(model.traceWorksArtwork({ assets: { hero: { path: "/uploads/safe.webp", media: { type: "image", url: "/uploads/primary.webp", posterUrl: "/data/private.webp" } } } })));
  test("Works candidates", "provider cannot promote binding or leak extra fields", () => { const provider = { ...trace({ mood: "Default" }).story, bindingStatus: "PRODUCTION_BOUND" as const, credentials: "PROVIDER_PRIVATE_SENTINEL" }; const t = good(model.traceWorksCandidate({ field: "story.body", state: { mode: "inherit" }, inheritProvider: { providerKey: "product.story", trace: provider } })); assert.equal(t.bindingStatus, "MODEL_ONLY"); assert.ok(!JSON.stringify(t).includes("PROVIDER_PRIVATE_SENTINEL")); });

  test("Text", "narrative does not claim visibility without flavor tags", () => { const t = trace({ productPageContent: { "flavor-notes": { description: "Stored narrative" } } }); assert.equal(t.flavorNarrative.effectiveValue, "Stored narrative"); assert.equal(t.flavorNarrative.hasValue, true); assert.equal(t.flavorNarrative.visibility, "suppressed"); assert.equal(t.flavorNarrative.visibilityReason, "flavor-section-has-no-tags"); });
  test("Works candidates", "missing provider source key rejected structurally", () => { const provider = { ...trace({ mood: "Default" }).story, sourceKey: undefined }; bad(model.traceWorksCandidate({ field: "story.body", state: { mode: "inherit" }, inheritProvider: { providerKey: "product.story", trace: provider as unknown as EffectiveSourceTrace } })); });

  // FIX M1: independent whole-value and prose fixtures; no root-name blacklist oracle.
  const unsafePaths = [
    "F:\\secret\\file.txt", "C:/private/data.json", "\\\\server\\share\\private.txt", "//server/share/private.txt",
    "/srv/private/source.txt", "/opt/application/source.txt", "/mnt/volume/private.txt", "/home/user/private.txt",
    "/root/private.txt", "/var/lib/private.txt", "/tmp/private.txt", "/etc/private.conf", "/usr/local/private.txt",
    "/private/secret.txt", "/Users/person/private.txt", "/Volumes/private/data.txt", "/unlisted-root/private.txt",
  ];
  function redacted(result: TraceResult<unknown>, path: string) {
    bad(result);
    if (!result.ok) {
      assert.deepEqual(result.errors, [{ code: "UNSAFE_OR_UNSUPPORTED_SNAPSHOT", ruleId: "artwork", message: "The data snapshot cannot be safely traced; no alternative winner was invented." }]);
      const json = JSON.stringify(result);
      assert.ok(!json.includes(path)); assert.ok(!json.includes(process.cwd()));
      assert.ok(!json.includes("stack")); assert.ok(!json.includes("private.txt"));
    }
  }
  for (const path of unsafePaths) {
    test("Output safety", "absolute path whole " + path, () => redacted(model.traceWorksArtwork({ mood: path }), path));
    test("Output safety", "absolute path prose " + path, () => redacted(model.traceWorksArtwork({ mood: "Source is " + path + " for this artwork." }), path));
  }
  for (const text of [
    'Source is "/srv/private/source.txt".', "來源：/opt/application/source.txt。", "Source=(/mnt/volume/private.txt)",
    "file:///unlisted-root/private.txt", "https://example.com/media/a.webp then /srv/private/source.txt",
  ]) test("Output safety", "delimited absolute path", () => redacted(model.traceWorksArtwork({ mood: text }), text));
  for (const value of [
    "https://example.com/image.webp", "https://example.com/mnt/image.webp", "http://example.com/assets/a.jpg",
    "/uploads/artwork/a.webp", "/assets/artwork/a.jpg", "/images/artwork/a.webp", "/videos/artwork/a.mp4",
    "Visit https://example.com/mnt/image.webp for the public image.",
    "圖片：/uploads/artwork/a.webp。", "咖啡/茶的選擇", "甜 / 酸 / 苦", "A/B 比較，左／右皆可",
  ]) test("Output safety", "public reference or slash prose", () => {
    const p = freeze({ mood: value }); const before = JSON.stringify(p);
    assert.equal(trace(p).story.effectiveValue, value); assert.equal(JSON.stringify(p), before);
  });
  for (const url of ["https://example.com/image.webp", "https://example.com/mnt/image.webp", "/uploads/a.webp", "/assets/a.webp"])
    test("Output safety", "media URL stays permitted", () => assert.equal(trace({ assets: { hero: { path: url } } }).seoImage.media?.configured?.url, url));
  test("Output safety", "HTTP is editorial only; stricter media contract preserved", () => {
    assert.equal(trace({ mood: "http://example.com/assets/a.jpg" }).story.effectiveValue, "http://example.com/assets/a.jpg");
    redacted(model.traceWorksArtwork({ assets: { hero: { path: "http://example.com/assets/a.jpg" } } }), "http://example.com/assets/a.jpg");
  });
  for (const path of ["/uploads/../private/secret.txt", "/uploads/%2e%2e%2fprivate/secret.txt", "/uploads/x.webp?access_token=private"])
    test("Output safety", "public-looking unsafe reference", () => redacted(model.traceWorksArtwork({ mood: path }), path));
  for (const [label, p] of [
    ["hero shortCopy", { shortCopy: "Source is /srv/private/source.txt" }],
    ["gallery caption", { assets: { label: { path: "/uploads/a.webp", caption: "Source is /opt/application/source.txt" } } }],
    ["roasted caption", rb({ path: "/uploads/a.webp", caption: "Source is /mnt/volume/private.txt" })],
    ["flavor narrative", { flavors: ["floral"], productPageContent: { "flavor-notes": { description: "Source is /srv/private/source.txt" } } }],
    ["proof body", { productPageContent: { "clean-roasting": { proofs: [{ id: "proof", title: "Proof", body: "Source is /opt/application/source.txt" }] } } }],
  ] as const) test("Output safety", label + " uses the output boundary", () => redacted(model.traceWorksArtwork(p), "Source is"));
  test("Output safety", "candidate editorial output also rejects paths safely", () => {
    const r = model.traceWorksCandidate({ field: "story.body", state: { mode: "value", value: "Source is /srv/private/source.txt" } });
    bad(r); assert.ok(!JSON.stringify(r).includes("/srv/"));
  });
  test("Output safety", "caller metadata cannot bypass the output projection", () => {
    const provider = { ...trace({ mood: "Safe story" }).story, sourceLabel: "/srv/private/source.txt", dependencies: ["/opt/private.txt"] };
    const r = good(model.traceWorksCandidate({ field: "story.body", state: { mode: "inherit" }, inheritProvider: { providerKey: "product.story", trace: provider } }));
    assert.ok(!JSON.stringify(r).includes("/srv/")); assert.ok(!JSON.stringify(r).includes("/opt/"));
    assert.equal(r.bindingStatus, "MODEL_ONLY");
  });
  test("Output safety", "unsafe provider step rejected without leaking its text", () => {
    const provider = { ...trace({ mood: "Safe story" }).story, steps: [{ sourceKey: "/srv/private/source.txt", disposition: "selected" as const, reason: "selected", index: 0 }] };
    const r = model.traceWorksCandidate({ field: "story.body", state: { mode: "inherit" }, inheritProvider: { providerKey: "product.story", trace: provider } });
    bad(r); assert.ok(!JSON.stringify(r).includes("/srv/"));
  });

  test("Output safety", "URL-like wrapper cannot conceal a Windows filesystem reference", () => {
    const text = "https://example.com/F:\\secret\\file.txt";
    redacted(model.traceWorksArtwork({ mood: text }), text);
  });

  // FIX M2: expected layer depths and branch keys are fixture data, not model-derived.
  const seoLayerCases = [
    { name: "A role primary + resource primary", p: { pageLayout: { heroAsset: "chosen" }, assets: { chosen: img("a") } },
      role: 0, resource: 0, key: "product.assets.chosen.path", mode: "hero", path: "/uploads/a.webp", assetRole: "chosen" },
    { name: "B Hero role + inner fallback", p: { pageLayout: { heroAsset: "missing" }, assets: { hero: img("b") } },
      role: 0, resource: 1, key: "product.assets.hero.path", mode: "hero", path: "/uploads/b.webp", assetRole: "hero" },
    { name: "C outer fallback + resource primary", p: { pageLayout: { heroAsset: "missing", productAsset: "chosen" }, assets: { chosen: img("c") } },
      role: 1, resource: 0, key: "product.assets.chosen.path", mode: "product", path: "/uploads/c.webp", assetRole: "chosen" },
    { name: "D outer + inner fallback", p: { pageLayout: { heroAsset: "missing", productAsset: "missingProduct" }, assets: { productPhoto: img("d") } },
      role: 1, resource: 1, key: "product.assets.productPhoto.path", mode: "product", path: "/uploads/d.webp", assetRole: "productPhoto" },
    { name: "E List final fallback", p: { pageLayout: { heroAsset: "missing", productAsset: "missingProduct", listAsset: "chosen" }, assets: { chosen: img("e") } },
      role: 2, resource: 0, key: "product.assets.chosen.path", mode: "list", path: "/uploads/e.webp", assetRole: "chosen" },
  ] as const;
  for (const fixture of seoLayerCases) test("SEO fallback layers", fixture.name, () => {
    const t = oracleChecks(fixture.p, []).seoImage;
    assert.deepEqual(t.effectiveValue, { role: fixture.assetRole, path: fixture.path });
    assert.equal(t.sourceKey, fixture.key);
    assert.deepEqual(t.fallbackLayers, { roleFallbackDepth: fixture.role, resourceFallbackDepth: fixture.resource });
    assert.equal(t.fallbackDepth, fixture.role + fixture.resource);
    assert.equal(t.isFallback, fixture.role > 0 || fixture.resource > 0);
    assert.equal(t.selectionMode, fixture.mode); assert.equal(t.bindingStatus, "PARITY_VERIFIED");
    assert.equal(t.steps.at(-1)?.sourceKey, fixture.key); assert.equal(t.steps.at(-1)?.disposition, "selected");
    assert.ok(t.dependencies.includes(fixture.key)); assert.equal(t.media?.loadStatus, "UNKNOWN_SERVER_SIDE");
  });
  test("SEO fallback layers", "known Hero missing-role reproduction keeps inner history", () => {
    const t = trace(seoLayerCases[1].p).seoImage;
    assert.deepEqual(t.steps, [
      { sourceKey: "product.assets.missing", disposition: "skipped", reason: "no-static-image", index: 0 },
      { sourceKey: "product.assets.hero.path", disposition: "selected", reason: "static-asset", index: 1 },
    ]);
    assert.deepEqual(t.dependencies, ["product.assets.missing", "product.assets.hero.path"]);
  });
  test("SEO fallback layers", "outer + inner failure preserves every attempted source", () => {
    const t = trace(seoLayerCases[3].p).seoImage;
    assert.deepEqual(t.steps.map(v => [v.sourceKey, v.disposition]), [
      ["product.assets.missing", "skipped"], ["product.assets.hero", "skipped"], ["resolver.heroAsset", "skipped"],
      ["product.assets.missingProduct", "skipped"], ["product.assets.productPhoto.path", "selected"],
    ]);
    assert.ok(t.dependencies.includes("product.assets.missingProduct"));
  });
  test("SEO fallback layers", "List retains complete failed Hero and Product history", () => {
    const t = trace(seoLayerCases[4].p).seoImage;
    assert.deepEqual(t.steps.map(v => v.sourceKey), [
      "product.assets.missing", "product.assets.hero", "resolver.heroAsset",
      "product.assets.missingProduct", "product.assets.productPhoto", "product.assets.mainVisual", "product.cover", "product.poster", "resolver.productAsset",
      "product.assets.chosen.path",
    ]);
  });
  test("SEO fallback layers", "F all absent is safe and retains exhausted histories", () => {
    const t = oracleChecks({ pageLayout: { heroAsset: "missingHero", productAsset: "missingProduct", listAsset: "missingList" } }, []).seoImage;
    assert.equal(t.effectiveValue, null); assert.equal(t.hasValue, false); assert.equal(t.sourceOwner, "ABSENT");
    assert.deepEqual(t.fallbackLayers, { roleFallbackDepth: 3, resourceFallbackDepth: null });
    assert.equal(t.fallbackDepth, 3); assert.equal(t.isFallback, true); assert.equal(t.visibility, "empty");
    assert.deepEqual(t.steps.map(v => v.sourceKey), [
      "product.assets.missingHero", "product.assets.hero", "resolver.heroAsset",
      "product.assets.missingProduct", "product.assets.productPhoto", "product.assets.mainVisual", "product.cover", "product.poster", "resolver.productAsset",
      "product.assets.missingList", "product.assets.artworkCover", "product.assets.mainVisual", "product.cover", "product.poster", "resolver.listAsset",
    ]);
    assert.ok(t.steps.every(v => v.disposition === "skipped")); assert.equal(t.media, null);
  });
  test("SEO fallback layers", "inner fallback depth greater than one is preserved", () => {
    const p = { pageLayout: { heroAsset: "missing", productAsset: "missingProduct" }, assets: { mainVisual: img("main") } };
    const t = oracleChecks(p, []).seoImage;
    assert.deepEqual(t.fallbackLayers, { roleFallbackDepth: 1, resourceFallbackDepth: 2 });
    assert.equal(t.fallbackDepth, 3); assert.equal(t.sourceKey, "product.assets.mainVisual.path"); assert.equal(t.isFallback, true);
  });
  test("SEO fallback layers", "same URL never substitutes a different source", () => {
    const p = { pageLayout: { heroAsset: "chosen" }, assets: { chosen: img("same"), hero: img("same") } };
    const t = oracleChecks(p, []).seoImage;
    assert.equal(t.sourceKey, "product.assets.chosen.path"); assert.equal(t.isFallback, false);
    assert.deepEqual(t.fallbackLayers, { roleFallbackDepth: 0, resourceFallbackDepth: 0 });
  });
  test("SEO fallback layers", "poster source remains exact without changing the image value", () => {
    const p = { pageLayout: { heroAsset: "missing" }, assets: { hero: { path: "/uploads/raw.webp", media: { type: "image", url: "/uploads/full.webp", posterUrl: "/uploads/poster.webp" } } } };
    const t = oracleChecks(p, []).seoImage;
    assert.equal(t.sourceKey, "product.assets.hero.media.posterUrl");
    assert.deepEqual(t.effectiveValue, { role: "hero", path: "/uploads/poster.webp" });
    assert.deepEqual(t.fallbackLayers, { roleFallbackDepth: 0, resourceFallbackDepth: 1 });
  });
  test("SEO fallback layers", "layers are detached and do not promote the Hero model", () => {
    const p = freeze(seoLayerCases[3].p); const before = JSON.stringify(p); const t = trace(p);
    assert.equal(t.heroMedia.bindingStatus, "MODEL_ONLY"); assert.equal(t.heroMedia.fallbackLayers, null);
    t.seoImage.fallbackLayers!.roleFallbackDepth = 20;
    assert.equal(trace(p).seoImage.fallbackLayers!.roleFallbackDepth, 1); assert.equal(JSON.stringify(p), before);
  });

  // FIX2: independently declared delimiter corpus, not derived from production helpers.
  const delimiterPairs = [
    ['"', '"'], ["'", "'"], ["“", "”"], ["‘", "’"], ["「", "」"], ["『", "』"],
    ["【", "】"], ["〈", "〉"], ["《", "》"], ["(", ")"], ["[", "]"], ["{", "}"], ["（", "）"], ["［", "］"],
  ] as const;
  function boundaryRejected(result: TraceResult<unknown>, unsafeText: string) {
    bad(result);
    if (!result.ok) {
      assert.equal(result.errors.length, 1);
      assert.equal(result.errors[0].code, "UNSAFE_OR_UNSUPPORTED_SNAPSHOT");
      assert.equal(result.errors[0].message, "The data snapshot cannot be safely traced; no alternative winner was invented.");
      const output = JSON.stringify(result);
      assert.ok(!output.includes(unsafeText)); assert.ok(!output.includes("/srv/"));
      assert.ok(!output.includes("/opt/")); assert.ok(!output.includes("/mnt/"));
      assert.ok(!output.includes(process.cwd())); assert.ok(!output.includes("stack"));
    }
  }
  for (const [open, close] of delimiterPairs) {
    test("Unicode boundaries", "surrounded POSIX path " + open + close, () => {
      const value = "Source " + open + "/srv/private/a.txt" + close + " for this artwork";
      const p = freeze({ mood: value }); const before = JSON.stringify(p);
      boundaryRejected(model.traceWorksArtwork(p), value); assert.equal(JSON.stringify(p), before);
    });
    test("Root and prose", "quoted root " + open + close, () => {
      boundaryRejected(model.traceWorksArtwork({ mood: open + "/" + close }), "/");
    });
    test("Public resource boundaries", "quoted HTTPS/public assets " + open + close, () => {
      for (const url of ["https://example.com/mnt/a.webp", "https://example.com/srv/a.webp", "/uploads/a.webp", "/assets/a.webp"]) {
        const value = "Image " + open + url + close + " is public";
        assert.equal(trace({ mood: value }).story.effectiveValue, value);
      }
    });
  }
  const independentDelimiters = [...new Set(delimiterPairs.flat())];
  for (const delimiter of independentDelimiters) test("Unicode boundaries", "leading delimiter " + delimiter, () => {
    boundaryRejected(model.traceWorksArtwork({ mood: "Source" + delimiter + "/opt/private/a.txt" + delimiter + "text" }), "/opt/private/a.txt");
  });
  for (const separator of [" ", "\t", "\n", "\u00a0", "\u2028"]) test("Unicode boundaries", "Unicode whitespace " + JSON.stringify(separator), () => {
    boundaryRejected(model.traceWorksArtwork({ mood: "Source" + separator + "/mnt/private/a.txt" + separator + "details" }), "/mnt/private/a.txt");
  });
  for (const delimiter of ["：", "；", "！", "、", "，", "。", "=", "։"]) test("Unicode boundaries", "token punctuation " + delimiter, () => {
    boundaryRejected(model.traceWorksArtwork({ mood: "Source" + delimiter + "/srv/private/a.txt" }), "/srv/private/a.txt");
  });
  for (const value of [
    "/", " / ", "\t/\n", "/.", "/..", "/../", "//",
  ]) test("Root and prose", "whole root or absolute dot form", () => boundaryRejected(model.traceWorksArtwork({ mood: value }), value));
  for (const value of [
    "coffee / art", "and/or", "A/B test", "A/B", "12/24", "作品／商品", "light/medium roast",
    "咖啡 / 藝術", "淺焙/中焙", "A/B 測試", "12/24 小時", "風味／香氣",
    "https://example.com/path/file", "作品（圖片/影片）",
  ]) test("Root and prose", "normal Owner text", () => {
    const p = freeze({ mood: value }); const before = JSON.stringify(p);
    assert.equal(trace(p).story.effectiveValue, value); assert.equal(JSON.stringify(p), before);
  });
  const reproducedUnicodeText = [
    "See “/srv/private/a.txt” for details", "來源「/opt/app/a.txt」供查閱", "See ‘/mnt/data/a.txt’ for details",
  ] as const;
  for (const value of reproducedUnicodeText) {
    const fixtures: [string, Fixture][] = [
      ["story", { mood: value }],
      ["flavor", { flavors: ["floral"], productPageContent: { "flavor-notes": { description: value } } }],
      ["Gallery caption", { assets: { label: { path: "/uploads/a.webp", caption: value } } }],
      ["Roasted Beans caption", rb({ path: "/uploads/a.webp", caption: value })],
    ];
    for (const [surface, input] of fixtures) test("Unicode surfaces", surface + " reproduced quote", () => {
      const p = freeze(input); const before = JSON.stringify(p);
      boundaryRejected(model.traceWorksArtwork(p), value); assert.equal(JSON.stringify(p), before);
    });
    test("Unicode surfaces", "explicit candidate reproduced quote", () => {
      const input = freeze({ field: "story.body", state: { mode: "value", value } }); const before = JSON.stringify(input);
      boundaryRejected(model.traceWorksCandidate(input), value); assert.equal(JSON.stringify(input), before);
    });
    test("Unicode surfaces", "inherit candidate reproduced quote", () => {
      const provider = { ...trace({ mood: "Safe story" }).story, effectiveValue: value };
      const input = freeze({ field: "story.body", state: { mode: "inherit" }, inheritProvider: { providerKey: "product.story", trace: provider } }); const before = JSON.stringify(input);
      boundaryRejected(model.traceWorksCandidate(input), value); assert.equal(JSON.stringify(input), before);
    });
  }
  for (const mode of ["value", "inherit"] as const) test("Unicode surfaces", "candidate root " + mode, () => {
    const provider = { ...trace({ mood: "Safe story" }).story, effectiveValue: "/" };
    const input = freeze({ field: "story.body", state: mode === "value" ? { mode, value: "/" } : { mode },
      inheritProvider: { providerKey: "product.story", trace: provider } }); const before = JSON.stringify(input);
    boundaryRejected(model.traceWorksCandidate(input), "/"); assert.equal(JSON.stringify(input), before);
  });
  for (const value of [
    "“F:\\private\\a.txt”", "「C:/private/a.txt」", "『\\\\server\\share\\a.txt』", "【//server/share/a.txt】",
  ]) test("Unicode boundaries", "Windows/UNC quoted", () => boundaryRejected(model.traceWorksArtwork({ mood: value }), value));
  for (const value of [
    "“https://example.com/a.webp”「/srv/private/a.txt」",
    "https://example.com/a.webp」/opt/private/a.txt",
    "（https://example.com/a.webp）『/mnt/private/a.txt』",
  ]) test("Unicode boundaries", "quoted URL must not mask an adjacent filesystem token", () => boundaryRejected(model.traceWorksArtwork({ mood: value }), value));
  for (const value of [
    "debug source: 「/uploads/../private/file」", "debug source: “/uploads/%2e%2e%2fprivate/file”",
  ]) test("Unicode boundaries", "quoted public-prefix traversal", () => boundaryRejected(model.traceWorksArtwork({ mood: value }), value));
  for (const value of [
    "https://example.com/image.webp", "https://example.com/mnt/image.webp", "https://example.com/srv/image.webp",
    "http://example.com/assets/a.jpg", "/uploads/test.webp", "/assets/test.webp",
  ]) test("Public resource boundaries", "public reference contract", () => {
    assert.equal(trace({ mood: value }).story.effectiveValue, value);
    const mediaResult = model.traceWorksArtwork({ pageLayout: { heroAsset: "hero" }, assets: { hero: { path: value } } });
    if (value.startsWith("http:")) boundaryRejected(mediaResult, value);
    else assert.equal(good(mediaResult).seoImage.media?.configured?.url, value);
  });

  const canonicalUrl = new URL("../public/data/website-data.json", import.meta.url); const ownerUrl = new URL("../public/data/homepage.json", import.meta.url);
  const bytes = readFileSync(canonicalUrl); const ownerBefore = readFileSync(ownerUrl); const canonical = freeze(JSON.parse(bytes.toString("utf8"))); const products = canonical.menu.products as Fixture[];
  const before = JSON.stringify(canonical);
  test("Canonical legacy", "current baseline count derived as 25", () => assert.equal(products.length, 25));
  for (let i = 0; i < products.length; i++) test("Canonical legacy", "Product " + (i + 1) + " applicable legacy parity", () => {
    const p = products[i]; assert.equal(Object.hasOwn(p, "worksPage"), false); const t = oracleChecks(p, products); assert.equal(Object.hasOwn(p, "worksPage"), false);
    for (const [key, v] of Object.entries(t)) { assert.equal(v.isLegacy, true); assert.equal(v.bindingStatus, key === "heroMedia" ? "MODEL_ONLY" : "PARITY_VERIFIED"); }
  });
  test("Canonical legacy", "data unchanged and no writes", () => { assert.equal(JSON.stringify(canonical), before); assert.deepEqual(readFileSync(canonicalUrl), bytes); assert.deepEqual(readFileSync(ownerUrl), ownerBefore); assert.equal(createHash("sha256").update(readFileSync(canonicalUrl)).digest("hex"), createHash("sha256").update(bytes).digest("hex")); });
  test("Canonical legacy", "no real network calls including pure module loading", () => assert.equal(networkCalls, 0));
} finally { globalThis.fetch = networkBefore; }
console.log("W3.2A-1 EXACT SOURCE TRACE");
for (const g of groups) console.log(g + ": " + counts[g].pass + " PASS / " + counts[g].fail + " FAIL");
const passed = groups.reduce((n, g) => n + counts[g].pass, 0), failed = groups.reduce((n, g) => n + counts[g].fail, 0);
console.log("TOTAL: " + passed + " PASS / " + failed + " FAIL"); if (failed) process.exitCode = 1;
