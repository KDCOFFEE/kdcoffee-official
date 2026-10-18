import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
// @ts-expect-error -- Native Node strip-types requires explicit source extensions (repository convention).
import { WORKS_AMBIGUOUS_COPY_IDS, WORKS_CONTRACT_VERSION, WORKS_FIELD_REGISTRY, WORKS_MANAGED_FIELDS, WORKS_READ_GROUPS } from "../lib/worksArtworkContract.ts";
// @ts-expect-error -- Native Node strip-types requires explicit source extensions (repository convention).
import { validateWorksCommand, validateWorksFieldState, validateWorksJson, validateWorksState, validateWorksValue } from "../lib/worksArtworkValidation.ts";
// @ts-expect-error -- Native Node strip-types requires explicit source extensions (repository convention).
import { resolveWorksField, resolveWorksFields } from "../lib/worksArtworkResolver.ts";
// @ts-expect-error -- Native Node strip-types requires explicit source extensions (repository convention).
import { projectWorksArtwork, worksLegacyTextValues } from "../lib/worksArtworkReadModel.ts";
// @ts-expect-error -- Native Node strip-types requires explicit source extensions (repository convention).
import { modelWorksWrite } from "../lib/worksArtworkWriteModel.ts";
import type { WorksDefaults, WorksManagedField, WorksResult, WorksValue } from "../lib/worksArtworkContract.ts";

const groups = ["Value semantics", "Legacy compatibility", "Ownership safety", "Read model", "Write model", "Fallback contract", "Canonical legacy safety", "JSON hardening", "Array safety"] as const;
type Group = typeof groups[number];
const counts = Object.fromEntries(groups.map((name) => [name, { pass: 0, fail: 0 }])) as Record<Group, { pass: number; fail: number }>;
function test(group: Group, name: string, run: () => void): void {
  try { run(); counts[group].pass++; }
  catch (error) { counts[group].fail++; console.error(`FAIL ${group}: ${name}: ${error instanceof Error ? error.message.split("\n")[0] : "assertion failed"}`); }
}
function good<T>(result: WorksResult<T>): T { if (!result.ok) throw new Error(result.errors.map((item) => item.code).join(",")); return result.value; }
function bad(result: WorksResult<unknown>, code?: string): void {
  assert.equal(result.ok, false); if (!result.ok && code !== undefined) assert.ok(result.errors.some((item) => item.code === code), `Expected ${code}`);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "value"), false, "Failed commands must not expose partial candidates");
}
function freeze<T>(value: T): T { if (value !== null && typeof value === "object" && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
const explicit = (value: unknown) => ({ mode: "value", value });
const state = (fields: Record<string, unknown> = {}, revision = 0) => ({ contractVersion: WORKS_CONTRACT_VERSION, revision, fields });
const operation = (field: string, next: unknown, scope = "updateEditorialContent") => ({ scope, field, state: next });
const command = (operations: readonly unknown[] = [operation("story.body", explicit("New story"))], extra: Record<string, unknown> = {}) => ({ targetRef: "artwork-1", contractVersion: WORKS_CONTRACT_VERSION, expectedWorksRevision: 0, expectedEditToken: "source-token-1", requestId: "request-0001", operations, ...extra });
const context = freeze({ targetRef: "artwork-1", currentEditToken: "source-token-1" });
const source = freeze({ id: "artwork-1", sku: "ART-001", slug: "artwork-one", name: "Artwork", nameEn: "Artwork English", artist: "Artist", tag: "New", origin: "Origin", process: "Washed", roast: "Light", variety: "Variety", altitude: "1800m", flavors: ["Citrus"], shortCopy: "Short copy", subtitle: "Subtitle", mood: "Legacy story", unknownExtension: { retain: [1, 2] } });
const sourceBefore = JSON.stringify(source);
const networkBefore = globalThis.fetch; let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("Network is forbidden in this suite"); };
try {
  const semanticCases: readonly [WorksManagedField, WorksValue][] = [
    ["story.body", ""], ["presentation.visible", false], ["presentation.spacing", 0], ["relatedWorks.items", []], ["hero.media", null],
  ];
  for (const [field, value] of semanticCases) {
    test("Value semantics", `${field} keeps explicit ${JSON.stringify(value)}`, () => {
      const result = good(resolveWorksField({ field, legacyValue: "legacy", state: explicit(value) }));
      assert.equal(result.semantic, "explicit"); assert.equal(result.hasValue, true); assert.deepEqual(result.value, value); assert.equal(result.source.owner, "WORKS");
      assert.deepEqual(JSON.parse(JSON.stringify(good(validateWorksFieldState(field, explicit(value))))), explicit(value));
    });
  }
  test("Value semantics", "missing keeps legacy", () => { const v = good(resolveWorksField({ field: "story.body", legacyValue: "old" })); assert.equal(v.semantic, "legacy"); assert.equal(v.value, "old"); });
  test("Value semantics", "missing source and explicit null are distinguishable", () => { const absent = good(resolveWorksField({ field: "hero.media" })); const none = good(resolveWorksField({ field: "hero.media", state: explicit(null) })); assert.equal(absent.hasValue, false); assert.equal(none.hasValue, true); assert.equal(absent.value, none.value); assert.notEqual(absent.semantic, none.semantic); });
  test("Value semantics", "inherit uses registered source", () => { const v = good(resolveWorksField({ field: "story.body", legacyValue: "old local", state: { mode: "inherit" }, defaults: { "story.body": "registered default" } })); assert.equal(v.value, "registered default"); assert.equal(v.semantic, "inherit"); assert.deepEqual(v.source, { owner: "PRODUCT", key: "product.story" }); });
  test("Value semantics", "inherit preserves zero", () => assert.equal(good(resolveWorksField({ field: "presentation.spacing", state: { mode: "inherit" }, defaults: { "presentation.spacing": 0 } })).value, 0));
  test("Value semantics", "inherit needs provider", () => bad(resolveWorksField({ field: "story.body", legacyValue: "must not return", state: { mode: "inherit" } }), "DEFAULT_UNAVAILABLE"));
  for (const value of [null, undefined, {}, { mode: "clear" }, { mode: "value" }, { mode: "inherit", value: "extra" }, { mode: "value", value: "x", extra: true }]) test("Value semantics", "invalid state is an error", () => bad(resolveWorksField({ field: "story.body", legacyValue: "must not return", state: value })));
  for (const field of ["story.body", "presentation.visible", "presentation.spacing", "relatedWorks.items"]) test("Value semantics", `${field} rejects illegal null`, () => bad(validateWorksFieldState(field, explicit(null)), "INVALID_VALUE"));
  test("Value semantics", "whitespace is rejected rather than removed", () => bad(validateWorksFieldState("story.body", explicit(" \n\t ")), "INVALID_VALUE"));
  test("Value semantics", "meaningful text whitespace is preserved", () => assert.equal(good(validateWorksFieldState("story.body", explicit("  Paragraph\n\nNext  "))).mode === "value" && good(resolveWorksField({ field: "story.body", state: explicit("  Paragraph\n\nNext  ") })).value, "  Paragraph\n\nNext  "));
  for (const value of [-1, 241, 0.5, NaN, Infinity, "0"]) test("Value semantics", "numeric bounds and type", () => bad(validateWorksValue("presentation.spacing", value)));
  test("Value semantics", "enum whitelist", () => bad(validateWorksValue("animation.preset", "execute-js")));
  test("Value semantics", "text length", () => bad(validateWorksValue("story.heading", "字".repeat(121))));
  test("Value semantics", "array bound", () => bad(validateWorksValue("relatedWorks.items", ["a", "b", "c", "d"])));
  test("Value semantics", "duplicate references", () => bad(validateWorksValue("relatedWorks.items", ["a", "a"])));
  test("Value semantics", "references are not URLs or filesystem paths", () => bad(validateWorksValue("hero.media", "F:\\private\\file")));
  test("Value semantics", "required search title rejects empty", () => bad(validateWorksValue("search.title", "")));
  test("Value semantics", "HTML/control input", () => { bad(validateWorksValue("story.body", "<script>x</script>")); bad(validateWorksValue("story.body", "text\u0000")); });
  test("Value semantics", "namespace version", () => bad(validateWorksState({ contractVersion: 2, revision: 0, fields: {} }), "CONTRACT_VERSION"));
  test("Value semantics", "namespace illegal null", () => bad(validateWorksState(null)));
  test("Value semantics", "namespace unknown fields", () => bad(validateWorksState(state({ "future.unknown": explicit("x") })), "UNKNOWN_FIELD"));

  test("Legacy compatibility", "reading old Product does not initialise Works", () => { const result = good(projectWorksArtwork({ product: source })); assert.equal(result.systemInfo.worksRevision, 0); assert.equal(result.editorialContent.storyBody.semantic, "legacy"); assert.equal(result.editorialContent.storyBody.value, "Legacy story"); assert.equal(Object.hasOwn(source, "worksPage"), false); });
  test("Legacy compatibility", "namespace does not take over unmanaged fields", () => { const product = { name: "Artwork", mood: "old", shortCopy: "hero", worksPage: state({ "story.body": explicit("") }, 1) }; const result = good(projectWorksArtwork({ product })); assert.equal(result.editorialContent.storyBody.value, ""); assert.equal(result.editorialContent.heroSupportingCopy.value, "hero"); assert.equal(result.editorialContent.heroSupportingCopy.semantic, "legacy"); });
  test("Legacy compatibility", "first save records only one field", () => { const v = good(modelWorksWrite(context, command())); assert.deepEqual(Object.keys(v.state.fields), ["story.body"]); assert.deepEqual(Object.keys(v.state).sort(), ["contractVersion", "fields", "revision"]); });
  test("Legacy compatibility", "clear does not restore mood", () => assert.equal(good(projectWorksArtwork({ product: { mood: "mood", shortCopy: "short", subtitle: "subtitle", worksPage: state({ "story.body": explicit("") }) } })).editorialContent.storyBody.value, ""));
  test("Legacy compatibility", "restore is different from deleting field state", () => { const old = good(resolveWorksFields({ legacyValues: { "story.body": "old local" }, worksState: state() })); const restored = good(resolveWorksFields({ legacyValues: { "story.body": "old local" }, worksState: state({ "story.body": { mode: "inherit" } }), defaults: { "story.body": "default" } })); assert.equal(old.fields["story.body"].value, "old local"); assert.equal(restored.fields["story.body"].value, "default"); });
  test("Legacy compatibility", "legacy empty is not mistaken for new override", () => { const v = good(resolveWorksField({ field: "story.body", legacyValue: "" })); assert.equal(v.semantic, "legacy"); assert.equal(v.value, ""); });
  test("Legacy compatibility", "bad namespace does not fallback", () => bad(projectWorksArtwork({ product: { mood: "old", worksPage: { contractVersion: 99, revision: 0, fields: {} } } }), "CONTRACT_VERSION"));
  test("Legacy compatibility", "present undefined namespace is invalid", () => bad(projectWorksArtwork({ product: { worksPage: undefined } })));
  test("Legacy compatibility", "legacy text chain", () => { assert.equal(worksLegacyTextValues({ mood: "", shortCopy: "short", subtitle: "sub" })["story.body"], "short"); assert.equal(worksLegacyTextValues({ mood: "", shortCopy: "", subtitle: "sub" })["story.body"], "sub"); });
  test("Legacy compatibility", "all pure calls preserve original Product", () => assert.equal(JSON.stringify(source), sourceBefore));

  const forbidden = ["name", "nameEn", "artist", "tag", "origin", "process", "roast", "variety", "altitude", "flavors", "shortCopy", "subtitle", "mood", "price", "SKU", "sku", "skus", "purchase", "stock", "purchasable", "status", "active", "inMonthlyMenu", "publish", "featured", "pvValue", "id", "artworkSku", "slug", "sectionIds", "revision", "product", "rawProduct", "assets", "rawAssets", "productPageContent", "media.alt", "media.title", "media.caption", "siteContent", "site.brand", "site.address"];
  for (const field of forbidden) test("Ownership safety", `reject ${field}`, () => bad(modelWorksWrite(context, command([operation(field, explicit("FORBIDDEN"))])), "FORBIDDEN_FIELD"));
  for (const id of WORKS_AMBIGUOUS_COPY_IDS) test("Ownership safety", `ambiguous copy ${id}`, () => { assert.equal(WORKS_FIELD_REGISTRY[`copy.${id}`].owner, null); assert.equal(WORKS_FIELD_REGISTRY[`copy.${id}`].writable, false); bad(modelWorksWrite(context, command([operation(`copy.${id}`, explicit("BLOCKED"))])), "AMBIGUOUS_COPY"); });
  for (const key of ["__proto__", "constructor", "prototype"]) test("Ownership safety", `prototype key ${key}`, () => { const poisoned = JSON.parse(`{"mode":"value","value":{"${key}":{}}}`); bad(validateWorksFieldState("story.body", poisoned), "PROTOTYPE_KEY"); bad(modelWorksWrite(context, command([operation(key, explicit("x"))]))); });
  test("Ownership safety", "prototype custom object", () => bad(validateWorksJson(Object.create({ injected: true })), "NON_JSON_VALUE"));
  test("Ownership safety", "accessor cannot execute", () => { let called = false; const x = Object.defineProperty({}, "mode", { enumerable: true, get() { called = true; return "inherit"; } }); bad(validateWorksFieldState("story.body", x), "NON_JSON_VALUE"); assert.equal(called, false); });
  test("Ownership safety", "undefined/function/nonfinite values", () => { for (const value of [undefined, () => 1, Symbol("x"), BigInt(1), NaN]) bad(validateWorksJson(value), "NON_JSON_VALUE"); });
  test("Ownership safety", "frozen registry cannot be changed", () => { assert.ok(Object.isFrozen(WORKS_FIELD_REGISTRY)); assert.ok(Object.isFrozen(WORKS_FIELD_REGISTRY["story.body"])); });
  for (const [scope, field, value] of [["updateMediaRoles", "hero.media", null], ["updateRelatedWorks", "relatedWorks.items", []], ["updatePresentation", "presentation.spacing", 0], ["updateAnimation", "animation.enabled", false], ["updateSearchOverrides", "search.description", ""]] as const) test("Ownership safety", `${scope} explicitly unsupported`, () => bad(modelWorksWrite(context, command([operation(field, explicit(value), scope)])), "SCOPE_UNSUPPORTED"));

  const markers = ["MEMBER_PRIVATE_SENTINEL", "ORDER_PRIVATE_SENTINEL", "AUTH_PRIVATE_SENTINEL", "CREDENTIAL_PRIVATE_SENTINEL", "COMMERCE_PRIVATE_SENTINEL", "REFERRAL_PRIVATE_SENTINEL", "HISTORY_PRIVATE_SENTINEL", "ASSET_PATH_PRIVATE_SENTINEL"];
  const injected = freeze({ id: "artwork-1", sku: "ART-001", slug: "artwork-one", name: "Safe name", flavors: ["Safe flavour"], members: markers[0], orders: markers[1], auth: markers[2], credentials: markers[3], commerceState: markers[4], referral: markers[5], history: markers[6], assets: { hero: { path: markers[7] } }, unknown: "UNKNOWN_PRIVATE_SENTINEL", skus: [{ id: "internal-sku", stock: 123, pvValue: 999 }], productCustomSections: [{ id: "section-1", secret: "SECTION_PRIVATE_SENTINEL" }] });
  test("Read model", "explicit ten safe groups", () => assert.deepEqual(Object.keys(good(projectWorksArtwork({ product: injected }))), [...WORKS_READ_GROUPS]));
  test("Read model", "sensitive/internal/unknown properties omitted", () => { const out = JSON.stringify(good(projectWorksArtwork({ product: injected }))); for (const marker of [...markers, "UNKNOWN_PRIVATE_SENTINEL", "SECTION_PRIVATE_SENTINEL", "internal-sku"]) assert.ok(!out.includes(marker)); assert.ok(!out.includes('"pvValue"')); });
  test("Read model", "identifiers separated", () => { const v = good(projectWorksArtwork({ product: injected })); assert.deepEqual(Object.keys(v.identity), ["name", "nameEn", "artist", "tag"]); assert.equal(v.systemInfo.productId, "artwork-1"); assert.deepEqual(v.systemInfo.sectionIds, ["section-1"]); assert.equal(Object.hasOwn(v.identity, "slug"), false); });
  test("Read model", "commerce is display-only explicit projection", () => { const v = good(projectWorksArtwork({ product: injected, commerceSummary: { priceText: "NT$ 700", availability: "sold_out", variantLabels: ["250g"], stock: 123, mutation: "MUTATION_SENTINEL", pvValue: 999 } })); assert.deepEqual(v.commerceSummary, { priceText: "NT$ 700", availability: "sold_out", variantLabels: ["250g"] }); });
  test("Read model", "no invented commerce readiness", () => assert.equal(good(projectWorksArtwork({ product: injected })).commerceSummary.availability, "unknown"));
  test("Read model", "filesystem data cannot become media ref", () => bad(projectWorksArtwork({ product: source, legacyValues: { "hero.media": "F:\\private\\image" } })));
  test("Read model", "filesystem data not emitted as system identity", () => { const v = good(projectWorksArtwork({ product: { id: "F:\\private", slug: "/data/private", sku: "file:///private" } })); assert.equal(v.systemInfo.productId, null); assert.equal(v.systemInfo.slug, null); assert.equal(v.systemInfo.artworkSku, null); });
  test("Read model", "filesystem value not accepted as price label", () => assert.equal(good(projectWorksArtwork({ product: {}, commerceSummary: { priceText: "F:\\private" } })).commerceSummary.priceText, null));
  test("Read model", "output arrays do not alias Product arrays", () => { const v = good(projectWorksArtwork({ product: source })); (v.productFacts.flavors as string[]).push("new"); assert.deepEqual(source.flavors, ["Citrus"]); });
  test("Read model", "projection never invokes extra getters", () => { let called = false; const p = Object.defineProperty({ name: "safe" }, "private", { get() { called = true; throw new Error("not allowed"); } }); assert.equal(good(projectWorksArtwork({ product: p })).identity.name, "safe"); assert.equal(called, false); });
  test("Read model", "explicit state provenance", () => { const v = good(projectWorksArtwork({ product: { worksPage: state({ "story.body": explicit("") }) } })); assert.equal(v.editorialContent.storyBody.semantic, "explicit"); assert.equal(v.editorialContent.storyBody.source.owner, "WORKS"); });
  test("Read model", "null source Product rejected", () => bad(projectWorksArtwork({ product: null }), "INVALID_PRODUCT"));

  test("Write model", "valid one-artwork candidate", () => { const v = good(modelWorksWrite(context, command())); assert.equal(v.targetRef, "artwork-1"); assert.equal(v.nextRevision, 1); assert.equal(v.requestId, "request-0001"); assert.deepEqual(v.state.fields, { "story.body": explicit("New story") }); });
  test("Write model", "expected revision match", () => assert.equal(good(modelWorksWrite({ targetRef: "artwork-1", currentEditToken: "source-token-1", currentState: state({ "closing.body": explicit("Keep") }, 7) }, command(undefined, { expectedWorksRevision: 7 }))).nextRevision, 8));
  test("Write model", "revision conflict", () => bad(modelWorksWrite(context, command(undefined, { expectedWorksRevision: 1 })), "REVISION_CONFLICT"));
  test("Write model", "edit token mismatch", () => bad(modelWorksWrite(context, command(undefined, { expectedEditToken: "old-token" })), "EDIT_TOKEN_CONFLICT"));
  test("Write model", "target mismatch", () => bad(modelWorksWrite(context, command(undefined, { targetRef: "artwork-2" })), "TARGET_CONFLICT"));
  for (const requestId of ["", "short", "../unsafe-request", null]) test("Write model", "request ID validation", () => bad(modelWorksWrite(context, command(undefined, { requestId })), "INVALID_REQUEST_ID"));
  test("Write model", "unknown scope", () => bad(modelWorksWrite(context, command([operation("story.body", explicit("x"), "writeEverything")])), "UNKNOWN_SCOPE"));
  test("Write model", "unknown path", () => bad(modelWorksWrite(context, command([operation("unknown.field", explicit("x"))])), "UNKNOWN_FIELD"));
  test("Write model", "scope mismatch", () => bad(modelWorksWrite(context, command([operation("hero.media", explicit(null))])), "FIELD_SCOPE"));
  test("Write model", "multiple allowed operations", () => { const v = good(modelWorksWrite(context, command([operation("story.body", explicit("")), operation("hero.supportingCopy", explicit("Intro")), operation("story.highlights", explicit([]))]))); assert.deepEqual(Object.keys(v.state.fields), ["story.body", "hero.supportingCopy", "story.highlights"]); assert.deepEqual(v.state.fields["story.highlights"], explicit([])); });
  test("Write model", "all-or-nothing failure", () => bad(modelWorksWrite(context, command([operation("story.body", explicit("valid")), operation("price", explicit(10))])), "FORBIDDEN_FIELD"));
  test("Write model", "duplicate field rejected", () => bad(modelWorksWrite(context, command([operation("story.body", explicit("a")), operation("story.body", explicit("b"))])), "DUPLICATE_FIELD"));
  test("Write model", "unknown envelope key", () => bad(modelWorksWrite(context, command(undefined, { rawProduct: { name: "no" } })), "UNKNOWN_KEY"));
  test("Write model", "empty operation list", () => bad(modelWorksWrite(context, command([])), "INVALID_OPERATIONS"));
  test("Write model", "bounded operation list", () => bad(modelWorksWrite(context, command(Array.from({ length: 33 }, () => operation("story.body", explicit("x"))))), "INVALID_OPERATIONS"));
  test("Write model", "unknown operation key", () => bad(modelWorksWrite(context, command([{ ...operation("story.body", explicit("x")), extra: true }])), "UNKNOWN_KEY"));
  test("Write model", "bad current state not overwritten", () => bad(modelWorksWrite({ targetRef: "artwork-1", currentEditToken: "source-token-1", currentState: null }, command())));
  test("Write model", "revision overflow", () => bad(modelWorksWrite({ targetRef: "artwork-1", currentEditToken: "source-token-1", currentState: state({}, Number.MAX_SAFE_INTEGER) }, command(undefined, { expectedWorksRevision: Number.MAX_SAFE_INTEGER })), "REVISION_LIMIT"));
  test("Write model", "no input aliases or unrelated changes", () => { const old = freeze(state({ "story.highlights": explicit(["Keep"]), "closing.body": explicit("Keep ending") }, 2)); const cmd = freeze(command([operation("story.body", explicit("New"))], { expectedWorksRevision: 2 })); const before = JSON.stringify({ old, cmd, source }); const v = good(modelWorksWrite({ targetRef: "artwork-1", currentEditToken: "source-token-1", currentState: old }, cmd)); const kept = v.state.fields["story.highlights"]; if (kept?.mode === "value") (kept.value as string[]).push("Candidate only"); assert.equal(JSON.stringify({ old, cmd, source }), before); assert.deepEqual(v.state.fields["closing.body"], explicit("Keep ending")); });
  test("Write model", "inherit is recorded not deleted", () => assert.deepEqual(good(modelWorksWrite(context, command([operation("story.body", { mode: "inherit" })]))).state.fields, { "story.body": { mode: "inherit" } }));
  test("Write model", "candidate is JSON-safe", () => { const v = good(modelWorksWrite(context, command())); assert.deepEqual(JSON.parse(JSON.stringify(v.state)), v.state); });

  const fallbackCases: readonly [WorksManagedField, WorksValue, WorksValue, WorksValue][] = [
    ["story.body", "mood fallback", "", "product default"], ["hero.supportingCopy", "shortCopy fallback", "", "product intro"],
    ["roastedBeans.caption", "legacy caption", "", "media caption"], ["roastedBeans.gallery", ["legacy-single"], [], ["default-photo"]],
    ["relatedWorks.items", ["auto-a", "auto-b"], [], ["default-a"]], ["relatedWorks.title", "也可以比較這三款", "", "Related works"],
    ["search.description", "product description", "", "site description"], ["hero.media", "legacy-hero", null, "default-hero"],
    ["cleanRoasting.media", ["legacy-video"], [], ["default-media"]],
  ];
  for (const [field, legacy, clear, defaultValue] of fallbackCases) {
    test("Fallback contract", `${field} legacy allowed`, () => assert.deepEqual(good(resolveWorksField({ field, legacyValue: legacy })).value, legacy));
    test("Fallback contract", `${field} explicit clear prevents resurrection`, () => { const v = good(resolveWorksField({ field, legacyValue: legacy, state: explicit(clear) })); assert.equal(v.semantic, "explicit"); assert.deepEqual(v.value, clear); });
    test("Fallback contract", `${field} restore chooses provider`, () => { const defaults = { [field]: defaultValue } as WorksDefaults; const v = good(resolveWorksField({ field, legacyValue: legacy, state: { mode: "inherit" }, defaults })); assert.deepEqual(v.value, defaultValue); assert.equal(v.semantic, "inherit"); });
  }
  for (const field of ["shortCopy", "subtitle", "mood"]) test("Fallback contract", `${field} stays Product-owned`, () => { assert.equal(good(resolveWorksField({ field, legacyValue: "" })).value, ""); bad(resolveWorksField({ field, legacyValue: "old", state: explicit("") }), "FORBIDDEN_FIELD"); });
  test("Fallback contract", "related ordering preserved", () => assert.deepEqual(good(resolveWorksField({ field: "relatedWorks.items", state: explicit(["third", "first"]) })).value, ["third", "first"]));
  test("Fallback contract", "resolver output arrays are detached", () => { const old = freeze(["legacy"]); const v = good(resolveWorksField({ field: "relatedWorks.items", legacyValue: old })); (v.value as string[]).push("new"); assert.deepEqual(old, ["legacy"]); });
  test("Fallback contract", "default source cannot supply illegal type", () => bad(resolveWorksField({ field: "hero.media", state: { mode: "inherit" }, defaults: { "hero.media": [] } }), "INVALID_VALUE"));

  // Independent H1/M1 fixtures: do not derive unsafe shapes from the registry.
  const rejectsStructurally = (run: () => WorksResult<unknown>): void => {
    let result: WorksResult<unknown> | undefined;
    assert.doesNotThrow(() => { result = run(); });
    assert.ok(result !== undefined);
    bad(result, "NON_JSON_VALUE");
    if (!result.ok) {
      assert.ok(result.errors.length > 0);
      for (const issue of result.errors) { assert.equal(typeof issue.code, "string"); assert.equal(typeof issue.path, "string"); }
    }
  };
  test("JSON hardening", "H1-A hidden own toJSON is not called", () => {
    let calls = 0; const value: unknown[] = [];
    Object.defineProperty(value, "toJSON", { value() { calls++; return []; }, enumerable: false });
    rejectsStructurally(() => validateWorksJson(value)); assert.equal(calls, 0);
  });
  test("JSON hardening", "H1-B throwing toJSON is never called", () => {
    let calls = 0; const value: unknown[] = [];
    Object.defineProperty(value, "toJSON", { value() { calls++; throw new Error("must not execute"); }, enumerable: false });
    rejectsStructurally(() => validateWorksJson(value)); assert.equal(calls, 0);
  });
  test("JSON hardening", "H1-C own getter is not read", () => {
    let calls = 0; const value = Object.defineProperty({}, "value", { get() { calls++; return "x"; }, enumerable: true });
    rejectsStructurally(() => validateWorksJson(value)); assert.equal(calls, 0);
  });
  test("JSON hardening", "H1-D throwing getter is never read", () => {
    let calls = 0; const value = Object.defineProperty({}, "value", { get() { calls++; throw new Error("must not execute"); }, enumerable: true });
    rejectsStructurally(() => validateWorksFieldState("story.body", value)); assert.equal(calls, 0);
  });
  test("JSON hardening", "H1-E nested throwing getter is never read", () => {
    let calls = 0; const nested = Object.defineProperty({}, "secret", { get() { calls++; throw new Error("must not execute"); }, enumerable: true });
    rejectsStructurally(() => validateWorksJson({ nested: [{ nested }] })); assert.equal(calls, 0);
  });
  test("JSON hardening", "hidden array toJSON getter is not read", () => {
    let calls = 0; const value = Object.defineProperty([], "toJSON", { get() { calls++; throw new Error("must not execute"); } });
    rejectsStructurally(() => validateWorksJson(value)); assert.equal(calls, 0);
  });
  test("JSON hardening", "enumerable object toJSON is not called", () => {
    let calls = 0; const value = { toJSON() { calls++; throw new Error("must not execute"); } };
    rejectsStructurally(() => validateWorksJson(value)); assert.equal(calls, 0);
  });
  test("JSON hardening", "setter is not invoked", () => {
    let calls = 0; const value = Object.defineProperty({}, "value", { set(_next: unknown) { calls++; }, enumerable: true });
    rejectsStructurally(() => validateWorksJson(value)); assert.equal(calls, 0);
  });
  for (const [name, value] of [["Date", new Date(0)], ["Map", new Map()], ["Set", new Set()], ["class", new (class Example { value = "x"; })()], ["boxed string", new String("x")]] as const) {
    test("JSON hardening", name + " rejected", () => rejectsStructurally(() => validateWorksJson(value)));
  }
  test("JSON hardening", "cycle returns structured failure", () => { const value: Record<string, unknown> = {}; value.self = value; rejectsStructurally(() => validateWorksJson(value)); });
  test("JSON hardening", "throwing reflection returns structured failure", () => { const proxy = Proxy.revocable({}, {}); proxy.revoke(); rejectsStructurally(() => validateWorksJson(proxy.proxy)); });
  test("JSON hardening", "plain data snapshot does not read Proxy get trap", () => {
    let calls = 0; const value = new Proxy({ mode: "value", value: "safe" }, { get() { calls++; throw new Error("must not read original"); } });
    assert.deepEqual(good(validateWorksFieldState("story.body", value)), explicit("safe")); assert.equal(calls, 0);
  });
  test("JSON hardening", "plain null-prototype data remains valid", () => { const value: Record<string, unknown> = Object.create(null); value.text = "safe"; assert.equal(good(validateWorksJson(value)), true); });
  test("JSON hardening", "hidden object data rejected", () => rejectsStructurally(() => validateWorksJson(Object.defineProperty({}, "hidden", { value: 1 }))));
  test("JSON hardening", "symbol object property rejected", () => rejectsStructurally(() => validateWorksJson({ [Symbol("hidden")]: "x" })));
  test("JSON hardening", "prototype keys remain forbidden", () => { for (const key of ["__proto__", "prototype", "constructor"]) bad(validateWorksJson(JSON.parse('{"' + key + '":1}')), "PROTOTYPE_KEY"); });
  const byteLimit = 50 * 1024;
  // The oracle serializes only trusted fixture primitives, never hostile values.
  for (const [name, unit] of [["ascii", "x"], ["quote", '"'], ["slash", "\\"], ["short controls", "\b\t\n\f\r"], ["escaped control", "\u0000"], ["Chinese", "漢"], ["surrogate pair", "😀"], ["unpaired high", "\ud800"], ["unpaired low", "\udc00"]] as const) {
    test("JSON hardening", "UTF-8 byte boundary: " + name, () => {
      const unitBytes = Buffer.byteLength(JSON.stringify(unit), "utf8") - 2;
      const value = unit.repeat(Math.floor((byteLimit - 2) / unitBytes));
      assert.ok(Buffer.byteLength(JSON.stringify(value), "utf8") <= byteLimit);
      assert.equal(good(validateWorksJson(value)), true);
      assert.ok(Buffer.byteLength(JSON.stringify(value + unit), "utf8") > byteLimit);
      bad(validateWorksJson(value + unit), "JSON_LIMIT");
    });
  }
  test("JSON hardening", "object punctuation and key escaping counted", () => {
    const key = '漢"\\'; const base = Buffer.byteLength(JSON.stringify({ [key]: "" }), "utf8");
    good(validateWorksJson({ [key]: "x".repeat(byteLimit - base) }));
    bad(validateWorksJson({ [key]: "x".repeat(byteLimit - base + 1) }), "JSON_LIMIT");
  });
  test("JSON hardening", "array punctuation counted", () => { good(validateWorksJson(["x".repeat(byteLimit - 4)])); bad(validateWorksJson(["x".repeat(byteLimit - 3)]), "JSON_LIMIT"); });
  test("JSON hardening", "bounded nested traversal", () => { let value: unknown = 1; for (let n = 0; n < 26; n++) value = { child: value }; bad(validateWorksJson(value), "JSON_LIMIT"); });

  test("Array safety", "M1-A Array(1) rejected", () => rejectsStructurally(() => validateWorksValue("relatedWorks.items", Array(1))));
  test("Array safety", "M1-B partial sparse array rejected", () => rejectsStructurally(() => validateWorksValue("relatedWorks.items", [, "x"])));
  test("Array safety", "M1-C dense references accepted and detached", () => { const input = ["third", "first"]; const out = good(validateWorksValue("relatedWorks.items", input)); assert.deepEqual(out, input); assert.notEqual(out, input); assert.deepEqual(JSON.parse(JSON.stringify(out)), input); });
  test("Array safety", "M1-D numeric accessor never executes", () => {
    let calls = 0; const input = Object.defineProperty([], "0", { enumerable: true, get() { calls++; throw new Error("must not execute"); } });
    rejectsStructurally(() => validateWorksValue("relatedWorks.items", input)); assert.equal(calls, 0);
  });
  test("Array safety", "M1-E custom array property rejected", () => { const input = ["x"]; Object.defineProperty(input, "custom", { enumerable: true, value: "extra" }); rejectsStructurally(() => validateWorksValue("relatedWorks.items", input)); });
  test("Array safety", "hidden custom array property rejected", () => { const input = ["x"]; Object.defineProperty(input, "custom", { value: "extra" }); rejectsStructurally(() => validateWorksValue("relatedWorks.items", input)); });
  test("Array safety", "symbol array property rejected", () => { const input = ["x"]; Object.defineProperty(input, Symbol("extra"), { value: "extra" }); rejectsStructurally(() => validateWorksValue("relatedWorks.items", input)); });
  test("Array safety", "hidden array index rejected", () => { const input = Object.defineProperty([], "0", { value: "x" }); rejectsStructurally(() => validateWorksValue("relatedWorks.items", input)); });
  test("Array safety", "array subclass rejected without species execution", () => {
    let calls = 0; class Custom extends Array<string> { static get [Symbol.species](): ArrayConstructor { calls++; throw new Error("must not execute"); } }
    rejectsStructurally(() => validateWorksValue("relatedWorks.items", new Custom("x"))); assert.equal(calls, 0);
  });
  for (const path of ["direct", "explicit", "inherit", "candidate"] as const) {
    test("Array safety", "M1-F sparse rejected through " + path, () => {
      const input: string[] = Array(1);
      if (path === "direct") rejectsStructurally(() => validateWorksValue("story.highlights", input));
      else if (path === "explicit") rejectsStructurally(() => validateWorksFieldState("story.highlights", explicit(input)));
      else if (path === "inherit") rejectsStructurally(() => resolveWorksField({ field: "story.highlights", state: { mode: "inherit" }, defaults: { "story.highlights": input } }));
      else rejectsStructurally(() => modelWorksWrite(context, command([operation("story.highlights", explicit(input))])));
    });
    test("Array safety", "accessor rejected through " + path, () => {
      let calls = 0; const input: string[] = [];
      Object.defineProperty(input, "0", { enumerable: true, get() { calls++; throw new Error("must not execute"); } });
      if (path === "direct") rejectsStructurally(() => validateWorksValue("story.highlights", input));
      else if (path === "explicit") rejectsStructurally(() => validateWorksFieldState("story.highlights", explicit(input)));
      else if (path === "inherit") rejectsStructurally(() => resolveWorksField({ field: "story.highlights", state: { mode: "inherit" }, defaults: { "story.highlights": input } }));
      else rejectsStructurally(() => modelWorksWrite(context, command([operation("story.highlights", explicit(input))])));
      assert.equal(calls, 0);
    });
    test("Array safety", "custom array hook rejected through " + path, () => {
      let calls = 0; const input: string[] = [];
      Object.defineProperty(input, "toJSON", { value() { calls++; throw new Error("must not execute"); } });
      if (path === "direct") rejectsStructurally(() => validateWorksValue("story.highlights", input));
      else if (path === "explicit") rejectsStructurally(() => validateWorksFieldState("story.highlights", explicit(input)));
      else if (path === "inherit") rejectsStructurally(() => resolveWorksField({ field: "story.highlights", state: { mode: "inherit" }, defaults: { "story.highlights": input } }));
      else rejectsStructurally(() => modelWorksWrite(context, command([operation("story.highlights", explicit(input))])));
      assert.equal(calls, 0);
    });
  }
  test("Array safety", "M1-G accepted candidate has dense arrays and stable JSON", () => {
    for (const input of [[], ["one"], ["one", "two"]]) {
      const candidate = good(modelWorksWrite(context, command([operation("story.highlights", explicit(input))])));
      const next = candidate.state.fields["story.highlights"];
      assert.ok(next?.mode === "value" && Array.isArray(next.value));
      for (let index = 0; index < next.value.length; index++) assert.ok(Object.hasOwn(next.value, index));
      assert.deepEqual(JSON.parse(JSON.stringify(candidate.state)).fields["story.highlights"].value, input);
      assert.ok(!JSON.stringify(candidate.state).includes("null"));
    }
    bad(modelWorksWrite(context, command([operation("story.highlights", explicit(Array(1)))])));
  });
  test("Array safety", "dense inherit retains order and empty array", () => {
    for (const input of [[], ["b", "a"]]) { const resolved = good(resolveWorksField({ field: "relatedWorks.items", state: { mode: "inherit" }, defaults: { "relatedWorks.items": input } })); assert.deepEqual(resolved.value, input); assert.notEqual(resolved.value, input); }
  });
  test("Array safety", "nested sparse array rejected", () => rejectsStructurally(() => validateWorksJson({ nested: [Array(1)] })));
  test("Array safety", "custom iterator never executes", () => { let calls = 0; const input: string[] = ["x"]; Object.defineProperty(input, Symbol.iterator, { value() { calls++; throw new Error("must not execute"); } }); rejectsStructurally(() => validateWorksValue("relatedWorks.items", input)); assert.equal(calls, 0); });

  const canonicalUrl = new URL("../public/data/website-data.json", import.meta.url); const ownerUrl = new URL("../public/data/homepage.json", import.meta.url);
  const canonicalBytes = readFileSync(canonicalUrl); const ownerBytes = readFileSync(ownerUrl);
  const canonical = freeze(JSON.parse(canonicalBytes.toString("utf8"))); const canonicalBefore = JSON.stringify(canonical);
  const products = canonical.menu.products as unknown[];
  test("Canonical legacy safety", "canonical Product count is 25", () => assert.equal(products.length, 25));
  for (let index = 0; index < products.length; index++) test("Canonical legacy safety", `Product ${index + 1} is unmanaged without initialisation`, () => { const p = products[index] as Record<string, unknown>; assert.equal(Object.hasOwn(p, "worksPage"), false); const out = good(projectWorksArtwork({ product: p })); assert.equal(out.systemInfo.worksRevision, 0); assert.equal(out.editorialContent.storyBody.semantic, "legacy"); assert.equal(out.mediaRoles.hero.semantic, "legacy"); assert.equal(Object.hasOwn(p, "worksPage"), false); });
  test("Canonical legacy safety", "canonical data object not mutated", () => assert.equal(JSON.stringify(canonical), canonicalBefore));
  test("Canonical legacy safety", "unrelated artwork fixture untouched", () => { const other = freeze({ id: "other", unknown: { keep: true } }); const before = JSON.stringify(other); good(modelWorksWrite(context, command())); assert.equal(JSON.stringify(other), before); assert.equal(JSON.stringify(source), sourceBefore); });
  test("Canonical legacy safety", "no data-file writes", () => { assert.deepEqual(readFileSync(canonicalUrl), canonicalBytes); assert.deepEqual(readFileSync(ownerUrl), ownerBytes); });
  test("Canonical legacy safety", "pure module import/call boundary", () => {
    for (const name of ["Contract", "Validation", "Resolver", "ReadModel", "WriteModel"]) {
      const url = new URL(`../lib/worksArtwork${name}.ts`, import.meta.url); const code = readFileSync(url, "utf8"); const tree = ts.createSourceFile(url.pathname, code, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) assert.match(node.moduleSpecifier.text, /^\.\/worksArtwork(?:Contract|Validation|Resolver|ReadModel|WriteModel)\.ts$/u);
        if (ts.isCallExpression(node)) assert.notEqual(node.expression.kind, ts.SyntaxKind.ImportKeyword, "No dynamic imports in pure modules");
        if (ts.isIdentifier(node)) { const parent = node.parent; const memberName = ((ts.isPropertySignature(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyAccessExpression(parent)) && parent.name === node); if (!memberName) assert.ok(!["process", "fetch", "XMLHttpRequest", "require", "globalThis", "eval"].includes(node.text), `Unexpected I/O/environment identifier in ${name}`); }
        ts.forEachChild(node, visit);
      }; visit(tree);
    }
  });
  test("Canonical legacy safety", "no real network calls", () => assert.equal(networkCalls, 0));
  test("Canonical legacy safety", "canonical file hash unchanged", () => assert.equal(createHash("sha256").update(readFileSync(canonicalUrl)).digest("hex"), createHash("sha256").update(canonicalBytes).digest("hex")));
} finally { globalThis.fetch = networkBefore; }
console.log("W3.1 FOUNDATION CONTRACT");
for (const name of groups) console.log(`${name}: ${counts[name].pass} PASS / ${counts[name].fail} FAIL`);
const passed = groups.reduce((n, name) => n + counts[name].pass, 0); const failed = groups.reduce((n, name) => n + counts[name].fail, 0);
console.log(`TOTAL: ${passed} PASS / ${failed} FAIL`);
if (failed > 0) process.exitCode = 1;
