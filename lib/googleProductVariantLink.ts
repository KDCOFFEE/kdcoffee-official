import type { PurchaseOption } from "@/data/websiteData";

/** UI-only deep-link hint. Never grants purchasing or inventory authority. */
export function resolveCoffeeVariantLinkSelection(
  options: readonly PurchaseOption[],
  requested: unknown,
): string {
  const fallback = options[0]?.id || "";
  if (typeof requested !== "string" || !requested || requested.length > 128) return fallback;
  const matches = options.filter((option) => option.id === requested);
  if (matches.length !== 1) return fallback;
  const option = matches[0];
  if (option.enabled === false || typeof option.stock !== "number" ||
      !Number.isSafeInteger(option.stock) || option.stock <= 0) return fallback;
  return requested;
}
