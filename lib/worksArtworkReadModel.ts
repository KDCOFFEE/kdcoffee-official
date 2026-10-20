// @ts-expect-error -- Native Node strip-types requires explicit source extensions (repository convention).
import { WORKS_MANAGED_FIELDS, worksData, worksField, worksIssue, worksOwn, worksRecord, worksReference } from "./worksArtworkContract.ts";
// @ts-expect-error -- Native Node strip-types requires explicit source extensions (repository convention).
import { resolveWorksFields } from "./worksArtworkResolver.ts";
// @ts-expect-error -- Native Node strip-types requires explicit source extensions (repository convention).
import { validateWorksValue } from "./worksArtworkValidation.ts";
import type { WorksDefaults, WorksLegacyValues, WorksManagedField, WorksResolvedField, WorksResult } from "./worksArtworkContract.ts";

const text = (value: unknown): string => typeof value === "string" ? value : "";
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice() : [];
function legacyFirst(values: readonly unknown[], fallback: string): string {
  for (const value of values) if (typeof value === "string" && value.trim() !== "") return value.trim();
  return fallback;
}
/** Only the known text chain is modelled here. Complex legacy media/related output
 * must be supplied as safe, pre-resolved references by a future trusted adapter.
 * This is not a replacement for the production page resolver. */
export function worksLegacyTextValues(product: unknown): WorksLegacyValues {
  const values: Partial<Record<WorksManagedField, string>> = {};
  const shortCopy = worksData(product, "shortCopy"); const subtitle = worksData(product, "subtitle");
  values["hero.supportingCopy"] = legacyFirst([shortCopy, subtitle], "");
  values["story.body"] = legacyFirst([worksData(product, "mood"), shortCopy, subtitle], "一杯乾淨、清楚，而且容易親近的精品咖啡。");
  if (typeof worksData(product, "name") === "string") values["story.heading"] = worksData(product, "name") as string;
  return values;
}
export interface WorksArtworkReadModel {
  readonly identity: { readonly name: string; readonly nameEn: string; readonly artist: string; readonly tag: string };
  readonly productFacts: { readonly origin: string; readonly process: string; readonly roast: string; readonly variety: string; readonly altitude: string; readonly flavors: readonly string[]; readonly shortCopy: string; readonly subtitle: string; readonly mood: string };
  readonly editorialContent: { readonly heroSupportingCopy: WorksResolvedField; readonly storyHeading: WorksResolvedField; readonly storyBody: WorksResolvedField; readonly storyHighlights: WorksResolvedField; readonly flavorNarrative: WorksResolvedField; readonly roastingNarrative: WorksResolvedField; readonly drinkingSuggestion: WorksResolvedField; readonly closingBody: WorksResolvedField };
  readonly mediaRoles: { readonly hero: WorksResolvedField; readonly roastedBeansCaption: WorksResolvedField; readonly roastedBeansGallery: WorksResolvedField; readonly cleanRoasting: WorksResolvedField };
  readonly relatedWorks: { readonly items: WorksResolvedField; readonly title: WorksResolvedField };
  readonly presentation: { readonly visible: WorksResolvedField; readonly spacing: WorksResolvedField; readonly width: WorksResolvedField };
  readonly animation: { readonly enabled: WorksResolvedField; readonly preset: WorksResolvedField; readonly durationMs: WorksResolvedField };
  readonly searchAndShare: { readonly title: WorksResolvedField; readonly description: WorksResolvedField; readonly image: WorksResolvedField };
  readonly commerceSummary: { readonly priceText: string | null; readonly availability: "available" | "sold_out" | "unavailable" | "unknown"; readonly variantLabels: readonly string[] };
  readonly systemInfo: { readonly productId: string | null; readonly artworkSku: string | null; readonly slug: string | null; readonly sectionIds: readonly string[]; readonly worksRevision: number };
}
export function projectWorksArtwork(input: { readonly product: unknown; readonly legacyValues?: WorksLegacyValues; readonly defaults?: WorksDefaults; readonly commerceSummary?: unknown }): WorksResult<WorksArtworkReadModel> {
  if (!worksRecord(input.product)) return { ok: false, errors: [worksIssue("INVALID_PRODUCT", "product", "A source Product object is required for projection only.")] };
  const product = input.product; const legacy: Partial<Record<WorksManagedField, import("./worksArtworkContract.ts").WorksValue>> = {};
  const knownText = worksLegacyTextValues(product);
  if (input.legacyValues !== undefined && !worksRecord(input.legacyValues)) return { ok: false, errors: [worksIssue("INVALID_LEGACY_VALUE", "legacyValues", "A pre-resolved field map is required.")] };
  for (const field of WORKS_MANAGED_FIELDS) {
    if (worksOwn(knownText, field)) legacy[field] = knownText[field];
    if (input.legacyValues !== undefined && worksOwn(input.legacyValues, field)) legacy[field] = input.legacyValues[field];
  }
  const request: { legacyValues: WorksLegacyValues; worksState?: unknown; defaults?: WorksDefaults } = { legacyValues: legacy };
  if (worksOwn(product, "worksPage")) request.worksState = worksData(product, "worksPage");
  if (input.defaults !== undefined) request.defaults = input.defaults;
  const resolved = resolveWorksFields(request); if (!resolved.ok) return resolved;
  const fields = resolved.value.fields;
  // Never project paths/URLs as references, even if supplied as legacy context.
  for (const field of WORKS_MANAGED_FIELDS) {
    const rule = worksField(field)!.rule;
    if ((rule.kind === "references" || rule.kind === "nullableReference") && fields[field].hasValue) {
      const safe = validateWorksValue(field, fields[field].value); if (!safe.ok) return safe;
    }
  }
  const summary = input.commerceSummary;
  const rawPrice = worksData(summary, "priceText"); const rawAvailability = worksData(summary, "availability");
  const safeLabel = (value: unknown): value is string => typeof value === "string" && value.length <= 120 && !/[<>\u0000-\u001f]/u.test(value) && !/^(?:[A-Za-z]:[\\/]|\\\\|file:|\/(?:data|etc|home|Users|var|tmp)(?:\/|$))/u.test(value);
  const availability = rawAvailability === "available" || rawAvailability === "sold_out" || rawAvailability === "unavailable" ? rawAvailability : "unknown";
  const productId = worksData(product, "id"); const artworkSku = worksData(product, "sku"); const slug = worksData(product, "slug");
  const sections = worksData(product, "productCustomSections");
  const sectionIds = Array.isArray(sections) ? sections.map((entry) => worksData(entry, "id")).filter(worksReference) : [];
  return { ok: true, value: {
    identity: { name: text(worksData(product, "name")), nameEn: text(worksData(product, "nameEn")), artist: text(worksData(product, "artist")), tag: text(worksData(product, "tag")) },
    productFacts: { origin: text(worksData(product, "origin")), process: text(worksData(product, "process")), roast: text(worksData(product, "roast")), variety: text(worksData(product, "variety")), altitude: text(worksData(product, "altitude")), flavors: strings(worksData(product, "flavors")), shortCopy: text(worksData(product, "shortCopy")), subtitle: text(worksData(product, "subtitle")), mood: text(worksData(product, "mood")) },
    editorialContent: { heroSupportingCopy: fields["hero.supportingCopy"], storyHeading: fields["story.heading"], storyBody: fields["story.body"], storyHighlights: fields["story.highlights"], flavorNarrative: fields["flavor.narrative"], roastingNarrative: fields["roasting.narrative"], drinkingSuggestion: fields["drinking.narrative"], closingBody: fields["closing.body"] },
    mediaRoles: { hero: fields["hero.media"], roastedBeansCaption: fields["roastedBeans.caption"], roastedBeansGallery: fields["roastedBeans.gallery"], cleanRoasting: fields["cleanRoasting.media"] },
    relatedWorks: { items: fields["relatedWorks.items"], title: fields["relatedWorks.title"] },
    presentation: { visible: fields["presentation.visible"], spacing: fields["presentation.spacing"], width: fields["presentation.width"] },
    animation: { enabled: fields["animation.enabled"], preset: fields["animation.preset"], durationMs: fields["animation.durationMs"] },
    searchAndShare: { title: fields["search.title"], description: fields["search.description"], image: fields["search.image"] },
    commerceSummary: { priceText: safeLabel(rawPrice) ? rawPrice : null, availability, variantLabels: strings(worksData(summary, "variantLabels")).filter(safeLabel).slice(0, 20) },
    systemInfo: { productId: worksReference(productId) ? productId : null, artworkSku: worksReference(artworkSku) ? artworkSku : null, slug: worksReference(slug) ? slug : null, sectionIds, worksRevision: resolved.value.revision },
  } };
}


/** W3.2A-2 Owner DISPLAY model. Never a save snapshot or a write command.
 * The W3.1A projectWorksArtwork API above retains its foundation semantics. */
export type OwnerSectionId = "overview" | "pageContent" | "productFacts" | "purchase" | "media" | "relatedWorks" | "presentation" | "animation" | "searchAndShare" | "systemInfo";
export type OwnerBinding = "CURRENT_PUBLIC_PARITY_VERIFIED" | "MODEL_ONLY" | "FUTURE_CANDIDATE" | "UNAVAILABLE";
export type OwnerFieldState = "legacy" | "explicit" | "explicit-blank" | "inherited" | "missing" | "disabled" | "invalid" | "suppressed";
export type OwnerImpact = "ARTWORK_DETAIL" | "WORKS_LIST" | "PRODUCT_REFERENCES" | "COMMERCE" | "SEARCH_SHARE" | "SHARED_SITE" | "SYSTEM_ONLY";
export type OwnerAuthority = "PRODUCT" | "WORKS" | "MEDIA" | "COMMERCE" | "SYSTEM" | "DERIVED";
export type OwnerDestinationKind = "WORKS_FUTURE" | "PRODUCT_ADMIN" | "COMMERCE_ADMIN" | "MEDIA_ADMIN" | "SYSTEM_ONLY" | "NO_CURRENT_EDITOR";
export interface OwnerEditDestination { readonly kind: OwnerDestinationKind; readonly href: "/admin/products" | null; readonly label: string }
export interface OwnerFieldDefinition {
  readonly fieldId: string; readonly label: string; readonly section: OwnerSectionId;
  readonly displayLocations: readonly string[]; readonly impactScope: readonly OwnerImpact[];
  readonly ownership: OwnerAuthority; readonly editCapability: "EXTERNAL_EDITOR" | "WRITE_NOT_CONNECTED" | "SYSTEM_ONLY" | "UNAVAILABLE";
  readonly editDestination: OwnerEditDestination; readonly optional: boolean;
  readonly completenessRole: "REQUIRED" | "OPTIONAL" | "STATUS_ONLY" | "EXCLUDED";
}
export interface OwnerFieldWarning { readonly fieldId: string; readonly code: string; readonly label: string }
export interface OwnerReadField {
  readonly id: string; readonly label: string; readonly section: OwnerSectionId;
  readonly value: import("./worksArtworkSourceTrace.ts").TraceJson; readonly hasValue: boolean;
  readonly state: OwnerFieldState; readonly statusLabel: string; readonly ownership: OwnerAuthority;
  readonly source: {
    readonly owner: import("./worksArtworkSourceTrace.ts").TraceOwner | "SYSTEM";
    readonly key: string; readonly label: string; readonly binding: OwnerBinding; readonly bindingLabel: string;
    /** Only the three explicitly connected Works fields may set this marker. */
    readonly connected?: true;
    readonly trace: import("./worksArtworkSourceTrace.ts").EffectiveSourceTrace | null;
  };
  readonly display: { readonly locations: readonly string[]; readonly visibility: "visible" | "empty" | "disabled" | "suppressed" | "unknown"; readonly reason: string };
  readonly impact: readonly OwnerImpact[];
  readonly editing: { readonly editableHere: false; readonly capability: OwnerFieldDefinition["editCapability"]; readonly destination: OwnerEditDestination };
  readonly optional: boolean; readonly completenessRole: OwnerFieldDefinition["completenessRole"];
  readonly warning: OwnerFieldWarning | null;
}
export interface OwnerPublicState {
  readonly state: "YES" | "NO" | "UNKNOWN";
  readonly basis: "CALLER_DERIVED" | "NOT_PROVIDED" | "INVALID_INPUT";
}
export interface OwnerCommerceDisplay {
  readonly priceText: string | null; readonly availability: "available" | "sold_out" | "unavailable" | "unknown";
  readonly variantLabels: readonly string[]; readonly availableChoiceCount: number | null;
}
export interface OwnerCompleteness {
  readonly category: "productFacts" | "pageContent" | "media" | "searchAndShare" | "purchase";
  readonly state: "COMPLETE" | "NEEDS_ATTENTION" | "OPTIONAL" | "NOT_APPLICABLE" | "READ_ONLY_ISSUE";
  readonly completed: number; readonly required: number; readonly needsAttention: number;
  readonly fieldIds: readonly string[];
}
export interface WorksArtworkOwnerProjection {
  readonly writePreparation?: { readonly worksRevision: number; readonly editToken: string };
  readonly schemaVersion: 1; readonly capability: "READ_ONLY"; readonly contract: "DISPLAY_ONLY_NOT_WRITE_PAYLOAD";
  readonly overview: { readonly fieldIds: readonly string[] };
  readonly sections: readonly { readonly id: OwnerSectionId; readonly label: string; readonly fieldIds: readonly string[]; readonly collapsedByDefault: boolean }[];
  readonly fields: readonly OwnerReadField[];
  /** Never substitutes for fields' current legacy/parity values. */
  readonly futureCandidates: readonly OwnerReadField[];
  readonly publicStates: { readonly detailPage: OwnerPublicState; readonly worksList: OwnerPublicState; readonly purchase: OwnerPublicState };
  readonly commerceSummary: OwnerCommerceDisplay;
  readonly relatedWorks: { readonly mode: "MANUAL" | "AUTO_LEGACY" | "UNAVAILABLE"; readonly configuredCount: number | null; readonly effectiveCount: number; readonly excludedCount: number; readonly ordering: "MANUAL_ORDER" | "CATALOG_ORDER" | "UNKNOWN"; readonly items: readonly { readonly ref: string; readonly name: string | null }[]; readonly exclusionReasons: readonly string[] };
  readonly completeness: readonly OwnerCompleteness[];
  readonly systemInfo: { readonly collapsedByDefault: true; readonly namespace: "LEGACY_UNMANAGED" | "WORKS_CANDIDATE" | "WORKS_CONNECTED"; readonly connectedFieldIds?: readonly string[]; readonly contractVersion: number | null; readonly worksRevision: number | null };
  readonly warnings: readonly OwnerFieldWarning[];
}
export type WorksOwnerProjectionResult =
  | { readonly ok: true; readonly value: WorksArtworkOwnerProjection }
  | { readonly ok: false; readonly errors: readonly { readonly code: "INVALID_INPUT" | "INVALID_IDENTITY" | "INVALID_WORKS_CONTRACT" | "UNSAFE_PROJECTION"; readonly label: string }[] };
