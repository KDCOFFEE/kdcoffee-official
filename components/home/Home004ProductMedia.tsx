import ProductVisualMedia from "@/components/commerce/ProductVisualMedia";
import StudioPreviewMedia from "@/components/media/StudioPreviewMedia";
import type { HomepagePreviewMode } from "./HomepagePreviewContext";

export default function Home004ProductMedia({
  src = "",
  alt,
  previewMode = "public",
}: {
  src?: string;
  alt: string;
  previewMode?: HomepagePreviewMode;
}) {
  return (
    <div className="v3-media">
      {previewMode !== "public" ? <StudioPreviewMedia media={src ? { type: "image", provider: "local", url: src } : undefined} alt={alt} /> : <ProductVisualMedia
        src={src}
        alt={alt}

        /**
         * HOME004 位於首頁較下方，
         * 不需要網站一打開就下載。
         *
         * 接近這個區域時，
         * 瀏覽器才開始準備圖片。
         */
        loading="lazy"
        decoding="async"

        fallback={null}
      />}
    </div>
  );
}
