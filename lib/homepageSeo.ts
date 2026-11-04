import "server-only";
import { readPageStore } from "./pageBuilderStore";
import { getPagesDataFile } from "./storagePaths";
import { atomicWriteJson, withFileLock } from "./jsonFileStore";
import { assertSocialImageAvailable } from "./socialImageAdmin";
import { normalizeHomepageSeoText, type HomepageSeo } from "./pageBuilder";

export class HomepageSeoVersionConflictError extends Error {}

/** Homepage presentation settings use the existing PageStore and version lock. */
export async function saveHomepageSeo(version: unknown, fields: Record<string, unknown>) {
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0) throw new Error("頁面版本不正確。");
  const keys = Object.keys(fields);
  if (!keys.length || keys.some(key => !["title", "description", "image"].includes(key))) {
    throw new Error("首頁搜尋與分享設定包含不支援的欄位，或沒有變更。");
  }
  const patch: HomepageSeo = {};
  for (const key of ["title", "description"] as const) {
    if (Object.hasOwn(fields, key)) patch[key] = normalizeHomepageSeoText(key, fields[key]);
  }
  if (Object.hasOwn(fields, "image")) {
    patch.socialImage = fields.image === null ? undefined : await assertSocialImageAvailable(fields.image);
  }
  return withFileLock(getPagesDataFile(), async () => {
    const store = await readPageStore();
    if (store.version !== version) throw new HomepageSeoVersionConflictError("頁面設定已更新，請重新載入後再儲存。");
    const homepage = store.systemPages?.homepage;
    const seo = { ...homepage?.seo };
    for (const key of ["title", "description", "socialImage"] as const) {
      if (Object.hasOwn(patch, key) && patch[key] === undefined) delete seo[key];
    }
    Object.assign(seo, Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)));
    store.systemPages = { ...store.systemPages, homepage: { ...homepage, seo } };
    store.version += 1; store.updatedAt = new Date().toISOString();
    await atomicWriteJson(getPagesDataFile(), store);
    return { version: store.version, homepage: store.systemPages.homepage };
  });
}
