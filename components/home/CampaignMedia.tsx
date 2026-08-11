"use client";

import { useState } from "react";

export default function CampaignMedia({ src = "", alt }: { src?: string; alt: string }) {
  const [failedSrc, setFailedSrc] = useState("");
  const showImage = Boolean(src) && failedSrc !== src;
  const detectPreHydrationFailure = (image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth === 0) {
      queueMicrotask(() => setFailedSrc((current) => current === src ? current : src));
    }
  };

  return showImage
    ? <img ref={detectPreHydrationFailure} src={src} alt={alt} onError={() => setFailedSrc(src)} />
    : <div className="campaign-placeholder" aria-hidden="true"><span>KD</span><small>COFFEE CAMPAIGN</small></div>;
}
