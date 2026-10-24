import "server-only";
import { readGiftCmsState } from "./giftCmsStore";
import { createStoreRepository } from "./storeRepository";
import { readPointDisplayName } from "./pointDisplayNameStore";
import { selectPublicGiftCatalog } from "./giftPresentation";

/** One read, existing Store publication graph, no initialization or writes. */
export async function readPublicGiftCatalog() {
  const [catalog, pointDisplayName, cms] = await Promise.all([createStoreRepository().read(), readPointDisplayName(), readGiftCmsState()]);
  return selectPublicGiftCatalog(catalog, pointDisplayName, cms);
}
