"use client";

import { type ReactNode, useState } from "react";

type ProductVisualMediaProps = {
  src?: string;
  alt: string;
  className?: string;
  fallback?: ReactNode;
};

export default function ProductVisualMedia({
  src = "",
  alt,
  className,
  fallback = null,
}: ProductVisualMediaProps) {
  const [loadedSrc, setLoadedSrc] = useState("");
  const [failedSrc, setFailedSrc] = useState("");
  const showImage = Boolean(src) && failedSrc !== src;
  const imageReady = showImage && loadedSrc === src;
  const inspectImage = (image: HTMLImageElement | null) => {
    if (!image?.complete) return;
    queueMicrotask(() => {
      if (image.naturalWidth > 0) setLoadedSrc(src);
      else setFailedSrc(src);
    });
  };

  return <>
    {showImage ? <img
      ref={inspectImage}
      src={src}
      alt={alt}
      className={className}
      style={{ opacity: imageReady ? 1 : 0 }}
      onLoad={() => setLoadedSrc(src)}
      onError={() => setFailedSrc(src)}
    /> : null}
    {!imageReady ? fallback : null}
  </>;
}
