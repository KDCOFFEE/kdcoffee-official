"use client";

import { useState } from "react";

export default function CampaignMedia({
  src = "",
  alt,
}: {
  src?: string;
  alt: string;
}) {
  const [
    failedSrc,
    setFailedSrc,
  ] = useState("");

  const showImage =
    Boolean(src) &&
    failedSrc !== src;

  /**
   * 處理 hydration 前
   * 已經載入失敗的圖片。
   */
  const detectPreHydrationFailure = (
    image:
      HTMLImageElement | null,
  ) => {
    if (
      image?.complete &&
      image.naturalWidth === 0
    ) {
      queueMicrotask(() =>
        setFailedSrc(
          (current) =>
            current === src
              ? current
              : src,
        ),
      );
    }
  };

  return showImage ? (
    <img
      ref={
        detectPreHydrationFailure
      }

      src={src}
      alt={alt}

      /**
       * Campaign 位於 Hero / HOME002 /
       * HOME003 之後，
       * 不需要首頁剛開啟就下載。
       */
      loading="lazy"
      decoding="async"

      onError={() =>
        setFailedSrc(src)
      }
    />
  ) : (
    <div
      className="campaign-placeholder"
      aria-hidden="true"
    >
      <span>KD</span>
      <small>
        COFFEE CAMPAIGN
      </small>
    </div>
  );
}