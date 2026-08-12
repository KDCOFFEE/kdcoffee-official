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
  imageId,
  label,
  recommendedSize,
}: Props) {
  return (
    <div className="v3-scene-media">
      <KdMedia
        media={resolveMediaAsset(media, src)}
        alt={alt}
        fallback={(
          <div className="v3-scene-placeholder">
            <span>{imageId}</span>
            <strong>{label}</strong>
            <small>{recommendedSize || "請至後台上傳情境圖片"}</small>
          </div>
        )}
      />
      <div className="v3-scene-shade" />
    </div>
  );
}
