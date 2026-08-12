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

export type CloudinaryMediaUsage = "hero" | "content";

export const CLOUDINARY_VIDEO_FOLDER = "kd-coffee/videos";

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
};

export function isCloudinaryMediaUsage(
  value: unknown,
): value is CloudinaryMediaUsage {
  return value === "hero" || value === "content";
}

export function videoExtension(fileName: string) {
  const match = fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
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
