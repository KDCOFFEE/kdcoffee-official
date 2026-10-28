import type { AssetRecord } from "./assets";
import { localImageMedia, type MediaAsset } from "./media";
import { isMeaningfulAssetText } from "./assetMetadata";

export type StoreHeroMediaTarget = "desktop" | "mobile";

/** Same multipart image-upload API and storage used by Homepage Hero; no registry/storage of our own. */
export async function uploadStoreHeroImage(file: File, target: StoreHeroMediaTarget): Promise<MediaAsset> {
  if (!file.type.startsWith("image/")) throw new Error("商店 Hero 只接受圖片。");
  if (file.size <= 0 || file.size > 40 * 1024 * 1024) throw new Error("圖片大小須介於 1 byte 與 40 MB。");
  const form = new FormData();
  form.append("file", file);
  form.append("desiredName", `kd-coffee-store-hero-${target}-${globalThis.crypto.randomUUID().slice(0, 8)}`);
  form.append("artworkSlug", "homepage");
  form.append("assetType", `store-hero-${target}`);
  const response = await fetch("/api/admin/homepage/upload", { method: "POST", body: form });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "圖片上傳失敗。");
  if (typeof result.path !== "string" || !result.path.startsWith("/") || !/\.webp$/i.test(result.path)) throw new Error("圖片上傳回應不正確。");
  return localImageMedia(result.path);
}

/** Give the existing image picker readable labels and filename search without changing its source. */
export function storeHeroLibraryAssets(assets: AssetRecord[]): AssetRecord[] {
  return assets.filter(asset => asset.status === "active" && /\.(avif|gif|jpe?g|png|svg|webp)(?:\?|$)/i.test(asset.path)).map(asset => {
    let filename = asset.originalFileName || asset.path.split("?")[0].split("/").pop() || "";
    try { filename = decodeURIComponent(filename); } catch { /* Keep the stored readable name on malformed encoding. */ }
    const title = isMeaningfulAssetText(asset.name, asset) ? asset.name : isMeaningfulAssetText(asset.alt, asset) ? asset.alt : "圖片素材";
    return { ...asset, name: filename ? `${title} · ${filename}` : title };
  });
}
