// @ts-expect-error -- Native Node strip-types requires explicit source extensions (repository convention).
import { WORKS_CONTRACT_VERSION, WORKS_ENABLED_WRITE_SCOPES, WORKS_MAX_OPERATIONS, WORKS_WRITE_SCOPES, worksCopyValue, worksField, worksIssue, worksOwn, worksRecord, worksReference } from "./worksArtworkContract.ts";
import type { WorksCommand, WorksFieldState, WorksIssue, WorksManagedField, WorksResult, WorksState, WorksValue, WorksWriteScope } from "./worksArtworkContract.ts";

const forbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);
const failed = <T>(code: string, path: string, message: string): WorksResult<T> => ({ ok: false, errors: [worksIssue(code, path, message)] });
const success = <T>(value: T): WorksResult<T> => ({ ok: true, value });
/** Exact JSON UTF-8 bytes for a primitive string, without serialization hooks.
 * Quotes/backslashes/control characters and unpaired UTF-16 surrogates are escaped. */
function jsonStringBytes(value: string): number {
  let bytes = 2;
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit === 34 || unit === 92 || unit === 8 || unit === 9 || unit === 10 || unit === 12 || unit === 13) bytes += 2;
    else if (unit < 32) bytes += 6;
    else if (unit < 128) bytes++;
    else if (unit < 2048) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { bytes += 4; index++; }
      else bytes += 6;
    } else bytes += unit >= 0xdc00 && unit <= 0xdfff ? 6 : 3;
  }
  return bytes;
}
/** Inspect descriptors and return detached JSON data. Never serialize caller input
 * or invoke its getters, iterator, array methods, species or toJSON hooks.
 * Portable JS cannot identify arbitrary Proxies without reflection; reflective
 * failures are caught, but callers must not treat this as a Proxy sandbox. */
function inspectWorksJson(input: unknown): WorksResult<unknown> {
  let nodes = 0; let bytes = 0;
  const ancestors = new WeakSet<object>();
  const limit = (path: string): WorksResult<unknown> => failed("JSON_LIMIT", path, "JSON structure or encoded size exceeds the foundation limit.");
  const addBytes = (count: number): boolean => { bytes += count; return bytes <= 50 * 1024; };
  const visit = (value: unknown, depth: number, path: string): WorksResult<unknown> => {
    if (++nodes > 10000 || depth > 24) return limit(path);
    if (value === null) return addBytes(4) ? success(null) : limit(path);
    if (typeof value === "boolean") return addBytes(value ? 4 : 5) ? success(value) : limit(path);
    if (typeof value === "string") return value.length <= 64000 && addBytes(jsonStringBytes(value)) ? success(value) : limit(path);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return failed("NON_JSON_VALUE", path, "A finite JSON number is required.");
      return addBytes(String(value).length) ? success(value) : limit(path);
    }
    if (typeof value !== "object") return failed("NON_JSON_VALUE", path, "Only JSON data is accepted.");
    if (ancestors.has(value)) return failed("NON_JSON_VALUE", path, "Cyclic structures are not accepted.");
    const array = Array.isArray(value);
    const proto = Object.getPrototypeOf(value);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) return failed("NON_JSON_VALUE", path, "Only standard arrays and plain data objects are accepted.");
    if (Object.getOwnPropertySymbols(value).length > 0) return failed("NON_JSON_VALUE", path, "Symbol properties are not accepted.");
    const lengthDescriptor = array ? Object.getOwnPropertyDescriptor(value, "length") : undefined;
    const length: unknown = lengthDescriptor !== undefined && worksOwn(lengthDescriptor, "value") ? lengthDescriptor.value : undefined;
    if (array && (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0 || length > 256)) return limit(path);
    const keys = Object.getOwnPropertyNames(value);
    if (keys.length > 10000) return limit(path);
    if (array && keys.length !== (length as number) + 1) return failed("NON_JSON_VALUE", path, "Arrays must be dense and contain only own data indices and length.");
    if (!addBytes(2)) return limit(path);
    ancestors.add(value);
    if (array) {
      for (const key of keys) {
        if (key !== "length" && (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= (length as number))) return failed("NON_JSON_VALUE", path, "Unexpected array properties are not accepted.");
      }
      const output: unknown[] = [];
      for (let index = 0; index < (length as number); index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !descriptor.enumerable || !worksOwn(descriptor, "value")) return failed("NON_JSON_VALUE", path, "Sparse arrays, hidden indices and accessors are not accepted.");
        if (index > 0 && !addBytes(1)) return limit(path);
        const item = visit(descriptor.value, depth + 1, path + "[" + index + "]");
        if (!item.ok) return item;
        output.push(item.value);
      }
      ancestors.delete(value);
      return success(output);
    }
    const output: Record<string, unknown> = Object.create(null);
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];
      if (forbiddenKeys.has(key)) return failed("PROTOTYPE_KEY", path, "Prototype-style keys are forbidden.");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !worksOwn(descriptor, "value")) return failed("NON_JSON_VALUE", path, "Accessors and hidden properties are not accepted.");
      if (key.length > 64000 || !addBytes(jsonStringBytes(key) + 1 + (index > 0 ? 1 : 0))) return limit(path);
      const item = visit(descriptor.value, depth + 1, path + "." + key);
      if (!item.ok) return item;
      output[key] = item.value;
    }
    ancestors.delete(value);
    return success(output);
  };
  try { return visit(input, 0, "input"); }
  catch { return failed("NON_JSON_VALUE", "input", "Input cannot be safely inspected as JSON data."); }
}
export function validateWorksJson(input: unknown): WorksResult<true> {
  const checked = inspectWorksJson(input);
  return checked.ok ? success(true) : checked;
}
function exactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): WorksIssue[] {
  return Object.keys(value).filter((key) => !allowed.includes(key)).map(() => worksIssue("UNKNOWN_KEY", path, "Unknown properties are not accepted."));
}
function textProblem(value: string, maxLength: number, allowEmpty: boolean): string | undefined {
  if (value === "") return allowEmpty ? undefined : "A non-empty value is required.";
  if (value.trim() === "") return "Whitespace-only text is rejected, not converted to missing.";
  if (Array.from(value).length > maxLength) return "Text exceeds the registered length.";
  if (/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) return "HTML markers and unsafe control characters are not accepted.";
  return undefined;
}
export function validateWorksValue(field: string, input: unknown): WorksResult<WorksValue> {
  const json = inspectWorksJson(input); if (!json.ok) return json;
  input = json.value;
  const definition = worksField(field);
  if (definition === undefined) return failed("UNKNOWN_FIELD", "field", "The field is not registered.");
  if (definition.ambiguousCopyId !== undefined) return failed("AMBIGUOUS_COPY", "field", "Ambiguous copy cannot be managed by Works.");
  if (definition.owner !== "WORKS") return failed("FORBIDDEN_FIELD", "field", "The authoritative owner is not Works.");
  const rule = definition.rule; let valid = false;
  if (rule.kind === "text") valid = typeof input === "string" && textProblem(input, rule.maxLength, rule.allowEmpty) === undefined;
  else if (rule.kind === "boolean") valid = typeof input === "boolean";
  else if (rule.kind === "number") valid = typeof input === "number" && Number.isFinite(input) && input >= rule.min && input <= rule.max && (!rule.integer || Number.isInteger(input));
  else if (rule.kind === "enum") valid = typeof input === "string" && rule.values.includes(input);
  else if (rule.kind === "nullableReference") valid = input === null || worksReference(input);
  else if (Array.isArray(input) && input.length <= rule.maxItems) {
    valid = rule.kind === "references"
      ? input.every(worksReference) && new Set(input).size === input.length
      : input.every((item) => typeof item === "string" && textProblem(item, rule.itemMaxLength, false) === undefined);
  }
  return valid ? success(worksCopyValue(input as WorksValue)) : failed("INVALID_VALUE", field, "Value does not satisfy the registered type, empty policy or bounds.");
}
export function validateWorksFieldState(field: string, input: unknown): WorksResult<WorksFieldState> {
  const json = inspectWorksJson(input); if (!json.ok) return json;
  input = json.value;
  const definition = worksField(field);
  if (definition === undefined) return failed("UNKNOWN_FIELD", "field", "The field is not registered.");
  if (definition.ambiguousCopyId !== undefined) return failed("AMBIGUOUS_COPY", "field", "Ambiguous copy cannot be managed by Works.");
  if (definition.owner !== "WORKS") return failed("FORBIDDEN_FIELD", "field", "Product, Commerce, Media, Shared Site and System fields are read-only.");
  if (!worksRecord(input)) return failed("INVALID_STATE", field, "A discriminated field state is required.");
  if (input.mode === "inherit") {
    const errors = exactKeys(input, ["mode"], field);
    if (errors.length > 0) return { ok: false, errors };
    if (definition.inheritSource === undefined) return failed("NO_DEFAULT", field, "No inherit source is registered.");
    return success({ mode: "inherit" });
  }
  if (input.mode !== "value" || !worksOwn(input, "value")) return failed("INVALID_STATE", field, "Explicit value or inherit is required.");
  const errors = exactKeys(input, ["mode", "value"], field);
  if (errors.length > 0) return { ok: false, errors };
  const value = validateWorksValue(field, input.value);
  return value.ok ? success({ mode: "value", value: value.value }) : value;
}
export function validateWorksState(input: unknown): WorksResult<WorksState> {
  const json = inspectWorksJson(input); if (!json.ok) return json;
  input = json.value;
  if (!worksRecord(input)) return failed("INVALID_WORKS_STATE", "worksPage", "A Works state object is required.");
  const errors = exactKeys(input, ["contractVersion", "revision", "fields"], "worksPage");
  if (input.contractVersion !== WORKS_CONTRACT_VERSION) errors.push(worksIssue("CONTRACT_VERSION", "contractVersion", "Unsupported Works contract version."));
  if (!Number.isSafeInteger(input.revision) || (input.revision as number) < 0) errors.push(worksIssue("INVALID_REVISION", "revision", "A non-negative safe integer is required."));
  if (!worksRecord(input.fields)) return { ok: false, errors: [...errors, worksIssue("INVALID_FIELDS", "fields", "An explicit field-state map is required.")] };
  const fields: Partial<Record<WorksManagedField, WorksFieldState>> = {};
  for (const [field, raw] of Object.entries(input.fields)) {
    const result = validateWorksFieldState(field, raw);
    if (result.ok) fields[field as WorksManagedField] = result.value;
    else errors.push(...result.errors);
  }
  return errors.length > 0 ? { ok: false, errors } : success({ contractVersion: WORKS_CONTRACT_VERSION, revision: input.revision as number, fields });
}
export function validateWorksCommand(input: unknown): WorksResult<WorksCommand> {
  const json = inspectWorksJson(input); if (!json.ok) return json;
  input = json.value;
  if (!worksRecord(input)) return failed("INVALID_COMMAND", "command", "A narrow Works command is required.");
  const errors = exactKeys(input, ["targetRef", "contractVersion", "expectedWorksRevision", "expectedEditToken", "requestId", "operations"], "command");
  if (input.contractVersion !== WORKS_CONTRACT_VERSION) errors.push(worksIssue("CONTRACT_VERSION", "contractVersion", "Unsupported Works contract version."));
  if (!worksReference(input.targetRef)) errors.push(worksIssue("INVALID_TARGET", "targetRef", "A single opaque artwork reference is required."));
  if (!Number.isSafeInteger(input.expectedWorksRevision) || (input.expectedWorksRevision as number) < 0) errors.push(worksIssue("INVALID_REVISION", "expectedWorksRevision", "A non-negative safe integer is required."));
  if (typeof input.expectedEditToken !== "string" || !/^[A-Za-z0-9._~-]{1,256}$/u.test(input.expectedEditToken)) errors.push(worksIssue("INVALID_TOKEN", "expectedEditToken", "An opaque edit token is required."));
  if (typeof input.requestId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{7,99}$/u.test(input.requestId)) errors.push(worksIssue("INVALID_REQUEST_ID", "requestId", "A request ID of 8-100 safe characters is required."));
  if (!Array.isArray(input.operations) || input.operations.length < 1 || input.operations.length > WORKS_MAX_OPERATIONS) return { ok: false, errors: [...errors, worksIssue("INVALID_OPERATIONS", "operations", "A bounded, non-empty operation list is required.")] };
  const operations: WorksCommand["operations"][number][] = []; const seen = new Set<string>();
  for (const raw of input.operations) {
    if (!worksRecord(raw)) { errors.push(worksIssue("INVALID_OPERATION", "operations", "A scoped field operation is required.")); continue; }
    errors.push(...exactKeys(raw, ["scope", "field", "state"], "operations"));
    const scopeKnown = typeof raw.scope === "string" && (WORKS_WRITE_SCOPES as readonly string[]).includes(raw.scope);
    if (!scopeKnown) errors.push(worksIssue("UNKNOWN_SCOPE", "scope", "Unknown write scope."));
    else if (!(WORKS_ENABLED_WRITE_SCOPES as readonly string[]).includes(raw.scope as string)) errors.push(worksIssue("SCOPE_UNSUPPORTED", "scope", "This scope requires a later adapter contract."));
    if (typeof raw.field !== "string") { errors.push(worksIssue("UNKNOWN_FIELD", "field", "A registered field is required.")); continue; }
    const state = validateWorksFieldState(raw.field, raw.state);
    if (!state.ok) errors.push(...state.errors);
    const definition = worksField(raw.field);
    if (definition?.owner === "WORKS" && (!definition.writable || definition.scope !== raw.scope)) errors.push(worksIssue("FIELD_SCOPE", "field", "This field is not enabled for the requested scope."));
    if (seen.has(raw.field)) errors.push(worksIssue("DUPLICATE_FIELD", "field", "A command may take over each field only once."));
    seen.add(raw.field);
    if (state.ok && scopeKnown) operations.push({ scope: raw.scope as WorksWriteScope, field: raw.field as WorksManagedField, state: state.value });
  }
  return errors.length > 0 ? { ok: false, errors } : success({ targetRef: input.targetRef as string, contractVersion: WORKS_CONTRACT_VERSION, expectedWorksRevision: input.expectedWorksRevision as number, expectedEditToken: input.expectedEditToken as string, requestId: input.requestId as string, operations });
}
