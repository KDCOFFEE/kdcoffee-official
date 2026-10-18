/** W3.1A pure foundation. Not imported by production routes, UI or storage. */
export const WORKS_CONTRACT_VERSION = 1 as const;
export const WORKS_MAX_OPERATIONS = 32;
export const WORKS_OWNERS = Object.freeze(["PRODUCT", "WORKS", "COMMERCE", "MEDIA", "SYSTEM", "SHARED_SITE_CONTENT"] as const);
export type WorksOwner = typeof WORKS_OWNERS[number];
export const WORKS_READ_GROUPS = Object.freeze(["identity", "productFacts", "editorialContent", "mediaRoles", "relatedWorks", "presentation", "animation", "searchAndShare", "commerceSummary", "systemInfo"] as const);
export const WORKS_WRITE_SCOPES = Object.freeze(["updateEditorialContent", "updateMediaRoles", "updateRelatedWorks", "updatePresentation", "updateAnimation", "updateSearchOverrides"] as const);
export type WorksWriteScope = typeof WORKS_WRITE_SCOPES[number];
/** Media, catalogue, presentation and metadata adapters are deliberately unfinished. */
export const WORKS_ENABLED_WRITE_SCOPES: readonly WorksWriteScope[] = Object.freeze(["updateEditorialContent"]);
export const WORKS_AMBIGUOUS_COPY_IDS = Object.freeze([4, 8, 16, 18, 20, 29] as const);
export type WorksValue = string | number | boolean | null | readonly string[];
export type WorksFieldState = { readonly mode: "value"; readonly value: WorksValue } | { readonly mode: "inherit" };
export type WorksRule =
  | { readonly kind: "text"; readonly maxLength: number; readonly allowEmpty: boolean }
  | { readonly kind: "boolean" }
  | { readonly kind: "number"; readonly min: number; readonly max: number; readonly integer: boolean }
  | { readonly kind: "enum"; readonly values: readonly string[] }
  | { readonly kind: "textList"; readonly maxItems: number; readonly itemMaxLength: number }
  | { readonly kind: "references"; readonly maxItems: number }
  | { readonly kind: "nullableReference" };
export interface WorksSourceDescriptor { readonly owner: WorksOwner; readonly key: string }
export interface WorksFieldDefinition {
  readonly owner: WorksOwner | null;
  readonly scope: WorksWriteScope | null;
  readonly writable: boolean;
  readonly rule: WorksRule;
  readonly legacySource: WorksSourceDescriptor;
  readonly inheritSource?: WorksSourceDescriptor;
  readonly ambiguousCopyId?: number;
}
export const WORKS_MANAGED_FIELDS = Object.freeze([
  "hero.supportingCopy", "story.heading", "story.body", "story.highlights", "flavor.narrative", "roasting.narrative", "drinking.narrative", "closing.body",
  "roastedBeans.caption", "roastedBeans.gallery", "relatedWorks.items", "relatedWorks.title", "hero.media", "cleanRoasting.media",
  "presentation.visible", "presentation.spacing", "presentation.width", "animation.enabled", "animation.preset", "animation.durationMs", "search.title", "search.description", "search.image",
] as const);
export type WorksManagedField = typeof WORKS_MANAGED_FIELDS[number];
export interface WorksState {
  readonly contractVersion: typeof WORKS_CONTRACT_VERSION;
  readonly revision: number;
  readonly fields: Readonly<Partial<Record<WorksManagedField, WorksFieldState>>>;
}
export interface WorksIssue { readonly code: string; readonly path: string; readonly message: string }
export type WorksResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly errors: readonly WorksIssue[] };
export interface WorksOperation { readonly scope: WorksWriteScope; readonly field: WorksManagedField; readonly state: WorksFieldState }
export interface WorksCommand {
  readonly targetRef: string;
  readonly contractVersion: typeof WORKS_CONTRACT_VERSION;
  readonly expectedWorksRevision: number;
  readonly expectedEditToken: string;
  readonly requestId: string;
  readonly operations: readonly WorksOperation[];
}
export interface WorksWriteContext { readonly targetRef: string; readonly currentEditToken: string; readonly currentState?: unknown }
export interface WorksCandidate { readonly targetRef: string; readonly requestId: string; readonly state: WorksState; readonly nextRevision: number }
export type WorksLegacyValues = Readonly<Partial<Record<WorksManagedField, WorksValue>>>;
export type WorksDefaults = Readonly<Partial<Record<WorksManagedField, WorksValue>>>;
export interface WorksResolvedField {
  readonly field: string;
  readonly semantic: "legacy" | "explicit" | "inherit";
  readonly hasValue: boolean;
  /** null + hasValue:false means absent; explicit null has hasValue:true. */
  readonly value: WorksValue;
  readonly source: WorksSourceDescriptor;
}
export interface WorksResolvedFields { readonly revision: number; readonly fields: Readonly<Record<WorksManagedField, WorksResolvedField>> }
export const worksOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);
export function worksRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
/** Read own data properties only: do not invoke accessors or traverse prototypes. */
export function worksData(value: unknown, key: string): unknown {
  if (!worksRecord(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && worksOwn(descriptor, "value") ? descriptor.value : undefined;
}
export const worksReference = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value);
export const worksCopyValue = (value: WorksValue): WorksValue => Array.isArray(value) ? value.slice() : value;
export const worksIssue = (code: string, path: string, message: string): WorksIssue => ({ code, path, message });
const text = (maxLength: number, allowEmpty = true): WorksRule => ({ kind: "text", maxLength, allowEmpty });
const source = (owner: WorksOwner, key: string): WorksSourceDescriptor => ({ owner, key });
function managed(scope: WorksWriteScope, rule: WorksRule, legacySource: WorksSourceDescriptor, inheritSource: WorksSourceDescriptor): WorksFieldDefinition {
  return { owner: "WORKS", scope, writable: scope === "updateEditorialContent", rule, legacySource, inheritSource };
}
const definitions: Record<string, WorksFieldDefinition> = {
  "hero.supportingCopy": managed("updateEditorialContent", text(2000), source("PRODUCT", "product.heroCopy"), source("PRODUCT", "product.heroCopy")),
  "story.heading": managed("updateEditorialContent", text(120), source("PRODUCT", "product.name"), source("SHARED_SITE_CONTENT", "defaults.storyHeading")),
  "story.body": managed("updateEditorialContent", text(2000), source("PRODUCT", "product.legacyStory"), source("PRODUCT", "product.story")),
  "story.highlights": managed("updateEditorialContent", { kind: "textList", maxItems: 6, itemMaxLength: 240 }, source("WORKS", "legacy.storyHighlights"), source("SHARED_SITE_CONTENT", "defaults.storyHighlights")),
  "flavor.narrative": managed("updateEditorialContent", text(2000), source("WORKS", "legacy.flavorNarrative"), source("SHARED_SITE_CONTENT", "defaults.flavorNarrative")),
  "roasting.narrative": managed("updateEditorialContent", text(2000), source("WORKS", "legacy.roastingNarrative"), source("SHARED_SITE_CONTENT", "defaults.roastingNarrative")),
  "drinking.narrative": managed("updateEditorialContent", text(2000), source("WORKS", "legacy.drinkingNarrative"), source("SHARED_SITE_CONTENT", "defaults.drinkingNarrative")),
  "closing.body": managed("updateEditorialContent", text(2000), source("WORKS", "legacy.closingBody"), source("SHARED_SITE_CONTENT", "defaults.closingBody")),
  "roastedBeans.caption": managed("updateMediaRoles", text(500), source("MEDIA", "legacy.roastedCaption"), source("MEDIA", "media.roastedCaption")),
  "roastedBeans.gallery": managed("updateMediaRoles", { kind: "references", maxItems: 8 }, source("MEDIA", "legacy.roastedGallery"), source("MEDIA", "media.roastedGallery")),
  "relatedWorks.items": managed("updateRelatedWorks", { kind: "references", maxItems: 3 }, source("WORKS", "legacy.relatedWorks"), source("WORKS", "defaults.relatedRecommendations")),
  "relatedWorks.title": managed("updateRelatedWorks", text(120), source("WORKS", "legacy.relatedTitle"), source("SHARED_SITE_CONTENT", "defaults.relatedTitle")),
  "hero.media": managed("updateMediaRoles", { kind: "nullableReference" }, source("MEDIA", "legacy.heroMedia"), source("MEDIA", "media.hero")),
  "cleanRoasting.media": managed("updateMediaRoles", { kind: "references", maxItems: 8 }, source("MEDIA", "legacy.cleanRoastingMedia"), source("MEDIA", "media.cleanRoasting")),
  "presentation.visible": managed("updatePresentation", { kind: "boolean" }, source("WORKS", "legacy.visibility"), source("SHARED_SITE_CONTENT", "defaults.visibility")),
  "presentation.spacing": managed("updatePresentation", { kind: "number", min: 0, max: 240, integer: true }, source("WORKS", "legacy.spacing"), source("SHARED_SITE_CONTENT", "defaults.spacing")),
  "presentation.width": managed("updatePresentation", { kind: "enum", values: ["narrow", "standard", "wide"] }, source("WORKS", "legacy.width"), source("SHARED_SITE_CONTENT", "defaults.width")),
  "animation.enabled": managed("updateAnimation", { kind: "boolean" }, source("WORKS", "legacy.animationEnabled"), source("SHARED_SITE_CONTENT", "defaults.animationEnabled")),
  "animation.preset": managed("updateAnimation", { kind: "enum", values: ["none", "fade", "slide-up", "slide-left", "slide-right", "scale-fade"] }, source("WORKS", "legacy.animationPreset"), source("SHARED_SITE_CONTENT", "defaults.animationPreset")),
  "animation.durationMs": managed("updateAnimation", { kind: "number", min: 200, max: 1500, integer: true }, source("WORKS", "legacy.animationDuration"), source("SHARED_SITE_CONTENT", "defaults.animationDuration")),
  "search.title": managed("updateSearchOverrides", text(70, false), source("PRODUCT", "product.searchTitle"), source("PRODUCT", "product.searchTitle")),
  "search.description": managed("updateSearchOverrides", text(180), source("PRODUCT", "product.searchDescription"), source("PRODUCT", "product.searchDescription")),
  "search.image": managed("updateSearchOverrides", { kind: "nullableReference" }, source("MEDIA", "legacy.searchImage"), source("MEDIA", "media.searchImage")),
};
for (const field of ["name", "nameEn", "artist", "tag", "origin", "process", "roast", "variety", "altitude", "flavors", "shortCopy", "subtitle", "mood", "sort"]) {
  definitions[field] = { owner: "PRODUCT", scope: null, writable: false, rule: text(2000), legacySource: source("PRODUCT", `product.${field}`) };
}
for (const field of ["price", "SKU", "skus", "purchase", "stock", "purchasable", "status", "active", "inMonthlyMenu", "showOnHomepage", "showWhenSoldOut", "featured", "publish", "allowBackorder", "pvEnabled", "pvValue"]) {
  definitions[field] = { owner: "COMMERCE", scope: null, writable: false, rule: text(2000), legacySource: source("COMMERCE", `commerce.${field}`) };
}
for (const field of ["id", "sku", "artworkSku", "slug", "sectionIds", "revision"]) {
  definitions[field] = { owner: "SYSTEM", scope: null, writable: false, rule: text(2000), legacySource: source("SYSTEM", `system.${field}`) };
}
for (const field of ["assets", "rawAssets", "media.alt", "media.title", "media.caption", "media.path", "media.url"]) {
  definitions[field] = { owner: "MEDIA", scope: null, writable: false, rule: text(2000), legacySource: source("MEDIA", "media.sharedMetadata") };
}
for (const field of ["siteContent", "site.brand", "site.address", "site.description"]) {
  definitions[field] = { owner: "SHARED_SITE_CONTENT", scope: null, writable: false, rule: text(2000), legacySource: source("SHARED_SITE_CONTENT", "site.sharedContent") };
}
for (const field of ["product", "rawProduct", "productPageContent", "productCustomSections", "pageLayout", "displayFields", "productPageAnimations", "cleanRoastingMedia", "relatedProducts", "campaignDisplay", "worksPage"]) {
  definitions[field] = { owner: "SYSTEM", scope: null, writable: false, rule: text(2000), legacySource: source("SYSTEM", "system.rawReplacement") };
}
for (const id of WORKS_AMBIGUOUS_COPY_IDS) {
  definitions[`copy.${id}`] = { owner: null, scope: null, writable: false, rule: text(2000), legacySource: source("SYSTEM", "system.ambiguousCopy"), ambiguousCopyId: id };
}
for (const definition of Object.values(definitions)) {
  if (definition.rule.kind === "enum") Object.freeze(definition.rule.values);
  Object.freeze(definition.rule); Object.freeze(definition.legacySource);
  if (definition.inheritSource !== undefined) Object.freeze(definition.inheritSource);
  Object.freeze(definition);
}
export const WORKS_FIELD_REGISTRY: Readonly<Record<string, WorksFieldDefinition>> = Object.freeze(definitions);
export function worksField(field: string): WorksFieldDefinition | undefined {
  return worksOwn(WORKS_FIELD_REGISTRY, field) ? WORKS_FIELD_REGISTRY[field] : undefined;
}
