import type { MediaAsset } from "@/lib/media";

export const CLEAN_ROASTING_MEDIA_MAX_ITEMS = 8;
export const CLEAN_ROASTING_LEGACY_VIDEO = "/videos/kdcoffee-clean-roasting-fluid-bed-web-v01.mp4";

export type CleanRoastingMediaItem = {
  id: string;
  type: "image" | "video";
  src: string;
  alt?: string;
  poster?: string;
  enabled?: boolean;
  order?: number;
  media?: MediaAsset;
};

export type CleanRoastingMediaConfig = {
  enabled?: boolean;
  items: CleanRoastingMediaItem[];
  display?: {
    mode?: "single" | "slider";
    transition?: "slide" | "fade";
    transitionDurationMs?: number;
    autoplay?: boolean;
    autoplayIntervalMs?: number;
  };
};

export const CLEAN_ROASTING_DISPLAY_DEFAULTS = {
  mode: "slider" as const,
  transition: "slide" as const,
  transitionDurationMs: 450,
  autoplay: false,
  autoplayIntervalMs: 6000,
};

export const CLEAN_ROASTING_LEGACY_CONFIG: CleanRoastingMediaConfig = {
  enabled: true,
  items: [{
    id: "legacy-fluid-bed-video",
    type: "video",
    src: CLEAN_ROASTING_LEGACY_VIDEO,
    alt: "KD Coffee 流床式熱風烘焙實拍影片",
    enabled: true,
    order: 0,
    media: { type: "video", url: CLEAN_ROASTING_LEGACY_VIDEO, provider: "local" },
  }],
  display: CLEAN_ROASTING_DISPLAY_DEFAULTS,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export function isSafeCleanRoastingMediaSource(value: unknown) {
  if (typeof value !== "string") return false;
  const source = value.trim();
  if (!source || /[\u0000-\u001f\\]/.test(source)) return false;
  if (source.startsWith("/") && !source.startsWith("//")) return true;
  try {
    const url = new URL(source);
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com";
  } catch {
    return false;
  }
}

function isSafeTypedSource(value: unknown, type: "image" | "video") {
  if (!isSafeCleanRoastingMediaSource(value)) return false;
  const source = String(value).trim();
  if (source.startsWith("/")) {
    return type === "video"
      ? /\.(?:mp4|mov|webm)(?:$|[?#])/i.test(source)
      : !/\.(?:mp4|mov|webm)(?:$|[?#])/i.test(source);
  }
  const url = new URL(source);
  return type === "video" ? url.pathname.includes("/video/upload/") : url.pathname.includes("/image/upload/");
}

function normalizeMediaAsset(value: unknown, type: "image" | "video", src: string): MediaAsset | undefined {
  if (!isRecord(value) || value.type !== type || value.url !== src) return undefined;
  const provider = value.provider === "cloudinary" || value.provider === "local" ? value.provider : undefined;
  const media: MediaAsset = { type, url: src, ...(provider ? { provider } : {}) };
  if (typeof value.publicId === "string" && value.publicId.trim()) media.publicId = value.publicId.trim().slice(0, 220);
  if (isSafeCleanRoastingMediaSource(value.posterUrl)) media.posterUrl = String(value.posterUrl).trim();
  for (const key of ["width", "height", "duration", "bytes"] as const) {
    if (typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0) media[key] = value[key];
  }
  if (typeof value.format === "string") media.format = value.format.trim().slice(0, 20);
  return media;
}

export function normalizeCleanRoastingMedia(value: unknown, fallback?: CleanRoastingMediaConfig): CleanRoastingMediaConfig {
  if (!isRecord(value)) return fallback
    ? { ...fallback, items: fallback.items.map((item) => ({ ...item, ...(item.media ? { media: { ...item.media } } : {}) })), display: { ...fallback.display } }
    : { enabled: false, items: [], display: { ...CLEAN_ROASTING_DISPLAY_DEFAULTS } };
  const rawItems = Array.isArray(value.items) ? value.items.slice(0, CLEAN_ROASTING_MEDIA_MAX_ITEMS) : [];
  const seenIds = new Set<string>();
  const items: CleanRoastingMediaItem[] = [];

  rawItems.forEach((rawItem, index) => {
    if (!isRecord(rawItem) || (rawItem.type !== "image" && rawItem.type !== "video") || !isSafeTypedSource(rawItem.src, rawItem.type)) return;
    const type = rawItem.type;
    const src = String(rawItem.src).trim();
    const requestedId = safeText(rawItem.id, 80);
    const id = /^[a-zA-Z0-9_-]+$/.test(requestedId) ? requestedId : `clean-media-${index + 1}`;
    if (seenIds.has(id)) return;
    seenIds.add(id);
    const poster = isSafeCleanRoastingMediaSource(rawItem.poster) ? String(rawItem.poster).trim() : undefined;
    const media = normalizeMediaAsset(rawItem.media, type, src);
    items.push({
      id,
      type,
      src,
      alt: safeText(rawItem.alt, 180) || (type === "image" ? "KD Coffee 乾淨烘焙實拍" : "KD Coffee 烘焙影片"),
      ...(poster ? { poster } : {}),
      enabled: typeof rawItem.enabled === "boolean" ? rawItem.enabled : true,
      order: typeof rawItem.order === "number" && Number.isFinite(rawItem.order)
        ? Math.min(20, Math.max(0, Math.round(rawItem.order)))
        : index,
      ...(media ? { media } : {}),
    });
  });

  const display = isRecord(value.display) ? value.display : {};
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    items,
    display: {
      mode: display.mode === "single" || display.mode === "slider" ? display.mode : CLEAN_ROASTING_DISPLAY_DEFAULTS.mode,
      transition: display.transition === "fade" || display.transition === "slide" ? display.transition : CLEAN_ROASTING_DISPLAY_DEFAULTS.transition,
      transitionDurationMs: typeof display.transitionDurationMs === "number" && Number.isFinite(display.transitionDurationMs)
        ? Math.min(1200, Math.max(200, Math.round(display.transitionDurationMs)))
        : CLEAN_ROASTING_DISPLAY_DEFAULTS.transitionDurationMs,
      autoplay: typeof display.autoplay === "boolean" ? display.autoplay : false,
      autoplayIntervalMs: typeof display.autoplayIntervalMs === "number" && Number.isFinite(display.autoplayIntervalMs)
        ? Math.min(12000, Math.max(3000, Math.round(display.autoplayIntervalMs)))
        : CLEAN_ROASTING_DISPLAY_DEFAULTS.autoplayIntervalMs,
    },
  };
}

export function enabledCleanRoastingMediaItems(config: CleanRoastingMediaConfig) {
  return config.enabled === false
    ? []
    : config.items.filter((item) => item.enabled !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
}
