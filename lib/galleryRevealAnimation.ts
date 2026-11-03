import { HOMEPAGE_MOTION_PRESETS, resolveHomepageMotion, type HomepageMotionPreset } from './homepageCms';
export const GALLERY_REVEAL_GROUPS = ['titleHook', 'interpretation', 'coffeeBridge', 'cta'] as const;
export type GalleryRevealGroup = typeof GALLERY_REVEAL_GROUPS[number];
export const GALLERY_MOTION_PRESETS = HOMEPAGE_MOTION_PRESETS.filter(preset => ['none', 'fade', 'fade-up', 'slide-left', 'slide-right', 'scale-reveal'].includes(preset));
export type GalleryRevealAnimation = Partial<Record<GalleryRevealGroup, HomepageMotionPreset>>;
export class GalleryAnimationValidationError extends Error {}
export function normalizeGalleryRevealAnimation(value: unknown): GalleryRevealAnimation | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw new GalleryAnimationValidationError('文案進場效果格式不正確。');
  const source = value as Record<string, unknown>, result: GalleryRevealAnimation = {};
  for (const key of GALLERY_REVEAL_GROUPS) {
    if (!Object.hasOwn(source, key)) continue;
    if (typeof source[key] !== 'string' || !(GALLERY_MOTION_PRESETS as readonly string[]).includes(source[key])) throw new GalleryAnimationValidationError('文案進場效果不支援。');
    result[key] = source[key] as HomepageMotionPreset;
  }
  return result;
}
export function resolveGalleryRevealAnimation(value: unknown): Record<GalleryRevealGroup, HomepageMotionPreset> {
  let custom: GalleryRevealAnimation | undefined;
  try { custom = normalizeGalleryRevealAnimation(value); } catch { /* Old/malformed data keeps approved fade-up. */ }
  return { titleHook: 'fade-up', interpretation: 'fade-up', coffeeBridge: 'fade-up', cta: 'fade-up', ...custom };
}
export function galleryRevealMotionStyle(preset: HomepageMotionPreset) {
  const motion = resolveHomepageMotion({ enabled: preset !== 'none', preset, delayMs: 0, durationMs: 600, distancePx: 16, staggerMs: 0 }, 'home002');
  return { '--gallery-reveal-x': `${motion.initialX}px`, '--gallery-reveal-y': `${motion.initialY}px`, '--gallery-reveal-scale': String(motion.initialScale), '--gallery-reveal-duration': preset === 'none' ? '0ms' : `${motion.durationMs}ms` };
}
