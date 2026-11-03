import "server-only";
import fs from "node:fs/promises";
import { getAssetLibrary, AssetLibraryVersionConflictError, type AssetLibrary } from "./assets";
import { assertAssetImageAvailable } from "./assetImages";
import { getAssetsDataFile } from "./storagePaths";
import { atomicWriteJson, withFileLock } from "./jsonFileStore";
import { isSocialLibraryImage, validateSocialImageValue, type SocialImageValue } from "./socialImageSettings";

export async function assertSocialImageAvailable(value: unknown): Promise<SocialImageValue> {
  validateSocialImageValue(value);
  await assertAssetImageAvailable(value.path);
  const library = await getAssetLibrary();
  const asset = library.assets.find(item => isSocialLibraryImage(item) && item.path === value.path && (!value.assetId || item.id === value.assetId));
  if (!asset) throw new Error("分享圖片已不在素材庫中，請重新選擇。");
  return { path: asset.path, alt: value.alt, assetId: asset.id };
}

/** Update only the existing LOGO005 slot with the library's optimistic lock. */
export async function saveGlobalSocialImage(version: unknown, value: unknown) {
  if (typeof version !== "number" || !Number.isInteger(version)) throw new Error("素材版本不正確。");
  const selected = value === null ? null : await assertSocialImageAvailable(value);
  const file = getAssetsDataFile();
  return withFileLock(file, async () => {
    const library = JSON.parse(await fs.readFile(file, "utf8")) as AssetLibrary;
    if (library.version !== version) throw new AssetLibraryVersionConflictError();
    const slot = library.assets.find(asset => asset.id === "LOGO005");
    if (!slot) throw new Error("素材庫缺少 LOGO005 分享圖位置。");
    if (selected && !library.assets.some(asset => asset.id === selected.assetId && asset.path === selected.path && isSocialLibraryImage(asset))) throw new Error("分享圖片已變更，請重新選擇。");
    Object.assign(slot, { path: selected?.path || "", alt: selected?.alt || "KD Coffee 咖啡藝術工坊", status: selected ? "active" : "missing", updatedAt: new Date().toISOString() });
    library.version += 1; library.updatedAt = new Date().toISOString();
    await atomicWriteJson(file, library);
    return library;
  });
}
