/** Optional presentation copy on the existing Work/Product record. */
export type GalleryEditorial = { hook?: string; interpretation?: string; coffeeBridge?: string };
export const GALLERY_EDITORIAL_LIMITS = { hook: 28, interpretation: 100, coffeeBridge: 70 } as const;
export class GalleryEditorialValidationError extends Error {}

export function normalizeGalleryEditorial(value: unknown): GalleryEditorial | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw new GalleryEditorialValidationError('作品詮釋文案格式不正確。');
  const source = value as Record<string, unknown>, result: GalleryEditorial = {};
  for (const key of Object.keys(GALLERY_EDITORIAL_LIMITS) as Array<keyof GalleryEditorial>) {
    if (!Object.hasOwn(source, key)) continue;
    if (typeof source[key] !== 'string') throw new GalleryEditorialValidationError('作品詮釋文案必須是文字。');
    const text = source[key].trim();
    if (Array.from(text).length > GALLERY_EDITORIAL_LIMITS[key] || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) {
      throw new GalleryEditorialValidationError('作品詮釋文案超過字數限制或包含不支援的標記。');
    }
    result[key] = text;
  }
  return result;
}

export function readGalleryEditorial(value: unknown): GalleryEditorial {
  try { return normalizeGalleryEditorial(value) || {}; } catch { return {}; }
}
