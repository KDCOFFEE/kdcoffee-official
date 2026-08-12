"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import type { MediaAsset } from "@/lib/media";

type KdMediaProps = {
  media?: MediaAsset | null;
  alt: string;
  className?: string;
  fallback?: ReactNode;
  fallbackImageUrl?: string;
  backgroundVideo?: boolean;
  eager?: boolean;
};

export default function KdMedia({
  media,
  alt,
  className,
  fallback = null,
  fallbackImageUrl,
  backgroundVideo = false,
  eager = false,
}: KdMediaProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const [nearViewport, setNearViewport] = useState(eager);
  const [failed, setFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [fallbackImageFailed, setFallbackImageFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    setPosterFailed(false);
    setFallbackImageFailed(false);
  }, [media?.url, media?.posterUrl, fallbackImageUrl]);
  useEffect(() => {
    if (eager || nearViewport) return;
    const element = container.current;
    if (!element || !("IntersectionObserver" in window)) {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: "240px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [eager, nearViewport]);

  if (!media || failed) {
    const cloudinaryPoster = media?.type === "video" ? media.posterUrl : undefined;
    if (cloudinaryPoster && !posterFailed) {
      return <img src={cloudinaryPoster} alt={alt} className={className} loading={eager ? "eager" : "lazy"} onError={() => setPosterFailed(true)} />;
    }
    if (fallbackImageUrl && fallbackImageUrl !== cloudinaryPoster && !fallbackImageFailed) {
      return <img src={fallbackImageUrl} alt={alt} className={className} loading={eager ? "eager" : "lazy"} onError={() => setFallbackImageFailed(true)} />;
    }
    return fallback;
  }

  if (media.type === "image") {
    return <img src={media.url} alt={alt} className={className} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} />;
  }

  return (
    <div ref={container} className={`kd-media-video-shell${className ? ` ${className}` : ""}`}>
      {nearViewport ? (
        <video src={media.url} poster={media.posterUrl || fallbackImageUrl} controls={!backgroundVideo} autoPlay={backgroundVideo} muted={backgroundVideo} loop={backgroundVideo} playsInline preload="metadata" aria-label={alt} onError={() => setFailed(true)} />
      ) : media.posterUrl && !posterFailed ? (
        <img src={media.posterUrl} alt={alt} loading="lazy" onError={() => setPosterFailed(true)} />
      ) : fallbackImageUrl && fallbackImageUrl !== media.posterUrl && !fallbackImageFailed ? (
        <img src={fallbackImageUrl} alt={alt} loading="lazy" onError={() => setFallbackImageFailed(true)} />
      ) : fallback}
    </div>
  );
}
