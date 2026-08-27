"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import type { MediaAsset } from "@/lib/media";
import { normalizeYouTubeVideoId, youtubeEmbedUrl } from "@/lib/youtubeMedia";

type KdMediaProps = {
  media?: MediaAsset | null;
  alt: string;
  className?: string;
  fallback?: ReactNode;
  fallbackImageUrl?: string;
  backgroundVideo?: boolean;
  showPlayAffordance?: boolean;
  playLabel?: string;
  eager?: boolean;
};

export default function KdMedia({
  media,
  alt,
  className,
  fallback = null,
  fallbackImageUrl,
  backgroundVideo = false,
  showPlayAffordance = false,
  playLabel = "播放影片",
  eager = false,
}: KdMediaProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const [nearViewport, setNearViewport] = useState(eager);
  const [playing, setPlaying] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [failedPosterUrl, setFailedPosterUrl] = useState<string | null>(null);
  const [failedFallbackUrl, setFailedFallbackUrl] = useState<string | null>(null);
  const failed = Boolean(media?.url) && failedUrl === media?.url;
  const posterFailed = Boolean(media?.posterUrl) && failedPosterUrl === media?.posterUrl;
  const fallbackImageFailed = Boolean(fallbackImageUrl) && failedFallbackUrl === fallbackImageUrl;
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
  useEffect(() => {
    const element=video.current;
    if(!element)return;
    if(backgroundVideo){element.muted=true;element.load();void element.play().catch(()=>undefined);}
    else element.pause();
  },[backgroundVideo,media?.url,nearViewport]);
  function handleVideoPause(){setPlaying(false);const element=video.current;if(backgroundVideo&&element&&Number.isFinite(element.duration)&&element.currentTime>=element.duration-.12){element.currentTime=0;void element.play().catch(()=>undefined);}}
  function keepBackgroundVideoLooping(){const element=video.current;if(backgroundVideo&&element&&Number.isFinite(element.duration)&&element.duration-element.currentTime<.5){element.currentTime=0;if(element.paused)void element.play().catch(()=>undefined);}}
  function startBackgroundVideo(){const element=video.current;if(!backgroundVideo||!element)return;element.currentTime=0;void element.play().catch(()=>{element.currentTime=0;});}

  if (!media || failed) {
    const cloudinaryPoster = media?.type === "video" ? media.posterUrl : undefined;
    if (cloudinaryPoster && !posterFailed) {
      return <img src={cloudinaryPoster} alt={alt} className={className} loading={eager ? "eager" : "lazy"} onError={() => setFailedPosterUrl(cloudinaryPoster)} />;
    }
    if (fallbackImageUrl && fallbackImageUrl !== cloudinaryPoster && !fallbackImageFailed) {
      return <img src={fallbackImageUrl} alt={alt} className={className} loading={eager ? "eager" : "lazy"} onError={() => setFailedFallbackUrl(fallbackImageUrl)} />;
    }
    return fallback;
  }

  if (media.type === "image") {
    return <img src={media.url} alt={alt} className={className} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailedUrl(media.url)} />;
  }

  if (media.type === "youtube") {
    let videoId = media.videoId;
    try {
      videoId = normalizeYouTubeVideoId(videoId);
    } catch {
      return fallback;
    }
    return (
      <div ref={container} className={`kd-media-video-shell kd-media-youtube-shell${className ? ` ${className}` : ""}`}>
        {nearViewport ? (
          <iframe
            src={youtubeEmbedUrl(videoId)}
            title={alt}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt={alt} loading="lazy" />
        )}
      </div>
    );
  }

  return (
    <div ref={container} className={`kd-media-video-shell${className ? ` ${className}` : ""}`}>
      {nearViewport ? (
        <><video key={backgroundVideo?"background-playback":"visitor-playback"} ref={video} src={media.url} poster={media.posterUrl || fallbackImageUrl} controls={!backgroundVideo} autoPlay={backgroundVideo} muted={backgroundVideo} loop={backgroundVideo} playsInline preload={backgroundVideo ? "auto" : "metadata"} aria-hidden={backgroundVideo ? true : undefined} aria-label={backgroundVideo ? undefined : alt} onLoadedMetadata={startBackgroundVideo} onPlay={() => setPlaying(true)} onPause={handleVideoPause} onTimeUpdate={keepBackgroundVideoLooping} onEnded={() => {setPlaying(false);if(backgroundVideo&&video.current){video.current.currentTime=0;void video.current.play().catch(()=>undefined);}}} onError={() => setFailedUrl(media.url)} />{showPlayAffordance && !backgroundVideo && !playing ? <button type="button" className="kd-media-play-affordance" aria-label={playLabel} onClick={() => { void video.current?.play(); }}><i aria-hidden="true"/><span>{playLabel}</span></button> : null}</>
      ) : media.posterUrl && !posterFailed ? (
        <img src={media.posterUrl} alt={alt} loading="lazy" onError={() => setFailedPosterUrl(media.posterUrl || null)} />
      ) : fallbackImageUrl && fallbackImageUrl !== media.posterUrl && !fallbackImageFailed ? (
        <img src={fallbackImageUrl} alt={alt} loading="lazy" onError={() => setFailedFallbackUrl(fallbackImageUrl)} />
      ) : fallback}
    </div>
  );
}
