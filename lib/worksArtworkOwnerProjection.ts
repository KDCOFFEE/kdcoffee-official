// @ts-expect-error -- Explicit extensions follow the repository's strip-types convention.
import { worksRecord, worksReference } from "./worksArtworkContract.ts";
// @ts-expect-error -- Explicit extensions follow the repository's strip-types convention.
import { validateWorksJson, validateWorksState } from "./worksArtworkValidation.ts";
// @ts-expect-error -- Explicit extensions follow the repository's strip-types convention.
import { traceWorksArtwork, traceWorksCandidate, TRACE_RULE_BINDINGS } from "./worksArtworkSourceTrace.ts";
// @ts-expect-error -- Existing PURE canonical media helper; no store imports.
import { resolveProductAsset, resolveListAsset } from "./productVisualAssets.ts";
// @ts-expect-error -- Explicit extensions follow the repository's strip-types convention.
import { OWNER_EDIT_DESTINATIONS, OWNER_SECTION_LABELS, WORKS_OWNER_FIELD_REGISTRY, ownerFieldDefinition } from "./worksArtworkFieldRegistry.ts";
import type { EffectiveSourceTrace, TraceJson } from "./worksArtworkSourceTrace.ts";
import type { OwnerBinding, OwnerCommerceDisplay, OwnerCompleteness, OwnerFieldState, OwnerFieldWarning, OwnerPublicState, OwnerReadField, OwnerSectionId, WorksArtworkOwnerProjection, WorksOwnerProjectionResult } from "./worksArtworkReadModel.ts";

type Data = Record<string, unknown>;
export interface WorksOwnerProjectionInput {
  readonly product: unknown; readonly catalog?: readonly unknown[];
  /** Already-derived display data from a future trusted commerce adapter. */
  readonly commerceSummary?: unknown;
  /** Independent trusted-adapter results, never inferred from publish.website. */
  readonly publicStates?: unknown;
  /** Counterfactual only; providers are not connected to production by this module. */
  readonly inheritProviders?: unknown;
}
class ProjectionInputError extends Error {}

class ProjectionContractError extends Error {}
const requiredArtworkTraces = Object.freeze({
  heroSupportingCopy: "hero.supporting-copy", story: "story.main", storySupplement: "story.supplement",
  flavorNarrative: "flavor.narrative", flavorTags: "flavor.tags", roastingDescription: "roasting.description",
  roastingProofs: "roasting.proofs", roastedBeans: "roasted-beans.media", gallery: "gallery.media",
  relatedWorks: "related.works", relatedTitle: "related.title", seoDescription: "seo.description",
  seoImage: "seo.image", heroMedia: "hero.media", cleanRoastingMedia: "clean-roasting.media",
});
/** Internal A-1 contracts are not optional caller fields. Never evaluate accessors. */
function internalData(value: unknown, key: string): unknown {
  try { return get(value, key); } catch { throw new ProjectionContractError(); }
}
function traceEnvelope(value: unknown, ruleId: string):
  { ok: true; value: unknown } | { ok: false; errors: { code: string; ruleId: string; message: string }[] } {
  const ok = internalData(value, "ok");
  if (ok === true) return { ok: true, value: internalData(value, "value") };
  if (ok !== false) throw new ProjectionContractError();
  const errors = internalData(value, "errors");
  if (!validateWorksJson(errors).ok || !Array.isArray(errors) || !errors.length ||
    errors.some(e => !worksRecord(e) || e.code !== "UNSAFE_OR_UNSUPPORTED_SNAPSHOT" || e.ruleId !== ruleId || typeof e.message !== "string")) {
    throw new ProjectionContractError();
  }
  return { ok: false, errors };
}
function assertTrace(value: unknown, expectedRule?: string, depth = 0): asserts value is EffectiveSourceTrace {
  const json = validateWorksJson(value);
  if (!json.ok) {
    // Preserve the existing A-2 bounded-copy degradation for oversized snapshots.
    if (json.errors.every(e => e.code === "JSON_LIMIT")) throw new ProjectionInputError();
    throw new ProjectionContractError();
  }
  if (!worksRecord(value) || depth > 24) throw new ProjectionContractError();
  const t = value;
  const count = (n: unknown): boolean => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  const strings = ["sourceOwner", "sourceKey", "sourceKind", "sourceLabel", "ruleId", "context", "visibility", "visibilityReason", "snapshotKind", "bindingStatus", "selectionMode", "configurationState"];
  const booleans = ["hasValue", "isFallback", "isLegacy", "isExplicitWorksOverride", "isInherited"];
  if (!has(t, "effectiveValue") || strings.some(k => typeof t[k] !== "string") || booleans.some(k => typeof t[k] !== "boolean") ||
    t.editableHere !== false || !(t.editDestination === null || t.editDestination === "/admin/products") ||
    !count(t.fallbackDepth) || !["PRODUCT", "WORKS", "MEDIA", "COMMERCE", "SHARED_SITE_CONTENT", "LEGACY_FIXED", "DERIVED", "ABSENT"].includes(t.sourceOwner as string) ||
    !["visible", "empty", "suppressed", "disabled", "unknown"].includes(t.visibility as string) ||
    !["LEGACY_SNAPSHOT", "WORKS_CANDIDATE"].includes(t.snapshotKind as string) ||
    expectedRule !== undefined && t.ruleId !== expectedRule ||
    !Object.prototype.hasOwnProperty.call(TRACE_RULE_BINDINGS, t.ruleId as string) ||
    t.bindingStatus !== TRACE_RULE_BINDINGS[t.ruleId as keyof typeof TRACE_RULE_BINDINGS]) throw new ProjectionContractError();
  if (!Array.isArray(t.dependencies) || t.dependencies.some(v => typeof v !== "string") ||
    !Array.isArray(t.steps) || t.steps.some(v => !worksRecord(v) || typeof v.sourceKey !== "string" || typeof v.reason !== "string" ||
      !["selected", "skipped", "excluded", "suppressed"].includes(v.disposition as string) || !(v.index === null || count(v.index))) ||
    !Array.isArray(t.children)) throw new ProjectionContractError();
  if (t.fallbackLayers !== null && (!worksRecord(t.fallbackLayers) || !count(t.fallbackLayers.roleFallbackDepth) ||
    !(t.fallbackLayers.resourceFallbackDepth === null || count(t.fallbackLayers.resourceFallbackDepth)))) throw new ProjectionContractError();
  if (t.media !== null) {
    const media = t.media;
    const resource = (r: unknown): boolean => r === null || worksRecord(r) && typeof r.sourceKey === "string" &&
      ["image", "video", "youtube"].includes(r.type as string) && typeof r.url === "string";
    if (!worksRecord(media) || typeof media.role !== "string" || media.loadStatus !== "UNKNOWN_SERVER_SIDE" ||
      !resource(media.configured) || !resource(media.poster) || !resource(media.fallback)) throw new ProjectionContractError();
  }
  for (const child of t.children) assertTrace(child, undefined, depth + 1);
}
function checkedArtworkTrace(product: unknown, catalog: readonly unknown[] = []): ReturnType<typeof traceWorksArtwork> {
  const result = traceEnvelope(traceWorksArtwork(product, catalog), "artwork");
  if (!result.ok) return result;
  if (!worksRecord(result.value)) throw new ProjectionContractError();
  for (const [key, rule] of Object.entries(requiredArtworkTraces)) assertTrace(internalData(result.value, key), rule);
  return { ok: true, value: result.value as Record<string, EffectiveSourceTrace> };
}
function checkedCandidateTrace(input: Parameters<typeof traceWorksCandidate>[0]): ReturnType<typeof traceWorksCandidate> {
  const result = traceEnvelope(traceWorksCandidate(input), "works.candidate");
  if (!result.ok) return result;
  assertTrace(result.value, "works.candidate");
  return { ok: true, value: result.value };
}

function get(value: unknown, key: string): unknown {
  if (!worksRecord(value)) throw new ProjectionInputError();
  const d = Object.getOwnPropertyDescriptor(value, key);
  if (!d) return undefined;
  if (!d.enumerable || !Object.prototype.hasOwnProperty.call(d, "value")) throw new ProjectionInputError();
  return d.value;
}
function has(value: object, key: string): boolean { return Object.prototype.hasOwnProperty.call(value, key); }
/** Copy inspected data descriptors, never JSON.stringify caller data or invoke hooks.
 * Data snapshots only: reflective failures are caught; not a Proxy sandbox. */
function copy(value: unknown): unknown {
  if (!validateWorksJson(value).ok) throw new ProjectionInputError();
  const visit = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) {
      const out: unknown[] = [];
      for (let i = 0; i < v.length; i++) out.push(visit(Object.getOwnPropertyDescriptor(v, String(i))!.value));
      return out;
    }
    const out: Data = {};
    for (const key of Object.getOwnPropertyNames(v)) {
      const d = Object.getOwnPropertyDescriptor(v, key);
      if (!d || !Object.prototype.hasOwnProperty.call(d, "value")) throw new ProjectionInputError();
      out[key] = visit(d.value);
    }
    return out;
  };
  return visit(value);
}
function pick(product: unknown, keys: readonly string[]): Data {
  const out: Data = Object.create(null);
  for (const key of keys) { const value = get(product, key); if (value !== undefined) out[key] = copy(value); }
  return out;
}
const candidateFields: Readonly<Record<string, string>> = Object.freeze({
  "hero.supportingCopy": "content.hero", "story.heading": "content.heading", "story.body": "content.story", "story.highlights": "content.highlights",
  "flavor.narrative": "content.flavor", "roasting.narrative": "content.roasting", "drinking.narrative": "content.drinking", "closing.body": "content.closing",
  "roastedBeans.caption": "content.roastedCaptions", "roastedBeans.gallery": "media.roasted", "relatedWorks.items": "related.items", "relatedWorks.title": "related.title",
  "hero.media": "media.hero", "cleanRoasting.media": "media.clean", "presentation.visible": "presentation.visible", "presentation.spacing": "presentation.spacing",
  "presentation.width": "presentation.width", "animation.enabled": "animation.enabled", "animation.preset": "animation.preset", "animation.durationMs": "animation.duration",
  "search.title": "search.title", "search.description": "search.description", "search.image": "search.image",
});
const bindingLabels: Readonly<Record<OwnerBinding, string>> = Object.freeze({
  CURRENT_PUBLIC_PARITY_VERIFIED: "既有公開規則已比對；此檢視尚未連接公開頁",
  MODEL_ONLY: "來源模型已建立；完整公開呈現仍待驗證",
  FUTURE_CANDIDATE: "未連接公開頁的候選內容", UNAVAILABLE: "來源需要確認",
});
function status(state: OwnerFieldState): string {
  return state === "invalid" ? "來源需要確認" : state === "disabled" ? "此區目前未啟用" : state === "suppressed" ? "此內容依既有規則未顯示"
    : state === "missing" ? "本作品目前未設定" : state === "explicit-blank" ? "本作品刻意留白"
    : state === "explicit" ? "本作品自訂候選" : state === "inherited" ? "使用預設的候選內容" : "目前僅供檢視";
}
function field(id: string, value: TraceJson = null, hasValue = false): OwnerReadField {
  const def = ownerFieldDefinition(id); if (!def) throw new ProjectionInputError();
  const state: OwnerFieldState = hasValue ? "legacy" : "missing";
  return { id, label: def.label, section: def.section, ownership: def.ownership, value, hasValue, state, statusLabel: status(state),
    source: { owner: def.ownership, key: "unavailable." + id, label: "尚未設定", binding: "UNAVAILABLE", bindingLabel: bindingLabels.UNAVAILABLE, trace: null },
    display: { locations: [...def.displayLocations], visibility: "unknown", reason: "not-production-bound" }, impact: [...def.impactScope],
    editing: { editableHere: false, capability: def.editCapability, destination: { ...def.editDestination } },
    optional: def.optional, completenessRole: def.completenessRole, warning: null };
}
function snapshotField(id: string, value: TraceJson, key: string, hasValue = true): OwnerReadField {
  const out = field(id, value, hasValue);
  return { ...out, source: { ...out.source, key, label: out.ownership === "COMMERCE" ? "售價與購買設定摘要" : out.ownership === "SYSTEM" ? "系統識別資料" : out.ownership === "PRODUCT" ? "商品資料" : "來源摘要",
    binding: "MODEL_ONLY", bindingLabel: bindingLabels.MODEL_ONLY } };
}
function tracedField(id: string, trace: EffectiveSourceTrace, candidate = false): OwnerReadField {
  const binding: OwnerBinding = candidate ? "FUTURE_CANDIDATE" : trace.bindingStatus === "PARITY_VERIFIED" ? "CURRENT_PUBLIC_PARITY_VERIFIED" : "MODEL_ONLY";
  const blank = trace.effectiveValue === "" || trace.effectiveValue === null || Array.isArray(trace.effectiveValue) && !trace.effectiveValue.length;
  const state: OwnerFieldState = candidate ? trace.isInherited ? "inherited" : blank ? "explicit-blank" : "explicit"
    : trace.visibility === "disabled" ? "disabled" : trace.visibility === "suppressed" ? "suppressed" : !trace.hasValue ? "missing" : "legacy";
  const out = field(id, copy(trace.effectiveValue) as TraceJson, trace.hasValue);
  const sourceFact = trace.sourceKey === "product.mood" ? "facts.mood" : trace.sourceKey === "product.shortCopy" ? "facts.shortCopy" : trace.sourceKey === "product.subtitle" ? "facts.subtitle" : null;
  const sourceDefinition = sourceFact ? ownerFieldDefinition(sourceFact)! : null;
  const destination = candidate ? OWNER_EDIT_DESTINATIONS.WORKS_FUTURE : sourceDefinition ? sourceDefinition.editDestination : trace.sourceOwner === "PRODUCT" ? OWNER_EDIT_DESTINATIONS.PRODUCT_ADMIN
    : trace.sourceOwner === "MEDIA" ? OWNER_EDIT_DESTINATIONS.MEDIA_ADMIN : trace.sourceOwner === "WORKS" ? OWNER_EDIT_DESTINATIONS.PRODUCT_ADMIN
    : OWNER_EDIT_DESTINATIONS.NO_CURRENT_EDITOR;
  const sourceImpact = sourceDefinition?.impactScope ?? [];
  return { ...out, impact: [...new Set([...out.impact, ...sourceImpact])], state, statusLabel: status(state),
    source: { owner: trace.sourceOwner, key: trace.sourceKey, label: trace.sourceLabel, binding, bindingLabel: bindingLabels[binding], trace: copy(trace) as EffectiveSourceTrace },
    display: { locations: [...out.display.locations], visibility: candidate ? "unknown" : trace.visibility, reason: candidate ? "candidate-not-public" : trace.visibilityReason },
    editing: { editableHere: false, capability: candidate ? "WRITE_NOT_CONNECTED" : destination.href ? "EXTERNAL_EDITOR" : "UNAVAILABLE", destination: { ...destination } } };
}
function warning(fieldId: string, code: string): OwnerFieldWarning { return { fieldId, code, label: "來源需要確認" }; }
function invalidField(id: string, code = "FIELD_SOURCE_UNSAFE_OR_INVALID"): OwnerReadField {
  const out = field(id); return { ...out, state: "invalid", statusLabel: status("invalid"), warning: warning(id, code) };
}
function meaningful(value: TraceJson): boolean {
  return value !== null && (typeof value === "string" ? value.trim().length > 0 : Array.isArray(value) ? value.length > 0 : true);
}

/** Minimal dependency snapshots for independent media rules. Dropped metadata
 * cannot affect these helpers' selection; no selected resource is replaced. */
function mediaSnapshot(product: unknown, mode: "main" | "gallery"): Data {
  const rawLayout = get(product, "pageLayout");
  const layout = rawLayout === undefined ? {} : pick(rawLayout, mode === "main" ? ["heroAsset", "productAsset", "listAsset"] : ["heroAsset", "productAsset", "galleryAssets", "showGallery"]);
  const roles = new Set(["hero", "productPhoto", "mainVisual", "artworkCover"]);
  for (const key of ["heroAsset", "productAsset", "listAsset"]) {
    const role = layout[key]; if (typeof role === "string" && role.trim()) roles.add(role.trim());
  }
  const galleryRoles = new Set<string>();
  if (mode === "gallery") {
    const raw = layout.galleryAssets;
    const configured = Array.isArray(raw) ? raw : ["label"];
    for (const role of configured) if (typeof role === "string" && role.trim()) { roles.add(role.trim()); galleryRoles.add(role.trim()); }
  }
  const rawAssets = get(product, "assets");
  const assets: Data = Object.create(null);
  if (rawAssets !== undefined) {
    if (!worksRecord(rawAssets)) throw new ProjectionInputError();
    for (const role of roles) {
      if (!worksReference(role) || role === "constructor" || role === "prototype") throw new ProjectionInputError();
      const raw = get(rawAssets, role); if (raw === undefined) continue;
      if (!worksRecord(raw)) { assets[role] = copy(raw); continue; }
      const asset = pick(raw, galleryRoles.has(role) ? ["path", "caption"] : ["path"]);
      const media = get(raw, "media");
      if (media !== undefined) asset.media = worksRecord(media) ? pick(media, ["type", "url", "posterUrl"]) : copy(media);
      assets[role] = asset;
    }
  }
  return { ...pick(product, ["slug", "cover", "poster"]), assets, pageLayout: layout };
}
function roastedSnapshot(product: unknown): Data {
  const rawAssets = get(product, "assets");
  const raw = rawAssets === undefined ? undefined : get(rawAssets, "roastedBeanPhoto");
  const assets: Data = {};
  if (raw !== undefined) assets.roastedBeanPhoto = copy(raw);
  return { ...pick(product, ["showRoastedBeanPhoto"]), assets };
}

function completeness(fields: readonly OwnerReadField[], commerce: OwnerCommerceDisplay): OwnerCompleteness[] {
  const categories = ["productFacts", "pageContent", "media", "searchAndShare", "purchase"] as const;
  return categories.map(category => {
    const rows = fields.filter(f => category === "productFacts" ? f.section === "productFacts" || f.id === "identity.name"
      : category === "pageContent" ? f.section === "pageContent" || f.section === "relatedWorks" : f.section === category);
    const applicable = rows.filter(f => f.completenessRole !== "EXCLUDED" && !(f.optional && (f.display.visibility === "disabled" || f.display.visibility === "suppressed")));
    const required = applicable.filter(f => f.completenessRole === "REQUIRED");
    const missing = applicable.filter(f => f.state === "invalid" || f.warning !== null || f.completenessRole === "REQUIRED" && !f.hasValue);
    const completed = required.filter(f => f.state !== "invalid" && f.hasValue).length;
    const state: OwnerCompleteness["state"] = missing.length ? "NEEDS_ATTENTION" : category === "purchase"
      ? commerce.availability === "unknown" ? "READ_ONLY_ISSUE" : "COMPLETE"
      : !applicable.length ? "NOT_APPLICABLE" : !required.length ? "OPTIONAL" : "COMPLETE";
    return { category, state, completed, required: required.length, needsAttention: missing.length, fieldIds: missing.map(f => f.id) };
  });
}
function failure(code: "INVALID_INPUT" | "INVALID_IDENTITY" | "INVALID_WORKS_CONTRACT" | "UNSAFE_PROJECTION"): WorksOwnerProjectionResult {
  return { ok: false, errors: [{ code, label: code === "INVALID_IDENTITY" ? "作品基本資料需要確認" : code === "INVALID_WORKS_CONTRACT" ? "作品內容契約需要確認" : "來源需要確認" }] };
}

/** Pure read projection. Derived statuses/commerce are caller-adapter contracts,
 * not verified production adapters. No full read object is a future save payload. */
export function projectWorksArtworkOwner(input: WorksOwnerProjectionInput): WorksOwnerProjectionResult {
  try {
    if (!worksRecord(input)) return failure("INVALID_INPUT");
    const product = get(input, "product"); if (!worksRecord(product)) return failure("INVALID_INPUT");
    const safeStrings = new Map<string, boolean>();
    const safeString = (value: unknown, maximum = 4000): string => {
      if (typeof value !== "string" || value.length > maximum) throw new ProjectionInputError();
      let safe = safeStrings.get(value);
      if (safe === undefined) {
        // Reuse A-1's reviewed Unicode/root/URL output boundary; no second path grammar.
        safe = !/(?:^|\n)\s*at\s+(?:\S+\s+\(|file:|node:)/u.test(value) && checkedArtworkTrace({ mood: value }).ok;
        safeStrings.set(value, safe);
      }
      if (!safe) throw new ProjectionInputError(); return value;
    };
    let name: string;
    try { name = safeString(get(product, "name"), 200); if (!name.trim()) return failure("INVALID_IDENTITY"); }
    catch (error) { if (!(error instanceof ProjectionInputError)) throw error; return failure("INVALID_IDENTITY"); }
    let worksState: ReturnType<typeof validateWorksState> | null = null;
    if (has(product, "worksPage")) {
      try { worksState = validateWorksState(get(product, "worksPage")); }
      catch (error) { if (!(error instanceof ProjectionInputError)) throw error; return failure("INVALID_WORKS_CONTRACT"); }
      if (!worksState.ok) return failure("INVALID_WORKS_CONTRACT");
    }
    const fields = new Map<string, OwnerReadField>();
    for (const id of Object.keys(WORKS_OWNER_FIELD_REGISTRY)) fields.set(id, field(id));
    const set = (f: OwnerReadField) => { fields.set(f.id, f); };
    const attempt = (id: string, compute: () => OwnerReadField) => { try { set(compute()); } catch (error) { if (!(error instanceof ProjectionInputError)) throw error; set(invalidField(id)); } };
    set(snapshotField("identity.name", name, "product.name"));
    for (const [id, key] of [["identity.nameEn", "nameEn"], ["identity.artist", "artist"], ["identity.tag", "tag"],
      ["facts.origin", "origin"], ["facts.process", "process"], ["facts.roast", "roast"], ["facts.variety", "variety"], ["facts.altitude", "altitude"],
      ["facts.shortCopy", "shortCopy"], ["facts.subtitle", "subtitle"], ["facts.mood", "mood"]]) {
      attempt(id, () => { const raw = get(product, key); const value = raw === undefined || raw === null ? "" : safeString(raw);
        return snapshotField(id, value, "product." + key, meaningful(value)); });
    }
    attempt("facts.flavors", () => {
      const raw = get(product, "flavors"); const values = raw === undefined ? [] : copy(raw);
      if (!Array.isArray(values) || values.length > 64) throw new ProjectionInputError();
      const flavors = values.map(v => safeString(v, 200));
      return snapshotField("facts.flavors", flavors, "product.flavors", flavors.some(v => v.trim()));
    });
    // Family isolation uses each rule's full dependency set. An unsafe winning
    // source invalidates that family; it is never removed to invent a fallback.
    const family = (ids: readonly string[], keys: readonly string[], select: (t: Record<string, EffectiveSourceTrace>) => void, catalog: readonly unknown[] = [], snapshot?: () => Data) => {
      try { const result = checkedArtworkTrace(snapshot ? snapshot() : pick(product, keys), catalog); if (!result.ok) throw new ProjectionInputError(); select(result.value); }
      catch (error) { if (!(error instanceof ProjectionInputError)) throw error; for (const id of ids) set(invalidField(id)); }
    };
    family(["content.hero", "content.story", "content.supplement", "search.description"], ["mood", "shortCopy", "subtitle"], t => {
      set(tracedField("content.hero", t.heroSupportingCopy)); set(tracedField("content.story", t.story));
      set(tracedField("content.supplement", t.storySupplement)); set(tracedField("search.description", t.seoDescription));
    });
    family(["content.flavor", "content.roasting", "content.proofs"], ["productPageContent", "cleanRoastingMedia", "flavors"], t => {
      set(tracedField("content.flavor", t.flavorNarrative)); set(tracedField("content.roasting", t.roastingDescription)); set(tracedField("content.proofs", t.roastingProofs));
    });
    family(["media.hero", "search.image"], [], t => {
      set(tracedField("media.hero", t.heroMedia)); set(tracedField("search.image", t.seoImage));
    }, [], () => mediaSnapshot(product, "main"));
    family(["media.gallery"], [], t => set(tracedField("media.gallery", t.gallery)), [], () => mediaSnapshot(product, "gallery"));
    family(["media.roasted", "content.roastedCaptions"], [], t => {
      set(tracedField("media.roasted", t.roastedBeans));
      const captionField = tracedField("content.roastedCaptions", t.roastedBeans);
      set({ ...captionField, value: t.roastedBeans.children.map(item => item.children[0]?.effectiveValue ?? null) });
    }, [], () => roastedSnapshot(product));
    // A disabled optional area may retain a warning without reducing completion.
    const markDisabledInvalid = (id: string, reason: string) => {
      const f = fields.get(id)!;
      if (f.state === "invalid") set({ ...f, display: { ...f.display, visibility: "disabled", reason } });
    };
    try { const layout = get(product, "pageLayout"); if (worksRecord(layout) && get(layout, "showGallery") === false) markDisabledInvalid("media.gallery", "showGallery-false"); } catch (error) { if (!(error instanceof ProjectionInputError)) throw error; }
    try { if (get(product, "showRoastedBeanPhoto") !== true) for (const id of ["media.roasted", "content.roastedCaptions"]) markDisabledInvalid(id, "showRoastedBeanPhoto-not-true"); } catch (error) { if (!(error instanceof ProjectionInputError)) throw error; }
    family(["media.clean"], ["slug", "cleanRoastingMedia"], t => set(tracedField("media.clean", t.cleanRoastingMedia)));
    const image = (kind: "product" | "list"): TraceJson => {
      const source = mediaSnapshot(product, "main");
      const result = kind === "product" ? resolveProductAsset(source) : resolveListAsset(source);
      if (!result) return null;
      const safe = checkedArtworkTrace({ pageLayout: { heroAsset: "hero" }, assets: { hero: { path: result.path } } });
      if (!safe.ok) throw new ProjectionInputError();
      return { role: safeString(result.key, 128), path: result.path };
    };
    attempt("media.productPhoto", () => { const value = image("product"); return snapshotField("media.productPhoto", value, "resolver.productAsset", value !== null); });
    attempt("identity.thumbnail", () => { const value = image("list"); return snapshotField("identity.thumbnail", value, "resolver.listAsset", value !== null); });
    let catalog: Data[] = []; let catalogInput: unknown[] = [];
    let catalogValid = true;
    try {
      const raw = get(input, "catalog");
      if (raw !== undefined) {
        if (!Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype || raw.length > 1000) throw new ProjectionInputError();
        for (let i = 0; i < raw.length; i++) {
          const d = Object.getOwnPropertyDescriptor(raw, String(i)); if (!d || !has(d, "value")) throw new ProjectionInputError();
          catalogInput.push(d.value); catalog.push(pick(d.value, ["slug", "status", "active", "inMonthlyMenu"]));
        }
      }
    } catch (error) { if (!(error instanceof ProjectionInputError)) throw error; catalog = []; catalogInput = []; catalogValid = false; }
    let related: WorksArtworkOwnerProjection["relatedWorks"] = { mode: "UNAVAILABLE", configuredCount: null, effectiveCount: 0, excludedCount: 0, ordering: "UNKNOWN", items: [], exclusionReasons: [] };
    if (!catalogValid) { set(invalidField("related.items", "INVALID_CATALOG_SNAPSHOT")); set(invalidField("related.title")); }
    else family(["related.items", "related.title"], ["slug", "relatedProducts", "pageLayout"], t => {
      let f = tracedField("related.items", t.relatedWorks); set(tracedField("related.title", t.relatedTitle));
      const refs = t.relatedWorks.effectiveValue as string[];
      const excluded = t.relatedWorks.steps.filter(s => s.disposition === "excluded");
      if (t.relatedWorks.selectionMode === "MANUAL" && excluded.some(s => ["unresolved", "hidden", "inactive"].includes(s.reason))) f = { ...f, state: "invalid", statusLabel: status("invalid"), warning: warning(f.id, "RELATED_REFERENCE_NEEDS_ATTENTION") };
      set(f);
      const raw = get(product, "relatedProducts");
      const ids = worksRecord(raw) ? get(raw, "productIds") : undefined;
      const configuredCount = t.relatedWorks.selectionMode === "MANUAL" ? Array.isArray(ids) ? ids.length : 0 : null;
      const selectedSteps = t.relatedWorks.steps.filter(s => s.disposition === "selected");
      const items = refs.map((ref, position) => {
        let index = selectedSteps[position]?.index ?? -1;
        if (t.relatedWorks.selectionMode === "MANUAL") {
          index = -1;
          for (let i = catalog.length - 1; i >= 0; i--) if (get(catalog[i], "slug") === ref) { index = i; break; }
        }
        let title: string | null = null;
        try { const rawName = index < 0 ? undefined : get(catalogInput[index], "name"); if (rawName !== undefined) title = safeString(rawName, 200); }
        catch (error) { if (!(error instanceof ProjectionInputError)) throw error; f = { ...f, warning: warning(f.id, "RELATED_LABEL_NEEDS_ATTENTION") }; set(f); }
        return { ref, name: title };
      });
      related = { mode: t.relatedWorks.selectionMode as "MANUAL" | "AUTO_LEGACY", configuredCount, effectiveCount: refs.length, excludedCount: excluded.length,
        ordering: t.relatedWorks.selectionMode === "MANUAL" ? "MANUAL_ORDER" : "CATALOG_ORDER", items, exclusionReasons: excluded.map(s => s.reason) };
    }, catalog);
    let commerce: OwnerCommerceDisplay = { priceText: null, availability: "unknown", variantLabels: [], availableChoiceCount: null };
    attempt("purchase.summary", () => {
      const raw = get(input, "commerceSummary");
      if (raw !== undefined) {
        if (!worksRecord(raw)) throw new ProjectionInputError();
        const price = get(raw, "priceText"), availability = get(raw, "availability"), labels = get(raw, "variantLabels"), count = get(raw, "availableChoiceCount");
        if (availability !== undefined && (typeof availability !== "string" || !["available", "sold_out", "unavailable", "unknown"].includes(availability))) throw new ProjectionInputError();
        const list = labels === undefined ? [] : copy(labels);
        if (!Array.isArray(list) || list.length > 20 || count !== undefined && (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 || count > 10000)) throw new ProjectionInputError();
        commerce = { priceText: price === undefined || price === null ? null : safeString(price, 120),
          availability: availability as OwnerCommerceDisplay["availability"] || "unknown", variantLabels: list.map(v => safeString(v, 120)), availableChoiceCount: count === undefined ? null : count as number };
      }
      return snapshotField("purchase.summary", copy(commerce) as TraceJson, "adapter.commerceDisplay");
    });
    const publicStates: WorksArtworkOwnerProjection["publicStates"] = {
      detailPage: { state: "UNKNOWN", basis: "NOT_PROVIDED" }, worksList: { state: "UNKNOWN", basis: "NOT_PROVIDED" }, purchase: { state: "UNKNOWN", basis: "NOT_PROVIDED" },
    };
    for (const key of ["detailPage", "worksList", "purchase"] as const) {
      const id = "public." + key;
      attempt(id, () => {
        const raw = get(input, "publicStates"); const value = raw === undefined ? undefined : get(raw, key);
        if (value !== undefined && value !== "YES" && value !== "NO" && value !== "UNKNOWN") throw new ProjectionInputError();
        const resolved: OwnerPublicState = { state: value || "UNKNOWN", basis: value === undefined ? "NOT_PROVIDED" : "CALLER_DERIVED" };
        (publicStates as Record<string, OwnerPublicState>)[key] = resolved;
        return snapshotField(id, { state: resolved.state, basis: resolved.basis }, "adapter.publicStates." + key);
      });
      if (fields.get(id)!.state === "invalid") (publicStates as Record<string, OwnerPublicState>)[key] = { state: "UNKNOWN", basis: "INVALID_INPUT" };
    }
    attempt("presentation.status", () => {
      const layout = get(product, "pageLayout"); if (layout !== undefined && !worksRecord(layout)) throw new ProjectionInputError();
      return snapshotField("presentation.status", "EXISTING_SITE_BEHAVIOR", "product.pageLayout");
    });
    attempt("animation.status", () => {
      const raw = get(product, "productPageAnimations"); if (raw !== undefined && !worksRecord(raw)) throw new ProjectionInputError();
      return snapshotField("animation.status", raw === undefined ? "ABSENT" : "SOURCE_EXISTS_RENDERING_UNVERIFIED", "product.productPageAnimations", raw !== undefined);
    });
    // Exact route-level title template only, not root-layout/browser metadata merging.
    set({ ...snapshotField("search.title", name + "｜KD Coffee 咖啡藝術工坊", "route.metadata.title"),
      source: { owner: "DERIVED", key: "route.metadata.title", label: "作品名稱與既有路由標題格式", binding: "CURRENT_PUBLIC_PARITY_VERIFIED", bindingLabel: bindingLabels.CURRENT_PUBLIC_PARITY_VERIFIED, trace: null } });
    for (const [id, key] of [["system.productId", "id"], ["system.artworkSku", "sku"], ["system.slug", "slug"]]) attempt(id, () => {
      const raw = get(product, key); if (raw !== undefined && !worksReference(raw)) throw new ProjectionInputError();
      return snapshotField(id, raw === undefined ? null : raw as string, "product." + key, raw !== undefined);
    });
    const managed = worksState !== null && worksState.ok ? worksState.value : null;
    set(snapshotField("system.contractVersion", managed?.contractVersion ?? null, "product.worksPage.contractVersion", managed !== null));
    set(snapshotField("system.revision", managed?.revision ?? null, "product.worksPage.revision", managed !== null));
    const futureCandidates: OwnerReadField[] = [];
    if (managed) for (const [key, state] of Object.entries(managed.fields)) {
      const id = candidateFields[key]; if (!id) return failure("INVALID_WORKS_CONTRACT");
      try {
        const providers = get(input, "inheritProviders");
        const provider = providers === undefined ? undefined : get(providers, key);
        const candidate = checkedCandidateTrace({ field: key, state, ...(provider === undefined ? {} : { inheritProvider: copy(provider) as { providerKey: string; trace: EffectiveSourceTrace } }) });
        if (!candidate.ok) throw new ProjectionInputError();
        futureCandidates.push(tracedField(id, candidate.value, true));
      } catch (error) {
        if (!(error instanceof ProjectionInputError)) throw error;
        const out = invalidField(id, "CANDIDATE_PROVIDER_OR_VALUE_UNAVAILABLE");
        futureCandidates.push({ ...out, source: { ...out.source, binding: "FUTURE_CANDIDATE", bindingLabel: bindingLabels.FUTURE_CANDIDATE },
          editing: { editableHere: false, capability: "WRITE_NOT_CONNECTED", destination: { ...OWNER_EDIT_DESTINATIONS.WORKS_FUTURE } } });
      }
    }
    const outputFields = [...fields.values()];
    const sections = (Object.keys(OWNER_SECTION_LABELS) as OwnerSectionId[]).map(id => ({
      id, label: OWNER_SECTION_LABELS[id], fieldIds: outputFields.filter(f => f.section === id).map(f => f.id), collapsedByDefault: id !== "overview" && id !== "pageContent",
    }));
    const value: WorksArtworkOwnerProjection = {
      schemaVersion: 1, capability: "READ_ONLY", contract: "DISPLAY_ONLY_NOT_WRITE_PAYLOAD",
      overview: { fieldIds: outputFields.filter(f => f.section === "overview").map(f => f.id) }, sections, fields: outputFields, futureCandidates,
      publicStates, commerceSummary: commerce, relatedWorks: related, completeness: completeness(outputFields, commerce),
      systemInfo: { collapsedByDefault: true, namespace: managed ? "WORKS_CANDIDATE" : "LEGACY_UNMANAGED", contractVersion: managed?.contractVersion ?? null, worksRevision: managed?.revision ?? null },
      warnings: [...outputFields, ...futureCandidates].flatMap(f => f.warning ? [f.warning] : []),
    };
    let nodes = 0, characters = 0;
    const finalGuard = (v: unknown, key = "", depth = 0): void => {
      if (++nodes > 30000 || depth > 40) throw new ProjectionInputError();
      if (typeof v === "string") {
        characters += v.length; if (characters > 1000000) throw new ProjectionInputError();
        if ((key === "href" || key === "editDestination") && v === "/admin/products") return;
        safeString(v, 100000); return;
      }
      if (v === null || typeof v === "boolean" || typeof v === "number" && Number.isFinite(v)) return;
      if (Array.isArray(v)) { for (const item of v) finalGuard(item, "", depth + 1); return; }
      if (!worksRecord(v)) throw new ProjectionInputError();
      for (const [k, item] of Object.entries(v)) finalGuard(item, k, depth + 1);
    };
    finalGuard(value); return { ok: true, value };
  } catch { return failure("UNSAFE_PROJECTION"); }
}
