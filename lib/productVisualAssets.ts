import { isMediaAsset, type MediaAsset } from "@/lib/media";

export type ProductVisualSource = {
  key: string;
  path: string;
  alt?: string;
  title?: string;
  caption?: string;
  fileName?: string;
};

type ProductVisualInput = {
  cover?: unknown;
  poster?: unknown;
  assets?: unknown;
  pageLayout?: unknown;
};

type ProductVisualLayout = {
  listAsset?: unknown;
  productAsset?: unknown;
  heroAsset?: unknown;
  galleryAssets?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const cleanString = (value: unknown) => typeof value === "string" ? value.trim() : "";

function cleanStaticImageUrl(value: unknown) {
  const url = cleanString(value);
  if (!url) return "";
  try {
    const pathname = new URL(url, "https://kd-coffee.local").pathname;
    return /\.(?:mp4|mov|webm)$/i.test(pathname) ? "" : url;
  } catch {
    return "";
  }
}

function getLayout(product: ProductVisualInput): ProductVisualLayout {
  return isRecord(product.pageLayout) ? product.pageLayout : {};
}

function getRawAsset(product: ProductVisualInput, key: string) {
  if (!key) return null;
  const assets = isRecord(product.assets) ? product.assets : {};
  const raw = assets[key];
  return isRecord(raw) ? raw : null;
}

export function getProductMediaAsset(
  product: ProductVisualInput,
  key: string,
): MediaAsset | undefined {
  const raw = getRawAsset(product, key);
  return raw && isMediaAsset(raw.media) ? raw.media : undefined;
}

export function hasProductMediaAsset(product: ProductVisualInput, key: string) {
  return Boolean(getProductMediaAsset(product, key));
}

export function resolveStaticProductAssetImage(
  product: ProductVisualInput,
  key: string,
) {
  const raw = getRawAsset(product, key);
  if (!raw) return "";
  const media = isMediaAsset(raw.media) ? raw.media : undefined;
  return cleanStaticImageUrl(media?.posterUrl) || cleanStaticImageUrl(raw.path);
}

function getAsset(product: ProductVisualInput, key: string): ProductVisualSource | null {
  const raw = getRawAsset(product, key);
  if (!raw) return null;
  const path = resolveStaticProductAssetImage(product, key);
  if (!path) return null;
  const source: ProductVisualSource = { key, path };
  for (const field of ["alt", "title", "caption", "fileName"] as const) {
    const value = cleanString(raw[field]);
    if (value) source[field] = value;
  }
  return source;
}

export function resolveStaticProductImage(product: ProductVisualInput) {
  return firstAsset([
    getAsset(product, "artworkCover"),
    getAsset(product, "mainVisual"),
    getLegacyAsset(product, "cover"),
    getLegacyAsset(product, "poster"),
  ])?.path;
}

function getLegacyAsset(product: ProductVisualInput, key: "cover" | "poster") {
  const path = cleanStaticImageUrl(product[key]);
  return path ? { key, path } satisfies ProductVisualSource : null;
}

function firstAsset(candidates: Array<ProductVisualSource | null>) {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate.path)) continue;
    seen.add(candidate.path);
    return candidate;
  }
  return null;
}

export function resolveListAsset(product: ProductVisualInput) {
  const layout = getLayout(product);
  return firstAsset([
    getAsset(product, cleanString(layout.listAsset)),
    getAsset(product, "artworkCover"),
    getAsset(product, "mainVisual"),
    getLegacyAsset(product, "cover"),
    getLegacyAsset(product, "poster"),
  ]);
}

export function resolveProductAsset(product: ProductVisualInput) {
  const layout = getLayout(product);
  return firstAsset([
    getAsset(product, cleanString(layout.productAsset)),
    getAsset(product, "productPhoto"),
    getAsset(product, "mainVisual"),
    getLegacyAsset(product, "cover"),
    getLegacyAsset(product, "poster"),
  ]);
}

export function resolveHeroAsset(product: ProductVisualInput) {
  const layout = getLayout(product);
  return firstAsset([
    getAsset(product, cleanString(layout.heroAsset)),
    getAsset(product, "hero"),
  ]);
}

export function resolveGalleryAssets(product: ProductVisualInput) {
  const layout = getLayout(product);
  const keys = Array.isArray(layout.galleryAssets)
    ? layout.galleryAssets.map(cleanString).filter(Boolean)
    : ["label"];
  const excludedPaths = new Set([
    resolveHeroAsset(product)?.path,
    resolveProductAsset(product)?.path,
  ].filter((path): path is string => Boolean(path)));
  const usedPaths = new Set<string>();
  const gallery: ProductVisualSource[] = [];

  for (const key of keys) {
    const asset = getAsset(product, key);
    if (!asset || excludedPaths.has(asset.path) || usedPaths.has(asset.path)) continue;
    usedPaths.add(asset.path);
    gallery.push(asset);
  }
  return gallery;
}
