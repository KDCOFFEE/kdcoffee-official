/** W3.2A-1: pure, detached source decisions. No production binding or persistence.
 * Inputs must be data snapshots. Reflection errors fail closed; this is not a Proxy sandbox.
 * Existing normalizers receive only descriptor-copied data, never caller hooks. */
// @ts-expect-error -- Explicit source extensions support the repository's strip-types tests.
import { normalizeProductPageContent } from "./productPageContentValidation.ts";
// @ts-expect-error -- Explicit source extensions support the repository's strip-types tests.
import { LEGACY_CLEAN_ROASTING_PROOFS } from "./productPageContent.ts";
// @ts-expect-error -- Explicit source extensions support the repository's strip-types tests.
import { normalizeCleanRoastingMedia, CLEAN_ROASTING_LEGACY_CONFIG } from "./cleanRoastingMedia.ts";
// @ts-expect-error -- Explicit source extensions support the repository's strip-types tests.
import { isMediaAsset } from "./media.ts";
// @ts-expect-error -- Explicit source extensions support the repository's strip-types tests.
import { worksField } from "./worksArtworkContract.ts";
// @ts-expect-error -- Explicit source extensions support the repository's strip-types tests.
import { validateWorksFieldState, validateWorksValue } from "./worksArtworkValidation.ts";

export type TraceJson = null | boolean | number | string | TraceJson[] | { [key: string]: TraceJson };
export type TraceOwner = "PRODUCT" | "WORKS" | "MEDIA" | "COMMERCE" | "SHARED_SITE_CONTENT" | "LEGACY_FIXED" | "DERIVED" | "ABSENT";
export type TraceBinding = "MODEL_ONLY" | "PARITY_VERIFIED" | "PRODUCTION_BOUND";
export type TraceStep = { sourceKey: string; disposition: "selected" | "skipped" | "excluded" | "suppressed"; reason: string; index: number | null };
export type TraceFallbackLayers = { roleFallbackDepth: number; resourceFallbackDepth: number | null };
export type TraceResource = { sourceKey: string; type: "image" | "video" | "youtube"; url: string };
export type TraceMediaLayers = {
  role: string; configured: TraceResource | null; poster: TraceResource | null; fallback: TraceResource | null;
  loadStatus: "UNKNOWN_SERVER_SIDE";
};
/** visibility describes this rule's eligibility, not route access, CSS or browser/load state. */
export type EffectiveSourceTrace = {
  effectiveValue: TraceJson; hasValue: boolean;
  sourceOwner: TraceOwner; sourceKey: string; sourceKind: string; sourceLabel: string;
  /** Rule-local candidate depth; seo.image uses the sum documented by fallbackLayers. */
  ruleId: string; context: string; isFallback: boolean; fallbackDepth: number;
  /** seo.image only: outer Hero/Product/List index (0/1/2; exhausted=3), plus the
   * selected AssetChoice candidate index. null resource depth means no winner.
   * fallbackDepth = roleFallbackDepth + (resourceFallbackDepth ?? 0).
   * isFallback is true when either depth is positive, including exhausted roles. */
  fallbackLayers: TraceFallbackLayers | null;
  isLegacy: boolean; isExplicitWorksOverride: boolean; isInherited: boolean;
  editableHere: false; editDestination: string | null;
  visibility: "visible" | "empty" | "suppressed" | "disabled" | "unknown";
  visibilityReason: string; dependencies: string[]; steps: TraceStep[];
  snapshotKind: "LEGACY_SNAPSHOT" | "WORKS_CANDIDATE";
  bindingStatus: TraceBinding; selectionMode: string; configurationState: string;
  media: TraceMediaLayers | null; children: EffectiveSourceTrace[];
};
export type TraceResult<T> = { ok: true; value: T } | { ok: false; errors: { code: string; ruleId: string; message: string }[] };
export const TRACE_RULE_BINDINGS = Object.freeze({
  "hero.supporting-copy": "PARITY_VERIFIED", "story.main": "PARITY_VERIFIED",
  "story.supplement": "PARITY_VERIFIED", "flavor.narrative": "PARITY_VERIFIED",
  "flavor.tags": "PARITY_VERIFIED", "roasting.description": "PARITY_VERIFIED",
  "roasting.proofs": "PARITY_VERIFIED", "roasting.proof": "PARITY_VERIFIED",
  "roasted-beans.media": "PARITY_VERIFIED", "roasted-beans.item": "PARITY_VERIFIED",
  "roasted-beans.caption": "PARITY_VERIFIED", "gallery.media": "PARITY_VERIFIED",
  "gallery.item": "PARITY_VERIFIED", "related.works": "PARITY_VERIFIED",
  "related.item": "PARITY_VERIFIED", "related.title": "PARITY_VERIFIED",
  "seo.description": "PARITY_VERIFIED", "seo.image": "PARITY_VERIFIED",
  "hero.media": "MODEL_ONLY", "clean-roasting.media": "PARITY_VERIFIED",
  "clean-roasting.item": "PARITY_VERIFIED", "works.candidate": "MODEL_ONLY",
} as const);
type Data = Record<string, unknown>;
type AssetChoice = { role: string; path: string; sourceKey: string; depth: number; steps: TraceStep[] };
const forbidden = new Set(["__proto__", "prototype", "constructor"]);
const productKeys = ["id", "slug", "name", "shortCopy", "subtitle", "mood", "flavors", "status", "active", "inMonthlyMenu", "cover", "poster", "assets", "pageLayout", "relatedProducts", "showRoastedBeanPhoto", "productPageContent", "cleanRoastingMedia"] as const;
const own = (v: object, k: string): boolean => Object.prototype.hasOwnProperty.call(v, k);
const record = (v: unknown): v is Data => v !== null && typeof v === "object" && !Array.isArray(v);
const data = (v: unknown, k: string): unknown => record(v) ? Object.getOwnPropertyDescriptor(v, k)?.value : undefined;
const str = (v: unknown): string => typeof v === "string" ? v : "";
const trimmed = (v: unknown): string => str(v).trim();
const objectExists = (v: unknown): boolean => Boolean(v) && typeof v === "object";
const safeId = (v: unknown): string | null => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(v) ? v : null;
const step = (sourceKey: string, disposition: TraceStep["disposition"], reason: string, index: number | null = null): TraceStep => ({ sourceKey, disposition, reason, index });
class TraceInputError extends Error {}

/** Only read DATA descriptors; caller arrays/methods/iterators/toJSON are never invoked. */
function copyData(input: unknown): unknown {
  let nodes = 0;
  const active = new WeakSet<object>();
  const visit = (v: unknown, depth: number): unknown => {
    if (++nodes > 30000 || depth > 32) throw new TraceInputError();
    if (v === undefined || v === null || typeof v === "boolean") return v;
    if (typeof v === "string") { if (v.length > 100000) throw new TraceInputError(); return v; }
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v !== "object" || active.has(v)) throw new TraceInputError();
    const arr = Array.isArray(v); const proto = Object.getPrototypeOf(v);
    if (arr ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) throw new TraceInputError();
    if (Object.getOwnPropertySymbols(v).length) throw new TraceInputError();
    const names = Object.getOwnPropertyNames(v);
    if (names.length > 4096) throw new TraceInputError();
    active.add(v);
    if (arr) {
      const length = Object.getOwnPropertyDescriptor(v, "length")?.value as unknown;
      if (typeof length !== "number" || length > 4096 || names.length !== length + 1) throw new TraceInputError();
      const out: unknown[] = [];
      for (const k of names) if (k !== "length" && (!/^(0|[1-9][0-9]*)$/u.test(k) || Number(k) >= length)) throw new TraceInputError();
      for (let i = 0; i < length; i++) {
        const d = Object.getOwnPropertyDescriptor(v, String(i));
        if (!d || !own(d, "value") || !d.enumerable) throw new TraceInputError();
        out.push(visit(d.value, depth + 1));
      }
      active.delete(v); return out;
    }
    const out: Data = Object.create(null);
    for (const k of names) {
      const d = Object.getOwnPropertyDescriptor(v, k);
      if (forbidden.has(k) || !d || !own(d, "value") || !d.enumerable) throw new TraceInputError();
      out[k] = visit(d.value, depth + 1);
    }
    active.delete(v); return out;
  };
  return visit(input, 0);
}
function productSnapshot(input: unknown): Data {
  if (!record(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new TraceInputError();
  const out: Data = Object.create(null);
  for (const key of productKeys) {
    const d = Object.getOwnPropertyDescriptor(input, key);
    if (!d) continue;
    if (!own(d, "value") || !d.enumerable) throw new TraceInputError();
    out[key] = copyData(d.value);
  }
  return out;
}
/** One boundary policy, not a filesystem-root blacklist. Bare absolute path
 * tokens fail closed except known public asset references. Full HTTP(S) URLs
 * are considered URLs, not local paths; resource() still enforces publicUrl().
 * The admin-route exception applies only to the fixed editDestination field. */
const publicAssetPrefix = /^\/(?:uploads|images|videos|assets|media|_next)\//u;
function publicAssetReference(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//") || /[\u0000-\u0020\\]/u.test(value)) return false;
  try {
    const url = new URL(value, "https://kd-coffee.local");
    const decoded = decodeURIComponent(url.pathname);
    if (decoded.startsWith("//") || /[\u0000-\u0020\\]/u.test(decoded)) return false;
    // Normalize again after decoding so encoded separators cannot hide traversal.
    if (!publicAssetPrefix.test(new URL(decoded, "https://kd-coffee.local").pathname)) return false;
    for (const key of url.searchParams.keys()) if (/token|secret|signature|authorization|password|api.?key/iu.test(key)) return false;
    return true;
  } catch { return false; }
}
/** Unicode punctuation defines token boundaries, not a list of quote glyphs.
 * Keep word/path joiners out of the start-boundary class: a/b, ./x, 12/24.
 * URI query punctuation is retained inside tokens for publicAssetReference(). */
function pathWrapper(char: string): boolean {
  return /[\p{Ps}\p{Pe}\p{Pi}\p{Pf}\p{Quotation_Mark}\x60]/u.test(char);
}
function pathStartBoundary(char: string | undefined): boolean {
  return char === undefined || /[\s\p{Z}]/u.test(char) || pathWrapper(char)
    || (/[\p{Po}]/u.test(char) && !/[./%\\]/u.test(char)) || /[<=>]/u.test(char);
}
function pathTokenEnd(char: string): boolean {
  return /[\s\p{Z}]/u.test(char) || pathWrapper(char) || /[,;，。；！？、<>]/u.test(char);
}
function wrappedRoot(chars: string[], index: number): boolean {
  let left = index - 1, right = index + 1;
  while (left >= 0 && /[\s\p{Z}]/u.test(chars[left])) left--;
  while (right < chars.length && /[\s\p{Z}]/u.test(chars[right])) right++;
  return left >= 0 && right < chars.length && pathWrapper(chars[left]) && pathWrapper(chars[right]);
}
function unsafeFilesystemReference(value: string, context: "text" | "media" | "admin-route" = "text"): boolean {
  if (context === "admin-route" && value === "/admin/products") return false;
  if (value.trim() === "/") return true;
  // A quoted URL ends at Unicode punctuation. Keep its suffix in the text so
  // an adjacent quoted local path cannot be swallowed by URL masking.
  // ASCII URI brackets remain valid (IPv6 authorities and URL path syntax).
  const text = value.replace(/\bhttps?:\/\/[^\s<>"'\x60]+/giu, token => {
    const chars = Array.from(token);
    const end = chars.findIndex(char => pathWrapper(char) && !"()[]{}".includes(char));
    const urlToken = end < 0 ? token : chars.slice(0, end).join("");
    if (urlToken.includes("\\")) return token;
    try {
      const url = new URL(urlToken);
      return url.protocol === "https:" || url.protocol === "http:" ? " " + token.slice(urlToken.length) : token;
    } catch { return token; }
  });
  if (/(?:^|[^A-Za-z])[A-Za-z]:[\\/]|\\\\/u.test(text)) return true;
  const chars = Array.from(text);
  for (let index = 0; index < chars.length; index++) {
    if (chars[index] !== "/" || !pathStartBoundary(chars[index - 1])) continue;
    let end = index + 1;
    while (end < chars.length && !pathTokenEnd(chars[end])) end++;
    const rawToken = chars.slice(index, end).join("");
    const token = rawToken.replace(/[.：:]+$/u, "");
    if (rawToken === "/") {
      if (wrappedRoot(chars, index)) return true;
    } else if (!publicAssetReference(token)) return true;
    index = end - 1;
  }
  return false;
}
function publicUrl(v: unknown): string | null {
  if (typeof v !== "string" || !v || /[\u0000-\u0020\\]/u.test(v) || unsafeFilesystemReference(v, "media")) return null;
  try {
    const local = v.startsWith("/") && !v.startsWith("//");
    const url = local ? new URL(v, "https://kd-coffee.local") : new URL(v);
    if (!local && (url.protocol !== "https:" || url.username || url.password || /^(?:localhost|127\.|10\.|192\.168\.|0\.|169\.254\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|\[::1\])/iu.test(url.hostname) || /\.(?:localhost|local|internal)$/iu.test(url.hostname))) return null;
    const decodedPath = decodeURIComponent(url.pathname);
    if (/[\u0000-\u0020\\]/u.test(decodedPath)) return null;
    if (local && !publicAssetReference(v)) return null;
    for (const key of url.searchParams.keys()) if (/token|secret|signature|authorization|password|api.?key/iu.test(key)) return null;
    return v;
  } catch { return null; }
}
function resource(key: string, type: TraceResource["type"], url: unknown): TraceResource | null {
  if (!url) return null;
  const safe = publicUrl(url); if (!safe) throw new TraceInputError();
  return { sourceKey: key, type, url: safe };
}
function layers(role: string, configured: TraceResource | null = null, poster: TraceResource | null = null, fallback: TraceResource | null = null): TraceMediaLayers {
  return { role, configured, poster, fallback, loadStatus: "UNKNOWN_SERVER_SIDE" };
}
function trace(ruleId: keyof typeof TRACE_RULE_BINDINGS, value: TraceJson, owner: TraceOwner, key: string, kind: string, depth = 0): EffectiveSourceTrace {
  return {
    effectiveValue: value, hasValue: owner !== "ABSENT", sourceOwner: owner, sourceKey: key, sourceKind: kind,
    sourceLabel: owner === "PRODUCT" ? "商品資料" : owner === "WORKS" ? "作品頁內容" : owner === "MEDIA" ? "本作品素材說明" : owner === "LEGACY_FIXED" ? "既有相容內容" : owner === "DERIVED" ? "依既有規則產生" : owner === "SHARED_SITE_CONTENT" ? "網站共用設定" : owner === "COMMERCE" ? "售價與購買設定" : "尚未設定",
    ruleId, context: "works-detail." + ruleId, isFallback: depth > 0, fallbackDepth: depth,
    isLegacy: true, isExplicitWorksOverride: false, isInherited: false, editableHere: false,
    editDestination: owner === "PRODUCT" || owner === "WORKS" || owner === "MEDIA" ? "/admin/products" : null,
    visibility: owner === "ABSENT" || value === "" ? "empty" : "visible", visibilityReason: owner === "ABSENT" ? "no-effective-value" : "",
    dependencies: [], steps: [], snapshotKind: "LEGACY_SNAPSHOT", bindingStatus: TRACE_RULE_BINDINGS[ruleId],
    selectionMode: "", configurationState: "", fallbackLayers: null, media: null, children: [],
  };
}
function textChoice(rule: "hero.supporting-copy" | "story.main" | "related.title", p: Data): EffectiveSourceTrace {
  const entries = rule === "story.main" ? [["mood", p.mood], ["shortCopy", p.shortCopy], ["subtitle", p.subtitle]]
    : rule === "hero.supporting-copy" ? [["shortCopy", p.shortCopy], ["subtitle", p.subtitle]]
    : [["relatedProducts.title", data(p.relatedProducts, "title")]];
  const steps: TraceStep[] = [];
  for (let index = 0; index < entries.length; index++) {
    const [key, raw] = entries[index]; const value = trimmed(raw);
    const sourceKey = "product." + key;
    if (value) {
      const result = trace(rule, value, "PRODUCT", sourceKey, "PRODUCT_FIELD", index);
      result.steps = [...steps, step(sourceKey, "selected", "non-empty-trimmed", index)]; return result;
    }
    steps.push(step(sourceKey, "skipped", raw === undefined ? "missing" : typeof raw !== "string" ? "not-text" : "empty-after-trim", index));
  }
  const value = rule === "story.main" ? "一杯乾淨、清楚，而且容易親近的精品咖啡。" : rule === "related.title" ? "也可以比較這三款" : "";
  const owner = rule === "hero.supporting-copy" ? "ABSENT" : "LEGACY_FIXED";
  const key = rule === "hero.supporting-copy" ? "absent.heroCopy" : rule === "story.main" ? "legacy.fixedStory" : "legacy.fixedRelatedTitle";
  const result = trace(rule, value, owner, key, owner, entries.length);
  result.steps = [...steps, step(key, "selected", owner === "ABSENT" ? "empty-result" : "fixed-legacy-copy", entries.length)]; return result;
}
function staticImage(v: unknown): string {
  const url = trimmed(v); if (!url) return "";
  try { return /\.(?:mp4|mov|webm)$/iu.test(new URL(url, "https://kd-coffee.local").pathname) ? "" : url; } catch { return ""; }
}
function asset(p: Data, role: string, depth = 0): AssetChoice | null {
  if (!role) return null;
  if (!safeId(role)) throw new TraceInputError();
  const raw = data(p.assets, role); if (!record(raw)) return null;
  const media = isMediaAsset(raw.media) ? raw.media : undefined;
  const poster = staticImage(media?.posterUrl);
  if (poster) return { role, path: poster, sourceKey: "product.assets." + role + ".media.posterUrl", depth, steps: [] };
  const path = staticImage(raw.path);
  return path ? { role, path, sourceKey: "product.assets." + role + ".path", depth, steps: [] } : null;
}
function assetDecision(p: Data, which: "hero" | "product" | "list" | "static", allowProductVisual = true): { choice: AssetChoice | null; steps: TraceStep[] } {
  const layout = record(p.pageLayout) ? p.pageLayout : {};
  const selected = trimmed(layout[which === "hero" ? "heroAsset" : which === "product" ? "productAsset" : "listAsset"]);
  const keys = which === "hero" ? [selected, "hero"] : which === "product" ? [selected, "productPhoto", "mainVisual", "cover", "poster"]
    : which === "list" ? [selected === "productVisual" && !allowProductVisual ? "artworkCover" : selected, "artworkCover", "mainVisual", "cover", "poster"]
    : ["artworkCover", "mainVisual", "cover", "poster"];
  const steps: TraceStep[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const legacy = (which !== "hero" && i >= keys.length - 2);
    const found = legacy ? (() => { const path = staticImage(p[key]); return path ? { role: key, path, sourceKey: "product." + key, depth: i, steps: [] } : null; })() : asset(p, key, i);
    if (found) { found.steps = [...steps, step(found.sourceKey, "selected", legacy ? "legacy-static-image" : "static-asset", i)]; return { choice: found, steps: found.steps }; }
    steps.push(step(legacy ? "product." + key : key ? "product.assets." + key : "product.pageLayout." + which + "Asset", "skipped", "no-static-image", i));
  }
  return { choice: null, steps };
}
function assetChoice(p: Data, which: "hero" | "product" | "list" | "static", allowProductVisual = true): AssetChoice | null {
  return assetDecision(p, which, allowProductVisual).choice;
}
function imageTrace(rule: "seo.image" | "gallery.item", choice: AssetChoice | null, depth = 0): EffectiveSourceTrace {
  if (!choice) return trace(rule, null, "ABSENT", "absent.image", "ABSENT", depth);
  const out = trace(rule, { role: choice.role, path: choice.path }, "MEDIA", choice.sourceKey, "PRODUCT_ASSOCIATED_MEDIA", depth);
  out.steps = choice.steps.slice(); out.media = layers(choice.role, resource(choice.sourceKey, "image", choice.path)); return out;
}
function mediaForItem(item: Data, base: string, role: string): TraceMediaLayers {
  const m = isMediaAsset(item.media) ? item.media : undefined;
  return layers(role, m ? resource(base + ".media.url", m.type, m.url) : resource(base + ".path", "image", trimmed(item.path)),
    m ? resource(base + ".media.posterUrl", "image", m.posterUrl) : null,
    m ? resource(base + ".path", "image", trimmed(item.path)) : null);
}
function roasted(p: Data): EffectiveSourceTrace {
  const raw = objectExists(p.assets) ? data(p.assets, "roastedBeanPhoto") : undefined;
  const a = record(raw) ? raw : {};
  const configured = Array.isArray(a.gallery);
  const entries: { raw: Data; base: string; index: number | null; single: boolean }[] = [];
  const steps: TraceStep[] = [];
  if (configured) for (let i = 0; i < (a.gallery as unknown[]).length; i++) {
    const item = (a.gallery as unknown[])[i]; const base = "product.assets.roastedBeanPhoto.gallery[" + i + "]";
    if (record(item) && (item.path || item.media)) entries.push({ raw: item, base, index: i, single: false });
    else steps.push(step(base, "excluded", "legacy-gallery-filter", i));
  }
  const fromGallery = entries.length > 0;
  const staticPath = asset(p, "roastedBeanPhoto")?.path || "";
  if (!entries.length && (staticPath || a.media)) entries.push({ raw: { path: staticPath, media: a.media || null, caption: a.caption || "", id: "legacy-roasted-1" }, base: "product.assets.roastedBeanPhoto", index: null, single: true });
  const out = trace("roasted-beans.media", [], fromGallery ? "MEDIA" : entries.length ? "MEDIA" : "ABSENT",
    fromGallery ? "product.assets.roastedBeanPhoto.gallery" : entries.length ? "product.assets.roastedBeanPhoto" : "absent.roastedBeans",
    "PRODUCT_ASSOCIATED_MEDIA", fromGallery ? 0 : entries.length ? 1 : 2);
  out.configurationState = configured ? fromGallery ? "GALLERY_NONEMPTY" : (a.gallery as unknown[]).length ? "GALLERY_FILTERED_EMPTY" : "GALLERY_CONFIGURED_EMPTY" : own(a, "gallery") ? "GALLERY_NON_ARRAY" : "GALLERY_ABSENT";
  out.steps = steps;
  for (const entry of entries) {
    const media = mediaForItem(entry.raw, entry.base, "roastedBeanPhoto");
    // The single legacy item's path may come from the media poster, not asset.path.
    if (entry.single && staticPath) {
      const selected = asset(p, "roastedBeanPhoto")!;
      if (media.configured?.sourceKey === entry.base + ".path") media.configured.sourceKey = selected.sourceKey;
      if (media.fallback) media.fallback.sourceKey = selected.sourceKey;
    }
    const type = media.configured?.type;
    const caption = entry.raw.caption;
    const captionTrace = caption ? trace("roasted-beans.caption", scalar(caption), "MEDIA", entry.base + ".caption", "PRODUCT_ASSOCIATED_MEDIA")
      : trace("roasted-beans.caption", type === "video" || type === "youtube" ? "實際烘焙豆影片" : "實際烘焙豆影像", "LEGACY_FIXED", type === "video" || type === "youtube" ? "legacy.viewerVideoCaption" : "legacy.viewerImageCaption", "VIEWER_FIXED", 1);
    const value: TraceJson = { id: safeId(entry.raw.id), originalGalleryIndex: entry.index, primary: media.configured?.url || null, type: type || null, caption: captionTrace.effectiveValue };
    const item = trace("roasted-beans.item", value, "MEDIA", entry.base, "PRODUCT_ASSOCIATED_MEDIA", entry.single ? 1 : 0);
    item.media = media; item.children = [captionTrace]; out.children.push(item); (out.effectiveValue as TraceJson[]).push(value);
    out.steps.push(step(entry.base, "selected", entry.single ? "legacy-single" : "gallery-item", entry.index));
  }
  if (p.showRoastedBeanPhoto !== true && entries.length) { out.visibility = "disabled"; out.visibilityReason = "showRoastedBeanPhoto-not-true"; }
  return out;
}
function gallery(p: Data): EffectiveSourceTrace {
  const l = record(p.pageLayout) ? p.pageLayout : {};
  const configured = Array.isArray(l.galleryAssets);
  const roles = configured ? (l.galleryAssets as unknown[]).map((v, index) => ({ role: trimmed(v), index })).filter(v => Boolean(v.role)) : [{ role: "label", index: 0 }];
  const keys = roles.map(v => v.role);
  const out = trace("gallery.media", [], configured ? "PRODUCT" : "LEGACY_FIXED", configured ? "product.pageLayout.galleryAssets" : "legacy.galleryLabelRole", configured ? "MEDIA_ROLE_SELECTION" : "LEGACY_FIXED", configured ? 0 : 1);
  out.configurationState = configured ? keys.length ? "CONFIGURED" : "CONFIGURED_EMPTY" : "NON_ARRAY_LEGACY_DEFAULT";
  const h = assetChoice(p, "hero"); const pr = assetChoice(p, "product"); const used = new Set<string>(); const usedRoles = new Set<string>();
  for (let i = 0; i < keys.length; i++) {
    const role = roles[i].role; const sourceIndex = roles[i].index; const base = configured ? "product.pageLayout.galleryAssets[" + sourceIndex + "]" : "legacy.galleryLabelRole"; const found = asset(p, role);
    let reason = !found ? "no-static-image" : found.path === h?.path ? "hero-duplicate" : found.path === pr?.path ? "product-photo-duplicate" : usedRoles.has(role) ? "duplicate-asset" : used.has(found.path) ? "duplicate-path" : "";
    if (reason) { out.steps.push(step(base, "excluded", reason, sourceIndex)); continue; }
    const selected = found!; used.add(selected.path); usedRoles.add(role);
    const item = imageTrace("gallery.item", selected); item.dependencies = [base];
    const raw = data(p.assets, role);
    item.effectiveValue = { role, path: selected.path, caption: trimmed(data(raw, "caption")) };
    out.children.push(item); (out.effectiveValue as TraceJson[]).push(item.effectiveValue); out.steps.push(step(base, "selected", "gallery-asset", sourceIndex));
  }
  if (l.showGallery === false) { out.visibility = "disabled"; out.visibilityReason = "showGallery-false"; }
  else if (!out.children.length) { out.visibility = "empty"; out.visibilityReason = "no-displayable-gallery-items"; }
  return out;
}
function related(p: Data, products: Data[]): EffectiveSourceTrace {
  const manual = objectExists(p.relatedProducts); const settings = record(p.relatedProducts) ? p.relatedProducts : {};
  const input = manual ? Array.isArray(settings.productIds) ? settings.productIds : [] : products.map(v => v.slug);
  const out = trace("related.works", [], manual ? "PRODUCT" : "DERIVED", manual ? "product.relatedProducts.productIds" : "legacy.autoRelatedWorks", manual ? "MANUAL_REFERENCES" : "AUTO_LEGACY", manual ? 0 : 1);
  out.selectionMode = manual ? "MANUAL" : "AUTO_LEGACY"; out.configurationState = manual ? "CONFIGURED" : "ABSENT_CONFIG";
  const bySlug = new Map(products.map(v => [v.slug, v])); const seen = new Set<unknown>();
  for (let i = 0; i < input.length; i++) {
    const slug = input[i]; const item = manual ? bySlug.get(slug) : products[i];
    let reason = manual && seen.has(slug) ? "duplicate" : !item ? "unresolved" : item.slug === p.slug ? "self" : item.status === "hidden" ? "hidden" : manual && item.active === false ? "inactive" : !manual && !item.inMonthlyMenu ? "not-in-monthly-menu" : out.children.length >= 3 ? "max-three" : "";
    seen.add(slug);
    const key = manual ? "product.relatedProducts.productIds[" + i + "]" : "catalog.products[" + i + "]";
    if (reason) { out.steps.push(step(key, "excluded", reason, i)); continue; }
    const ref = safeId(item!.slug); if (!ref) throw new TraceInputError();
    const child = trace("related.item", ref, "PRODUCT", key, manual ? "MANUAL_REFERENCE" : "AUTO_LEGACY");
    out.children.push(child); (out.effectiveValue as TraceJson[]).push(ref); out.steps.push(step(key, "selected", manual ? "manual-ordered-reference" : "legacy-auto-reference", i));
  }
  const l = record(p.pageLayout) ? p.pageLayout : {};
  if (manual ? settings.enabled === false : l.showRelatedWorks === false) { out.visibility = "disabled"; out.visibilityReason = manual ? "relatedProducts-disabled" : "showRelatedWorks-false"; }
  else if (!out.children.length) { out.visibility = "empty"; out.visibilityReason = manual ? "manual-no-displayable-selection" : "auto-no-candidates"; }
  return out;
}
function seoImage(p: Data): EffectiveSourceTrace {
  const steps: TraceStep[] = [];
  for (const [index, kind] of (["hero", "product", "list"] as const).entries()) {
    const decision = assetDecision(p, kind);
    const selected = decision.choice;
    if (selected) {
      // The winner and both fallback layers are constructed in this same branch.
      const out = imageTrace("seo.image", selected, index + selected.depth);
      out.fallbackLayers = { roleFallbackDepth: index, resourceFallbackDepth: selected.depth };
      out.steps = [...steps, ...decision.steps];
      out.dependencies = [...new Set(out.steps.map(item => item.sourceKey))];
      out.selectionMode = kind;
      return out;
    }
    steps.push(...decision.steps, step("resolver." + kind + "Asset", "skipped", "no-static-image", index));
  }
  const out = imageTrace("seo.image", null, 3);
  out.fallbackLayers = { roleFallbackDepth: 3, resourceFallbackDepth: null };
  out.steps = steps;
  out.dependencies = [...new Set(steps.map(item => item.sourceKey))];
  return out;
}
function heroMedia(p: Data): EffectiveSourceTrace {
  const l: Data = { heroAsset: "hero", ...(record(p.pageLayout) ? p.pageLayout : {}) };
  const role = str(l.heroAsset); if (role && !safeId(role)) throw new TraceInputError();
  const raw = data(p.assets, role); const m = data(raw, "media"); const video = isMediaAsset(m) && m.type === "video" ? m : undefined;
  const h = assetChoice(p, "hero"); const giotto = p.slug === "giotto-awakening";
  const presentation = h || (giotto ? assetChoice(p, "list", false) : null);
  const product = assetChoice(p, "product"); const staticFallback = assetChoice(p, "static");
  let out: EffectiveSourceTrace;
  if (role === "productVisual") {
    out = trace("hero.media", presentation ? { branch: "PRODUCT_VISUAL", path: presentation.path } : { branch: "PRODUCT_VISUAL", path: "" }, "MEDIA", presentation?.sourceKey || "product.pageLayout.heroAsset", "PRODUCT_VISUAL_SPECIAL");
    out.media = layers(role, presentation ? resource(presentation.sourceKey, "image", presentation.path) : null);
    if (!presentation) { out.visibility = "empty"; out.visibilityReason = "special-branch-has-no-image-no-invented-fallback"; }
  } else if (video) {
    out = trace("hero.media", { branch: "VIDEO", path: video.url }, "MEDIA", "product.assets." + role + ".media.url", "CONFIGURED_VIDEO");
    out.media = layers(role, resource(out.sourceKey, "video", video.url), resource("product.assets." + role + ".media.posterUrl", "image", video.posterUrl),
      resource("product.assets." + role + ".path", "image", staticImage(data(raw, "path"))));
    out.dependencies = staticFallback ? [staticFallback.sourceKey, "legacy.packageVisual"] : ["legacy.packageVisual"];
  } else if (presentation) {
    out = trace("hero.media", { branch: giotto && !h ? "GIOTTO_LIST_COMPATIBILITY" : "HERO_IMAGE", path: presentation.path }, "MEDIA", presentation.sourceKey, giotto && !h ? "GIOTTO_LIST_COMPATIBILITY" : "HERO_STATIC", giotto && !h ? 1 : 0);
    out.media = layers(presentation.role, resource(presentation.sourceKey, "image", presentation.path));
  } else if (product) {
    out = trace("hero.media", { branch: "PRODUCT_PHOTO", path: product.path }, "MEDIA", product.sourceKey, "PRODUCT_PHOTO_FALLBACK", 2);
    out.media = layers(product.role, resource(product.sourceKey, "image", product.path));
  } else out = trace("hero.media", { branch: "PACKAGE_VISUAL", path: null }, "LEGACY_FIXED", "legacy.packageVisual", "PACKAGE_VISUAL", 3);
  out.visibilityReason = out.visibilityReason || "renderer-role-model-browser-fallback-not-parity-bound";
  return out;
}
function cleanMedia(p: Data): EffectiveSourceTrace {
  const giotto = p.slug === "giotto-awakening"; const raw = p.cleanRoastingMedia;
  const configured = record(raw); const normalized = normalizeCleanRoastingMedia(raw, giotto ? CLEAN_ROASTING_LEGACY_CONFIG : undefined);
  const root = trace("clean-roasting.media", { enabled: normalized.enabled !== false, items: [] }, configured ? "PRODUCT" : giotto ? "LEGACY_FIXED" : "ABSENT",
    configured ? "product.cleanRoastingMedia" : giotto ? "legacy.giottoCleanRoastingMedia" : "absent.cleanRoastingMedia", configured ? "NORMALIZED_CONFIG" : giotto ? "GIOTTO_LEGACY" : "ABSENT", configured ? 0 : 1);
  root.configurationState = configured ? "CONFIG_EXISTS" : raw === undefined || raw === null ? "NO_CONFIG" : "NON_RECORD_CONFIG";
  const sourceItems = configured && Array.isArray(raw.items) ? raw.items : giotto && !configured ? CLEAN_ROASTING_LEGACY_CONFIG.items : [];
  const seen = new Set<string>(); const selected: { trace: EffectiveSourceTrace; order: number; index: number }[] = [];
  for (let i = 0; i < sourceItems.length; i++) {
    const base = configured ? "product.cleanRoastingMedia.items[" + i + "]" : "legacy.giottoCleanRoastingMedia.items[" + i + "]";
    const item = sourceItems[i];
    if (i >= 8) { root.steps.push(step(base, "excluded", "max-eight-source-items", i)); continue; }
    if (!record(item)) { root.steps.push(step(base, "excluded", "invalid-media", i)); continue; }
    const requested = trimmed(item.id).slice(0, 80); const id = /^[a-zA-Z0-9_-]+$/u.test(requested) ? requested : "clean-media-" + (i + 1);
    // Normalize ONE known input branch with its original default index. Never infer provenance by matching URLs.
    const one = normalizeCleanRoastingMedia({ items: [{ ...item, id, order: typeof item.order === "number" ? item.order : i }] }).items[0];
    if (!one) { root.steps.push(step(base, "excluded", "invalid-media", i)); continue; }
    if (seen.has(one.id)) { root.steps.push(step(base, "excluded", "duplicate-id", i)); continue; }
    seen.add(one.id);
    const value: TraceJson = { id: one.id, type: one.type, src: one.src, order: one.order ?? i };
    const child = trace("clean-roasting.item", value, configured ? "MEDIA" : "LEGACY_FIXED", base + ".src", configured ? "PRODUCT_ASSOCIATED_MEDIA" : "GIOTTO_LEGACY");
    child.media = layers("cleanRoasting", resource(base + ".src", one.type, one.src), resource(base + ".poster", "image", one.poster) || resource(base + ".media.posterUrl", "image", one.media?.posterUrl));
    if (normalized.enabled === false || one.enabled === false) { child.visibility = "disabled"; child.visibilityReason = normalized.enabled === false ? "config-disabled" : "item-disabled"; root.steps.push(step(base, "excluded", child.visibilityReason, i)); }
    else { selected.push({ trace: child, order: one.order ?? i, index: i }); root.steps.push(step(base, "selected", "normalized-active-item", i)); }
    root.children.push(child);
  }
  selected.sort((a, b) => a.order - b.order || a.index - b.index);
  (root.effectiveValue as { [key: string]: TraceJson }).items = selected.map(v => v.trace.effectiveValue);
  if (normalized.enabled === false) { root.visibility = "disabled"; root.visibilityReason = "config-disabled"; }
  else if (!selected.length) { root.visibility = "empty"; root.visibilityReason = "no-active-media"; }
  return root;
}
function scalar(v: unknown): TraceJson {
  if (v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) return v;
  throw new TraceInputError();
}
function checkOutput(v: unknown, context: "text" | "admin-route" = "text"): void {
  if (typeof v === "string" && unsafeFilesystemReference(v, context)) throw new TraceInputError();
  if (Array.isArray(v)) for (const item of v) checkOutput(item);
  else if (record(v)) for (const [key, item] of Object.entries(v)) {
    if (unsafeFilesystemReference(key)) throw new TraceInputError();
    checkOutput(item, key === "editDestination" ? "admin-route" : "text");
  }
}
function run<T>(ruleId: string, compute: () => T): TraceResult<T> {
  try { const value = compute(); checkOutput(value); return { ok: true, value }; }
  catch { return { ok: false, errors: [{ code: "UNSAFE_OR_UNSUPPORTED_SNAPSHOT", ruleId, message: "The data snapshot cannot be safely traced; no alternative winner was invented." }] }; }
}
export function traceWorksArtwork(product: unknown, catalog: readonly unknown[] = []): TraceResult<Record<string, EffectiveSourceTrace>> {
  return run("artwork", () => {
    const p = productSnapshot(product);
    const catalogCopy = copyData(catalog);
    if (!Array.isArray(catalogCopy) || catalogCopy.length > 1000) throw new TraceInputError();
    const products = catalogCopy.map(productSnapshot);
    let normalized: ReturnType<typeof normalizeProductPageContent> = {}; let normalizationFailed = false;
    try { normalized = normalizeProductPageContent(p.productPageContent); } catch { normalizationFailed = true; }
    const hero = textChoice("hero.supporting-copy", p); const story = textChoice("story.main", p);
    const short = trimmed(p.shortCopy);
    const supplement = short ? trace("story.supplement", short !== story.effectiveValue ? short : "", "PRODUCT", "product.shortCopy", "PRODUCT_FIELD")
      : trace("story.supplement", "", "ABSENT", "absent.storySupplement", "ABSENT");
    supplement.dependencies = [story.sourceKey];
    if (short && short === story.effectiveValue) { supplement.visibility = "suppressed"; supplement.visibilityReason = "duplicate-of-main-story"; supplement.steps = [step("product.shortCopy", "suppressed", "duplicate-of-main-story")]; }
    const flavorRaw = normalized["flavor-notes"]?.description;
    const flavor = flavorRaw ? trace("flavor.narrative", flavorRaw, "WORKS", 'product.productPageContent["flavor-notes"].description', "LEGACY_EDITORIAL")
      : trace("flavor.narrative", "", "ABSENT", "absent.flavorNarrative", "ABSENT", 1);
    flavor.dependencies = ['product.productPageContent["flavor-notes"].description'];
    flavor.steps = [step(flavor.dependencies[0], flavorRaw ? "selected" : "skipped", flavorRaw ? "normalized-description" : "missing-after-normalization")];
    const flavors = Array.isArray(p.flavors) ? p.flavors.filter(v => typeof v === "string" && v.trim()) as string[] : [];
    const tags = trace("flavor.tags", flavors, "PRODUCT", "product.flavors", "PRODUCT_FACT");
    if (!flavors.length) {
      flavor.visibility = "suppressed"; flavor.visibilityReason = "flavor-section-has-no-tags";
      tags.visibility = "empty"; tags.visibilityReason = "no-flavor-tags";
    }
    const description = normalized["clean-roasting"]?.description;
    const managed = objectExists(p.cleanRoastingMedia);
    const roasting = description ? trace("roasting.description", description, "WORKS", 'product.productPageContent["clean-roasting"].description', "LEGACY_EDITORIAL")
      : managed ? trace("roasting.description", "", "ABSENT", "absent.managedRoastingDescription", "MANAGED_MEDIA_EMPTY", 1)
      : trace("roasting.description", LEGACY_CLEAN_ROASTING_PROOFS[0].body, "LEGACY_FIXED", "legacy.cleanRoastingProofs[0].body", "LEGACY_FIXED", 1);
    roasting.dependencies = ["product.cleanRoastingMedia"];
    roasting.steps = [step('product.productPageContent["clean-roasting"].description', description ? "selected" : "skipped", description ? "normalized-description" : "missing-after-normalization")];
    if (!description) roasting.steps.push(step(roasting.sourceKey, "selected", managed ? "managed-media-empty-result" : "legacy-proof-body"));
    const configuredProofs = normalized["clean-roasting"]?.proofs;
    const proofSource = configuredProofs?.length ? configuredProofs : LEGACY_CLEAN_ROASTING_PROOFS;
    const proofs = trace("roasting.proofs", [], configuredProofs?.length ? "WORKS" : "LEGACY_FIXED", configuredProofs?.length ? 'product.productPageContent["clean-roasting"].proofs' : "legacy.cleanRoastingProofs", configuredProofs?.length ? "LEGACY_EDITORIAL" : "LEGACY_FIXED", configuredProofs?.length ? 0 : 1);
    proofs.steps = [step('product.productPageContent["clean-roasting"].proofs', configuredProofs?.length ? "selected" : "skipped", configuredProofs?.length ? "normalized-nonempty-proofs" : "no-nonempty-proof-array")];
    proofSource.forEach((proof, index) => {
      const base = proofs.sourceKey + "[" + index + "]";
      const value: TraceJson = { id: proof.id, title: proof.title, body: proof.body, icon: proof.icon || null };
      const item = trace("roasting.proof", value, proofs.sourceOwner, base, proofs.sourceKind, proofs.fallbackDepth);
      item.dependencies = [base + ".title", base + ".body"]; proofs.children.push(item); (proofs.effectiveValue as TraceJson[]).push(value);
    });
    for (const item of [flavor, roasting, proofs]) if (normalizationFailed) item.steps.push(step("product.productPageContent", "skipped", "legacy-normalization-failed-entire-content"));
    const seo = p.shortCopy ? trace("seo.description", scalar(p.shortCopy), "PRODUCT", "product.shortCopy", "RAW_TRUTHINESS")
      : p.mood !== undefined ? trace("seo.description", scalar(p.mood), "PRODUCT", "product.mood", "RAW_FINAL_OPERAND", 1)
      : trace("seo.description", null, "ABSENT", "absent.routeSeoDescription", "ABSENT", 1);
    seo.steps = p.shortCopy ? [step("product.shortCopy", "selected", "raw-truthy-value")]
      : [step("product.shortCopy", "skipped", "raw-falsy-value"), step(seo.sourceKey, "selected", p.mood === undefined ? "undefined-route-result" : "raw-final-operand")];
    return { heroSupportingCopy: hero, story, storySupplement: supplement, flavorNarrative: flavor, flavorTags: tags, roastingDescription: roasting, roastingProofs: proofs,
      roastedBeans: roasted(p), gallery: gallery(p), relatedWorks: related(p, products), relatedTitle: textChoice("related.title", p),
      seoDescription: seo, seoImage: seoImage(p), heroMedia: heroMedia(p), cleanRoastingMedia: cleanMedia(p) };
  });
}
/** Counterfactual Works state only. It is never labelled as current public output.
 * The inherited trace must come from a trusted adapter for the registered provider. */
export function traceWorksCandidate(input: {
  field: string; state: unknown;
  inheritProvider?: { providerKey: string; trace: EffectiveSourceTrace };
}): TraceResult<EffectiveSourceTrace> {
  return run("works.candidate", () => {
    const safe = copyData(input); if (!record(safe) || typeof safe.field !== "string") throw new TraceInputError();
    const field = safe.field; const checked = validateWorksFieldState(field, safe.state);
    if (!checked.ok) throw new TraceInputError();
    const definition = worksField(field);
    if (checked.value.mode === "value") {
      const out = trace("works.candidate", copyData(checked.value.value) as TraceJson, "WORKS", "worksPage.fields." + field, "EXPLICIT_WORKS_VALUE");
      out.isLegacy = false; out.isExplicitWorksOverride = true; out.snapshotKind = "WORKS_CANDIDATE";
      if (checked.value.value === "" || checked.value.value === null || (Array.isArray(checked.value.value) && !checked.value.value.length)) { out.visibility = "empty"; out.visibilityReason = "explicit-clear"; }
      return out;
    }
    const provider = record(safe.inheritProvider) ? safe.inheritProvider : undefined;
    if (!provider || provider.providerKey !== definition?.inheritSource?.key) throw new TraceInputError();
    const source = copyData(provider.trace) as EffectiveSourceTrace;
    if (!record(source) || !Array.isArray(source.steps) || source.steps.length > 64 || !Number.isInteger(source.fallbackDepth) || source.fallbackDepth < 0 || source.fallbackDepth > 32) throw new TraceInputError();
    if (source.hasValue !== true || typeof source.sourceKey !== "string" || !["PRODUCT", "WORKS", "MEDIA", "COMMERCE", "SHARED_SITE_CONTENT", "LEGACY_FIXED", "DERIVED"].includes(source.sourceOwner) || !/^[A-Za-z][A-Za-z0-9._[\]"-]*$/u.test(source.sourceKey)) throw new TraceInputError();
    const value = validateWorksValue(field, source.effectiveValue);
    if (!value.ok) throw new TraceInputError();
    const out = trace("works.candidate", copyData(value.value) as TraceJson, source.sourceOwner, source.sourceKey, "INHERITED_PROVIDER", source.fallbackDepth);
    out.isLegacy = false; out.isInherited = true; out.snapshotKind = "WORKS_CANDIDATE"; out.dependencies = [str(provider.providerKey)];
    out.steps = source.steps.map(item => {
      if (!record(item) || typeof item.sourceKey !== "string" || !/^[A-Za-z][A-Za-z0-9._[\]"-]*$/u.test(item.sourceKey) || !["selected", "skipped", "excluded", "suppressed"].includes(str(item.disposition)) || !/^[a-z][a-z0-9-]{0,100}$/u.test(str(item.reason)) || !(item.index === null || typeof item.index === "number" && Number.isInteger(item.index) && item.index >= 0)) throw new TraceInputError();
      return { sourceKey: item.sourceKey, disposition: item.disposition as TraceStep["disposition"], reason: str(item.reason), index: item.index as number | null };
    });
    return out;
  });
}
