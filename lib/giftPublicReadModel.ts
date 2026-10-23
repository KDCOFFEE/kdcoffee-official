import "server-only";
import { createStoreRepository } from "./storeRepository";
import { readPointDisplayName } from "./pointDisplayNameStore";
import { selectPublicGiftCatalog } from "./giftPresentation";

/** One read, existing Store publication graph, no initialization or writes. */
export async function readPublicGiftCatalog() {
  const [catalog, pointDisplayName] = await Promise.all([createStoreRepository().read(), readPointDisplayName()]);
  return selectPublicGiftCatalog(catalog, pointDisplayName);
}
