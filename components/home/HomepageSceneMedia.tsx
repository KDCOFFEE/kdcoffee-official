"use client";

import { useState } from "react";

type Props = {
  src?: string;
  alt: string;
  imageId: string;
  label: string;
  recommendedSize?: string;
};

export default function HomepageSceneMedia({ src = "", alt, imageId, label, recommendedSize }: Props) {
  const [failedSrc, setFailedSrc] = useState("");
  const showImage = Boolean(src) && failedSrc !== src;
  const detectPreHydrationFailure = (image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth === 0) {
      queueMicrotask(() => setFailedSrc((current) => current === src ? current : src));
    }
  };

  return <div className="v3-scene-media">
    {showImage
      ? <img ref={detectPreHydrationFailure} src={src} alt={alt} onError={() => setFailedSrc(src)}/>
      : <div className="v3-scene-placeholder"><span>{imageId}</span><strong>{label}</strong><small>{recommendedSize||"請至後台上傳情境圖片"}</small></div>}
    <div className="v3-scene-shade"/>
  </div>;
}
