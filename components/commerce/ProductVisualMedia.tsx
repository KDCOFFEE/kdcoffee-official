"use client";

import {
  type ReactNode,
  useState,
} from "react";

type ProductVisualMediaProps = {
  src?: string;
  alt: string;
  className?: string;
  fallback?: ReactNode;

  /**
   * 圖片載入策略。
   *
   * 預設不設定，
   * 因此既有 /works、商品頁等行為完全不變。
   *
   * HOME004 可以另外指定：
   *
   * loading="lazy"
   */
  loading?: "eager" | "lazy";

  /**
   * 圖片解碼方式。
   *
   * HOME004 會使用 async，
   * 避免圖片解碼阻塞主要畫面。
   */
  decoding?: "async" | "auto" | "sync";
};

export default function ProductVisualMedia({
  src = "",
  alt,
  className,
  fallback = null,
  loading,
  decoding,
}: ProductVisualMediaProps) {
  const [
    loadedSrc,
    setLoadedSrc,
  ] = useState("");

  const [
    failedSrc,
    setFailedSrc,
  ] = useState("");

  const showImage =
    Boolean(src) &&
    failedSrc !== src;

  const imageReady =
    showImage &&
    loadedSrc === src;

  /**
   * 處理圖片在 React hydration 前
   * 已經載入或失敗的情況。
   */
  const inspectImage = (
    image:
      HTMLImageElement | null,
  ) => {
    if (!image?.complete) {
      return;
    }

    queueMicrotask(() => {
      if (
        image.naturalWidth > 0
      ) {
        setLoadedSrc(src);
      } else {
        setFailedSrc(src);
      }
    });
  };

  return (
    <>
      {showImage ? (
        <img
          ref={inspectImage}
          src={src}
          alt={alt}
          className={className}

          /**
           * 沒有傳入 loading 時，
           * 保留原本瀏覽器行為。
           */
          loading={loading}

          /**
           * 沒有傳入 decoding 時，
           * 保留原本瀏覽器行為。
           */
          decoding={decoding}

          style={{
            opacity:
              imageReady
                ? 1
                : 0,
          }}

          onLoad={() =>
            setLoadedSrc(src)
          }

          onError={() =>
            setFailedSrc(src)
          }
        />
      ) : null}

      {!imageReady
        ? fallback
        : null}
    </>
  );
}