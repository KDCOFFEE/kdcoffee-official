import { DEFAULT_MEMBER_CENTER_COPY, MEMBER_CENTER_COPY_CATALOG } from "./memberCenterCopyCatalog";

export { DEFAULT_MEMBER_CENTER_COPY, MEMBER_CENTER_COPY_CATALOG } from "./memberCenterCopyCatalog";
export type MemberCopyOverrides = Record<string, string>;
export type MemberCopyValues = Record<string, string | number | null | undefined>;
const definitions = new Map(MEMBER_CENTER_COPY_CATALOG.map((entry) => [entry.key, entry]));
const defaultsByText = new Map(MEMBER_CENTER_COPY_CATALOG.map((entry) => [entry.defaultText, entry]));
const TOKEN = /\{([A-Za-z][A-Za-z0-9]*)\}/g;
export const MEMBER_COPY_MAX_LENGTH = 4000;

export function memberCopyValidationError(key: string, value: unknown): string | null {
  const entry = definitions.get(key);
  if (!entry) return "不支援的顯示文字欄位。";
  if (typeof value !== "string" || !value.trim()) return "文字不可留空；請使用恢復預設。";
  if (value.length > MEMBER_COPY_MAX_LENGTH) return "文字最多 4000 個字元。";
  if (/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) return "只支援純文字，不能包含 HTML 或控制字元。";
  const tokens = [...value.matchAll(TOKEN)].map((match) => match[1]);
  if (/[{}]/u.test(value.replace(TOKEN, ""))) return "只能使用此欄位列出的動態變數。";
  if (tokens.some((name) => !Object.hasOwn(entry.tokens, name))) return "含有不允許的動態變數。";
  if (Object.keys(entry.tokens).some((name) => !tokens.includes(name))) return "請保留此欄位所有動態變數，以顯示原系統資料。";
  return null;
}

/** Accept only catalogued, valid plain-text overrides. Old or corrupt fields fall back. */
export function normalizeMemberCopyOverrides(value: unknown): MemberCopyOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, text]) => !memberCopyValidationError(key, text)));
}

export function resolveMemberCopy(overrides: MemberCopyOverrides, key: string, values: MemberCopyValues = {}, safeFallback = "") {
  const definition = definitions.get(key);
  if (!definition) return safeFallback;
  const candidate = overrides[key];
  const text = candidate && !memberCopyValidationError(key, candidate) ? candidate : DEFAULT_MEMBER_CENTER_COPY[key];
  if (Object.keys(definition.tokens).some((name) => values[name] == null)) return safeFallback;
  return text.replace(TOKEN, (_, name: string) => String(values[name]));
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const dynamicDefinitions = MEMBER_CENTER_COPY_CATALOG
  .filter((entry) => Object.keys(entry.tokens).length)
  .map((entry) => {
    const names: string[] = [];
    let cursor = 0;
    let pattern = "^";
    for (const match of entry.defaultText.matchAll(TOKEN)) {
      pattern += escapeRegex(entry.defaultText.slice(cursor, match.index)) + "([\\s\\S]+?)";
      names.push(match[1]);
      cursor = match.index! + match[0].length;
    }
    pattern += escapeRegex(entry.defaultText.slice(cursor)) + "$";
    return { entry, names, pattern: new RegExp(pattern), specificity: entry.defaultText.replace(TOKEN, "").length };
  }).sort((left, right) => right.specificity - left.specificity);

/**
 * Resolve existing presentation output at the final render boundary. Business
 * values/comparisons remain upstream. Captured tokens are already formatted by
 * the original UI; no amounts, dates, rules or identities are recomputed here.
 */
export function resolveMemberDisplayValue(overrides: MemberCopyOverrides, value: string): string {
  const trimmed = value.trim();
  const exact = defaultsByText.get(trimmed);
  let resolved: string | undefined;
  if (exact && !Object.keys(exact.tokens).length) resolved = resolveMemberCopy(overrides, exact.key, {}, trimmed);
  if (resolved == null) {
    for (const { entry, names, pattern } of dynamicDefinitions) {
      if (!overrides[entry.key]) continue;
      const match = pattern.exec(trimmed);
      if (!match) continue;
      const values = Object.fromEntries(names.map((name, index) => [name, match[index + 1]]));
      resolved = resolveMemberCopy(overrides, entry.key, values, trimmed);
      break;
    }
  }
  const result = resolved == null ? value : value.slice(0, value.length - value.trimStart().length) + resolved + value.slice(value.trimEnd().length);
  // Only the printed point-unit label changes; numeric values remain verbatim.
  const pointKey = "member.rewards.kdPoints.title";
  const pointLabel = overrides[pointKey];
  return pointLabel && !memberCopyValidationError(pointKey, pointLabel)
    ? result.replace(/([0-9][0-9,.]*\s+)KD點(?=$|[\s。，、）])/gu, (_, amount: string) => amount + pointLabel)
    : result;
}
