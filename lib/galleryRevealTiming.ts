export const GALLERY_TIMING_KEYS = ['titleHookAt', 'interpretationAt', 'coffeeBridgeAt', 'ctaAt'] as const;
export type GalleryTimingKey = typeof GALLERY_TIMING_KEYS[number];
/** Optional seconds on the existing work record; one configuration for both devices. */
export type GalleryRevealTiming = Partial<Record<GalleryTimingKey, number>>;
export const GALLERY_TIMING_MAX_SECONDS = 10;
export const DEFAULT_GALLERY_REVEAL_TIMING = { titleHookAt: 3.5, interpretationAt: 5, coffeeBridgeAt: 5, ctaAt: 5 } as const;
export class GalleryTimingValidationError extends Error {}
export function normalizeGalleryRevealTiming(value: unknown): GalleryRevealTiming | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw new GalleryTimingValidationError('作品詮釋進場時間格式不正確。');
  const source = value as Record<string, unknown>, result: GalleryRevealTiming = {};
  for (const key of GALLERY_TIMING_KEYS) {
    if (!Object.hasOwn(source, key)) continue;
    const n = source[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > GALLERY_TIMING_MAX_SECONDS) throw new GalleryTimingValidationError('作品詮釋進場時間須為 0–10 秒。');
    result[key] = Math.round(n * 10) / 10;
  }
  return result;
}
export function resolveGalleryRevealTiming(value: unknown): Record<GalleryTimingKey, number> {
  try { return { ...DEFAULT_GALLERY_REVEAL_TIMING, ...normalizeGalleryRevealTiming(value) }; }
  catch { return { ...DEFAULT_GALLERY_REVEAL_TIMING }; }
}
