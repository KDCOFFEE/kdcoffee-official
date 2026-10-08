/** The business-rule field is the sole authority; copy keys are presentation aliases. */
export const POINT_NAME_KEY = "member.rewards.kdPoints.title";
export const SPACED_POINT_NAME_KEY = "member.rewards.kdPoints.spacedTitle";
export function isPointNameAlias(key: string) {
  return key === POINT_NAME_KEY || key === SPACED_POINT_NAME_KEY;
}
export function resolvePointDisplayName(rules: { referral: { pointDisplayName: string } }) {
  return rules.referral.pointDisplayName;
}
/** Preserve the existing KD點 → KD 點 typography; custom names are left verbatim. */
export function formatPointDisplayName(name: string, format: "plain" | "spaced" = "plain") {
  return format === "spaced" && name === "KD點" ? "KD 點" : name;
}
export function pointNameAliasValue(key: string, canonicalName: string) {
  return formatPointDisplayName(canonicalName, key === SPACED_POINT_NAME_KEY ? "spaced" : "plain");
}
