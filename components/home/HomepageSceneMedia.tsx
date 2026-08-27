import KdMedia from "@/components/media/KdMedia";
import { resolveMediaAsset, type MediaAsset } from "@/lib/media";

type Props = {
  src?: string;
  media?: MediaAsset;
  alt: string;
  imageId: string;
  label: string;
  recommendedSize?: string;
};

export default function HomepageSceneMedia({
  src = "",
  media,
  alt,
}: Props) {
  return (
    <div className="v3-scene-media">
      <KdMedia
        media={resolveMediaAsset(media, src)}
        alt={alt}
        fallback={null}
      />
      <div className="v3-scene-shade" />
    </div>
  );
}
