import { normalizeGalleryEditorial, type GalleryEditorial } from './galleryEditorial';

const placeholders = new Set(['dddass', 'ssss', 'ssssasasass', 'test', '123', 'temporary qa copy']);
export function classifyGalleryEditorialText(value: unknown): 'empty' | 'placeholder' | 'preserved' {
  if (typeof value !== 'string' || !value.trim()) return 'empty';
  return placeholders.has(value.trim().toLowerCase()) ? 'placeholder' : 'preserved';
}

/** One-time seeding only; existing meaningful text always wins, field by field. */
export function mergeGalleryEditorialDefaults(current: GalleryEditorial | undefined, defaults: GalleryEditorial) {
  const safe = normalizeGalleryEditorial(defaults) || {};
  const editorial = { ...current };
  for (const key of ['hook', 'interpretation', 'coffeeBridge'] as const) {
    if (classifyGalleryEditorialText(current?.[key]) !== 'preserved') editorial[key] = safe[key];
  }
  return editorial;
}
