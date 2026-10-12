import "server-only";

/** Missing or differently cased values fail closed; never a browser flag. */
export function isStoreCommerceEnabled(): boolean {
  return process.env.STORE_COMMERCE_ENABLED === "true";
}
