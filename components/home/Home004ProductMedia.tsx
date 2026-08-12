import ProductVisualMedia from "@/components/commerce/ProductVisualMedia";

export default function Home004ProductMedia({
  src = "",
  alt,
  imageId,
}: {
  src?: string;
  alt: string;
  imageId: string;
}) {
  return (
    <div className="v3-media">
      <ProductVisualMedia
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

        fallback={
          <div className="v3-media-placeholder">
            <b>
              {imageId}
            </b>

            <span>
              作品圖片準備中
            </span>
          </div>
        }
      />
    </div>
  );
}