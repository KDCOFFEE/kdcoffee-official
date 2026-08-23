export type MediaAsset = {
  type: "image" | "video";
  url: string;
  provider?: "local" | "cloudinary";
  publicId?: string;
  posterUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  format?: string;
  bytes?: number;
};

export type CloudinaryMediaUsage = "hero" | "content" | "product";

export const CLOUDINARY_IMAGE_FOLDER = "kd-coffee/images";
export const CLOUDINARY_VIDEO_FOLDER = "kd-coffee/videos";

export const ALLOWED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const CUSTOM_SECTION_IMAGE_LIMITS = {
  maxBytes: 15 * 1024 * 1024,
  maxDimension: 12_000,
  maxPixels: 40_000_000,
} as const;

export const ALLOWED_VIDEO_EXTENSIONS = ["mp4", "mov", "webm"] as const;

export const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export const VIDEO_UPLOAD_LIMITS: Record<
  CloudinaryMediaUsage,
  { maxBytes: number; maxDurationSeconds: number }
> = {
  hero: {
    maxBytes: 200 * 1024 * 1024,
    maxDurationSeconds: 60,
  },
  content: {
    maxBytes: 500 * 1024 * 1024,
    maxDurationSeconds: 3 * 60,
  },
  product: {
    maxBytes: 95 * 1024 * 1024,
    maxDurationSeconds: 3 * 60,
  },
};

export const CUSTOM_SECTION_VIDEO_LIMITS = {
  ...VIDEO_UPLOAD_LIMITS.product,
  maxDimension: 8192,
  maxPixels: 40_000_000,
} as const;

export function isCloudinaryMediaUsage(
  value: unknown,
): value is CloudinaryMediaUsage {
  return value === "hero" || value === "content" || value === "product";
}

export function videoExtension(fileName: string) {
  const match = fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

export function imageExtension(fileName: string) {
  const match = fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

export function isAllowedImageUpload(fileName: string, mimeType: string) {
  const extension = imageExtension(fileName);
  const cleanMimeType = mimeType.trim().toLowerCase();
  return (
    ALLOWED_IMAGE_EXTENSIONS.includes(
      extension as (typeof ALLOWED_IMAGE_EXTENSIONS)[number],
    ) &&
    ALLOWED_IMAGE_MIME_TYPES.includes(
      cleanMimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number],
    )
  );
}

export function isAllowedVideoUpload(fileName: string, mimeType: string) {
  const extension = videoExtension(fileName);
  const cleanMimeType = mimeType.trim().toLowerCase();

  return (
    ALLOWED_VIDEO_EXTENSIONS.includes(
      extension as (typeof ALLOWED_VIDEO_EXTENSIONS)[number],
    ) &&
    ALLOWED_VIDEO_MIME_TYPES.includes(
      cleanMimeType as (typeof ALLOWED_VIDEO_MIME_TYPES)[number],
    )
  );
}

export function isMediaAsset(value: unknown): value is MediaAsset {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.type === "image" || candidate.type === "video") &&
    typeof candidate.url === "string" &&
    Boolean(candidate.url.trim())
  );
}

export function localImageMedia(url: string): MediaAsset {
  return {
    type: "image",
    url,
    provider: "local",
  };
}

export function resolveMediaAsset(
  media: unknown,
  fallbackImageUrl?: string,
): MediaAsset | undefined {
  if (isMediaAsset(media)) return media;
  const fallback = fallbackImageUrl?.trim();
  return fallback ? localImageMedia(fallback) : undefined;
}
