// @ts-expect-error -- Native Node strip-types requires explicit source extensions (repository convention).
import { WORKS_MANAGED_FIELDS, worksCopyValue, worksField, worksIssue, worksOwn, worksRecord } from "./worksArtworkContract.ts";
// @ts-expect-error -- Native Node strip-types requires explicit source extensions (repository convention).
import { validateWorksFieldState, validateWorksState, validateWorksValue } from "./worksArtworkValidation.ts";
import type { WorksDefaults, WorksLegacyValues, WorksManagedField, WorksResolvedField, WorksResolvedFields, WorksResult, WorksSourceDescriptor, WorksState, WorksValue } from "./worksArtworkContract.ts";

export interface ResolveWorksFieldInput {
  readonly field: string;
  /** Already-resolved legacy output. This adapter never calls the production resolver. */
  readonly legacyValue?: WorksValue;
  readonly state?: unknown;
  /** Values supplied by a future trusted source adapter; source identities are registered. */
  readonly defaults?: WorksDefaults;
}
const copySource = (source: WorksSourceDescriptor): WorksSourceDescriptor => ({ owner: source.owner, key: source.key });
function legacyValue(value: unknown): value is WorksValue {
  return value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) || (Array.isArray(value) && Array.from(value).every((item) => typeof item === "string"));
}
export function resolveWorksField(input: ResolveWorksFieldInput): WorksResult<WorksResolvedField> {
  const definition = worksField(input.field);
  if (definition === undefined) return { ok: false, errors: [worksIssue("UNKNOWN_FIELD", "field", "The field is not registered.")] };
  if (definition.ambiguousCopyId !== undefined) return { ok: false, errors: [worksIssue("AMBIGUOUS_COPY", "field", "Ambiguous copy has no managed resolver contract.")] };
  if (!worksOwn(input, "state")) {
    const hasValue = worksOwn(input, "legacyValue") && input.legacyValue !== undefined;
    if (hasValue && !legacyValue(input.legacyValue)) return { ok: false, errors: [worksIssue("INVALID_LEGACY_VALUE", input.field, "Legacy input must be a pre-resolved scalar or string list.")] };
    return { ok: true, value: { field: input.field, semantic: "legacy", hasValue, value: hasValue ? worksCopyValue(input.legacyValue!) : null, source: copySource(definition.legacySource) } };
  }
  const state = validateWorksFieldState(input.field, input.state);
  if (!state.ok) return state;
  if (state.value.mode === "value") return { ok: true, value: { field: input.field, semantic: "explicit", hasValue: true, value: worksCopyValue(state.value.value), source: { owner: "WORKS", key: `works.${input.field}` } } };
  if (definition.inheritSource === undefined || !worksRecord(input.defaults) || !worksOwn(input.defaults, input.field)) return { ok: false, errors: [worksIssue("DEFAULT_UNAVAILABLE", input.field, "The registered inherit provider must supply a value; legacy is not a substitute.")] };
  const inherited = validateWorksValue(input.field, input.defaults[input.field as WorksManagedField]);
  if (!inherited.ok) return inherited;
  return { ok: true, value: { field: input.field, semantic: "inherit", hasValue: true, value: inherited.value, source: copySource(definition.inheritSource) } };
}
export function resolveWorksFields(input: { readonly legacyValues?: WorksLegacyValues; readonly worksState?: unknown; readonly defaults?: WorksDefaults }): WorksResult<WorksResolvedFields> {
  let state: WorksState | undefined;
  if (worksOwn(input, "worksState")) {
    const checked = validateWorksState(input.worksState);
    if (!checked.ok) return checked;
    state = checked.value;
  }
  if (input.legacyValues !== undefined && !worksRecord(input.legacyValues)) return { ok: false, errors: [worksIssue("INVALID_LEGACY_VALUE", "legacyValues", "A pre-resolved field map is required.")] };
  const fields = {} as Record<WorksManagedField, WorksResolvedField>;
  for (const field of WORKS_MANAGED_FIELDS) {
    const request: { field: string; legacyValue?: WorksValue; state?: unknown; defaults?: WorksDefaults } = { field };
    if (input.legacyValues !== undefined && worksOwn(input.legacyValues, field)) request.legacyValue = input.legacyValues[field];
    if (state !== undefined && worksOwn(state.fields, field)) request.state = state.fields[field];
    if (input.defaults !== undefined) request.defaults = input.defaults;
    const resolved = resolveWorksField(request);
    if (!resolved.ok) return resolved;
    fields[field] = resolved.value;
  }
  return { ok: true, value: { revision: state === undefined ? 0 : state.revision, fields } };
}

// W3.4B: only these fields are connected to current public content.
export const WORKS_FIRST_EDIT_FIELDS = Object.freeze(["hero.supportingCopy", "story.body", "flavor.narrative"] as const);
export type WorksFirstEditField = typeof WORKS_FIRST_EDIT_FIELDS[number];
export function isWorksFirstEditField(field: string): field is WorksFirstEditField {
  return (WORKS_FIRST_EDIT_FIELDS as readonly string[]).includes(field);
}
export function isWorksEditorialText(value: unknown): value is string {
  return typeof value === "string" && Array.from(value).length <= 2000 &&
    (value === "" || value.trim() !== "") &&
    !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\uD800-\uDFFF]/u.test(value);
}
/** ALREADY resolved legacy input; never rebuilds legacy fallbacks. */
export function resolveWorksEditorialText(field: WorksFirstEditField, legacy: string, product: unknown): WorksResult<WorksResolvedField> {
  if (!worksRecord(product) || !worksOwn(product, "worksPage")) return resolveWorksField({ field, legacyValue: legacy });
  const checked = validateWorksState(product.worksPage);
  if (!checked.ok) return checked;
  const state = checked.value.fields[field];
  if (state === undefined) return resolveWorksField({ field, legacyValue: legacy });
  if (state.mode !== "value" || !isWorksEditorialText(state.value)) return {
    ok: false, errors: [worksIssue("INVALID_EDITORIAL_STATE", field, "This public field requires explicit valid text.")]
  };
  return resolveWorksField({ field, legacyValue: legacy, state });
}
