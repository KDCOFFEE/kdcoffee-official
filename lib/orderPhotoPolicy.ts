// Shared authoritative selection rules for the existing order-photo infrastructure.
export const MAX_ORDER_NOTIFICATION_PHOTO_BYTES = 5 * 1024 * 1024;
export const ORDER_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ORDER_PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const;
export const ORDER_PHOTO_ACCEPT = ORDER_PHOTO_MIME_TYPES.join(",");
export function validOrderPhotoSelection(file: { size: number; type: string; name: string }) {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  return file.size > 0 && file.size <= MAX_ORDER_NOTIFICATION_PHOTO_BYTES
    && ORDER_PHOTO_MIME_TYPES.some(type => type === file.type) && ORDER_PHOTO_EXTENSIONS.some(value => value === extension);
}
