import KdMedia from "@/components/media/KdMedia";
import { resolveMediaAsset, type MediaAsset } from "@/lib/media";

type FutureMediaItem = {
  id?: string;
  alt?: string;
  caption?: string;
  enabled?: boolean;
  order?: number;
  primary?: boolean;
  title?: string;
  image?: string;
  media?: MediaAsset;
};

export type ResolvedHomepageMediaItem = {
  id: string;
  alt: string;
  caption?: string;
  primary?: boolean;
  title?: string;
  media: MediaAsset;
};

function isFutureMediaItem(value: unknown): value is FutureMediaItem {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function resolveHomepageMediaCollection({
  alt,
  media,
  mediaItems,
  src,
}: {
  alt: string;
  media?: MediaAsset;
  mediaItems?: unknown;
  src?: string;
}): ResolvedHomepageMediaItem[] {
  const collection = Array.isArray(mediaItems) ? mediaItems : [];
  const resolvedCollection = collection
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aOrder = isFutureMediaItem(a.item) && Number.isFinite(a.item.order) ? Number(a.item.order) : a.index;
      const bOrder = isFutureMediaItem(b.item) && Number.isFinite(b.item.order) ? Number(b.item.order) : b.index;
      return aOrder - bOrder || a.index - b.index;
    })
    .map(({ item }) => item)
    .filter(isFutureMediaItem)
    .filter((item) => item.enabled !== false)
    .map((item) => {
      const resolved = resolveMediaAsset(item.media, item.image);
      return resolved
        ? {
            id: item.id || `media-${resolved.url}`,
            alt: item.alt?.trim() || alt,
            ...(item.caption ? { caption: item.caption } : {}),
            ...(item.primary ? { primary: true } : {}),
            ...(item.title ? { title: item.title } : {}),
            media: resolved,
          }
        : null;
    })
    .filter((item): item is ResolvedHomepageMediaItem => item !== null);

  if (Array.isArray(mediaItems)) return resolvedCollection;

  const resolved = resolveMediaAsset(media, src);
  return resolved ? [{ id: `legacy-${resolved.url}`, alt, media: resolved }] : [];
}

export default function HomepageMediaCollection({
  alt,
  className = "",
  media,
  mediaItems,
  src,
}: {
  alt: string;
  className?: string;
  media?: MediaAsset;
  mediaItems?: unknown;
  src?: string;
}) {
  const items = resolveHomepageMediaCollection({ alt, media, mediaItems, src });

  if (!items.length) return null;

  return (
    <div className={`${className} home-media-collection ${items.length > 1 ? "has-multiple-media" : "has-single-media"}`}>
      {items.map((item, index) => (
        <figure className="home-media-collection-item" key={`${item.media.url}-${index}`}>
          <KdMedia media={item.media} alt={item.alt} fallback={null} />
          {item.caption ? <figcaption>{item.caption}</figcaption> : null}
        </figure>
      ))}
    </div>
  );
}
