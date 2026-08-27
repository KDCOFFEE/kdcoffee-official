import KdMedia from "@/components/media/KdMedia";
import { resolveMediaAsset, type MediaAsset } from "@/lib/media";

export default function CampaignMedia({
  src = "",
  media,
  alt,
}: {
  src?: string;
  media?: MediaAsset;
  alt: string;
}) {
  return (
    <KdMedia
      media={resolveMediaAsset(media, src)}
      alt={alt}
      fallback={null}
    />
  );
}
