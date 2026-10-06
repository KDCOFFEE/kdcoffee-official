export type SubscriptionCreditPreference =
  | { mode: "off" }
  | { mode: "maximum" }
  | { mode: "fixed"; amount: number };

export class SubscriptionCreditPreferenceError extends Error {}

/** Missing historical preference means no automatic spending. Never infer consent. */
export function validateSubscriptionCreditPreference(value: unknown): SubscriptionCreditPreference {
  if (value === undefined) return { mode: "off" };
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SubscriptionCreditPreferenceError("使用方式不正確");
  const input = value as Record<string, unknown>;
  if (input.mode === "off" || input.mode === "maximum") return { mode: input.mode };
  if (input.mode === "fixed" && Number.isSafeInteger(input.amount) && Number(input.amount) > 0 && Number(input.amount) <= 100_000_000) return { mode: "fixed", amount: Number(input.amount) };
  throw new SubscriptionCreditPreferenceError("請選擇有效的每期使用方式與正整數金額");
}

export function requestedSubscriptionCredit(preference: SubscriptionCreditPreference, maximum: number) {
  return preference.mode === "off" ? 0 : preference.mode === "maximum" ? maximum : Math.min(preference.amount, maximum);
}
