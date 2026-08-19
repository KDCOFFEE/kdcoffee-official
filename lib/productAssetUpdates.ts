export type ProductAssetUpdate = {
  id?: unknown;
  slug?: unknown;
  cover?: unknown;
  assets?: unknown;
  pageLayout?: unknown;
  showRoastedBeanPhoto?: unknown;
};

export class ProductAssetUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductAssetUpdateError";
  }
}

const layoutKeys = ["heroAsset", "productAsset", "listAsset"] as const;
const layoutBooleanKeys = ["showGallery", "showRelatedWorks"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeAssets(value: unknown) {
  if (!isRecord(value)) throw new ProductAssetUpdateError("商品素材資料格式錯誤。");
  const assets: Record<string, Record<string, unknown>> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!key.trim() || !isRecord(item)) throw new ProductAssetUpdateError("商品素材項目格式錯誤。");
    assets[key] = { ...item };
  }
  return assets;
}

function mergeAssets(currentValue: unknown, updateValue: unknown) {
  const current = isRecord(currentValue) ? currentValue : {};
  const updates = normalizeAssets(updateValue);
  const assets: Record<string, Record<string, unknown>> = {};

  for (const [key, item] of Object.entries(current)) {
    if (isRecord(item)) assets[key] = { ...item };
  }
  for (const [key, item] of Object.entries(updates)) {
    const merged = {
      ...(isRecord(assets[key]) ? assets[key] : {}),
      ...item,
    };
    if ("media" in item && item.media === null) delete merged.media;
    assets[key] = merged;
  }
  return assets;
}

function normalizePageLayout(value: unknown) {
  if (!isRecord(value)) throw new ProductAssetUpdateError("商品素材版面資料格式錯誤。");
  const layout: Record<string, unknown> = {};
  for (const key of layoutKeys) {
    if (key in value) layout[key] = String(value[key] ?? "").trim();
  }
  if ("galleryAssets" in value) {
    if (!Array.isArray(value.galleryAssets)) throw new ProductAssetUpdateError("商品 Gallery 資料格式錯誤。");
    layout.galleryAssets = value.galleryAssets
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  for (const key of layoutBooleanKeys) {
    if (key in value) layout[key] = value[key] !== false;
  }
  return layout;
}

type ProductRecord = Record<string, unknown>;

export function preserveServerAssetFields<T extends ProductRecord>(serverProduct: T | undefined, candidate: T): T {
  if (!serverProduct) return candidate;
  return {
    ...candidate,
    cover: serverProduct["cover"],
    assets: serverProduct["assets"],
    pageLayout: serverProduct["pageLayout"],
    showRoastedBeanPhoto: serverProduct["showRoastedBeanPhoto"],
  } as T;
}

export function mergeProductAssetUpdates(
  serverProducts: ProductRecord[],
  requestedUpdates: ProductAssetUpdate[],
) {
  if (!requestedUpdates.length) throw new ProductAssetUpdateError("沒有可儲存的商品素材變更。");
  const products = serverProducts.map((product) => ({ ...product }));
  const usedIndexes = new Set<number>();

  for (const update of requestedUpdates) {
    if (!isRecord(update)) throw new ProductAssetUpdateError("商品素材資料格式錯誤。");
    const id = typeof update.id === "string" ? update.id.trim() : "";
    const slug = typeof update.slug === "string" ? update.slug.trim() : "";
    let index = id ? products.findIndex((product) => String(product.id || "") === id) : -1;
    if (index < 0 && slug) {
      index = products.findIndex((product) => String(product.slug || "") === slug);
      if (index >= 0 && id && products[index].id && String(products[index].id) !== id) {
        throw new ProductAssetUpdateError(`商品識別不一致：${slug}。`);
      }
    }
    if (index < 0) throw new ProductAssetUpdateError(`找不到要更新素材的商品：${slug || id || "未知商品"}。`);
    if (usedIndexes.has(index)) throw new ProductAssetUpdateError(`商品素材不可重複提交：${slug || id}。`);
    usedIndexes.add(index);

    const current = products[index];
    const next: ProductRecord = { ...current };
    if ("cover" in update) next["cover"] = String(update.cover ?? "").trim();
    if ("assets" in update) next["assets"] = mergeAssets(current["assets"], update.assets);
    if ("pageLayout" in update) next["pageLayout"] = normalizePageLayout(update.pageLayout);
    if ("showRoastedBeanPhoto" in update) {
      if (typeof update.showRoastedBeanPhoto !== "boolean") throw new ProductAssetUpdateError("烘焙豆照片顯示設定格式不正確。");
      next["showRoastedBeanPhoto"] = update.showRoastedBeanPhoto;
    }
    products[index] = next;
  }

  return products;
}
