import "server-only";
import { readPageStore } from "./pageBuilderStore";
import { getPagesDataFile } from "./storagePaths";
import { atomicWriteJson, withFileLock } from "./jsonFileStore";
import { assertSocialImageAvailable } from "./socialImageAdmin";

export class HomepageSeoVersionConflictError extends Error {}

/** Homepage presentation settings use the existing PageStore and version lock. */
export async function saveHomepageSocialImage(version: unknown, value: unknown) {
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0) throw new Error("頁面版本不正確。");
  const image = value === null ? undefined : await assertSocialImageAvailable(value);
  return withFileLock(getPagesDataFile(), async () => {
    const store = await readPageStore();
    if (store.version !== version) throw new HomepageSeoVersionConflictError("頁面設定已更新，請重新載入後再儲存。");
    const homepage = store.systemPages?.homepage;
    const seo = { ...homepage?.seo };
    if (image) seo.socialImage = image; else delete seo.socialImage;
    store.systemPages = { ...store.systemPages, homepage: { ...homepage, seo } };
    store.version += 1; store.updatedAt = new Date().toISOString();
    await atomicWriteJson(getPagesDataFile(), store);
    return { version: store.version, homepage: store.systemPages.homepage };
  });
}
