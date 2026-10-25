"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MediaAsset } from "@/lib/media";
import { youtubeEmbedUrl } from "@/lib/youtubeMedia";
import { studioPreviewImageUrl } from "@/components/home/HomepagePreviewContext";

/** Admin-only double buffer. The old decoded image stays until its replacement decodes. */
export default function StudioPreviewMedia({ media, alt, className, fallbackImageUrl, fallback = null }: {
  media?: MediaAsset | null; alt: string; className?: string; fallbackImageUrl?: string; fallback?: ReactNode;
}) {
  const poster = media?.type === "image" ? media.url : media?.type === "youtube" && media.videoId
    ? `https://i.ytimg.com/vi/${media.videoId}/hqdefault.jpg` : media?.posterUrl || fallbackImageUrl;
  const [shown, setShown] = useState<string>(), [failed, setFailed] = useState<string[]>([]);
  const [play, setPlay] = useState<string>(), [playing, setPlaying] = useState(false);
  const sources = Array.from(new Set([poster, fallbackImageUrl].filter((value): value is string => Boolean(value)).flatMap(src => [studioPreviewImageUrl(src), src])));
  const candidate = sources.find(src => !failed.includes(src));
  const current = useRef(candidate); current.current = candidate;
  const videos = useRef<HTMLVideoElement>(null);
  useEffect(() => { setPlay(undefined); setPlaying(false); }, [media?.url]);
  const ready = Boolean(shown && (shown === candidate || !candidate)) || !candidate;
  const images = Array.from(new Set([shown, candidate].filter((value): value is string => Boolean(value))));
  const unavailable = (src: string) => {
    if (current.current === src) setFailed(values => values.includes(src) ? values : [...values, src]);
  };
  const decoded = async (image: HTMLImageElement, src: string) => {
    if (!image.complete) return;
    if (!image.naturalWidth) { unavailable(src); return; }
    try { await image.decode(); } catch { unavailable(src); return; }
    if (current.current === src) setShown(src);
  };
  return <span className={className} data-studio-media-buffer data-studio-media-ready={ready ? "true" : "false"} aria-busy={!ready}>
    {images.map(src => <img key={src} src={src} alt={alt} loading="eager" decoding="async"
      data-studio-media-candidate={src === candidate ? "true" : undefined}
      ref={node => { if (node) void decoded(node, src); }}
      style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", ...(shown && src !== shown ? { position: "absolute", inset: 0, opacity: 0 } : {}), ...(!shown ? { opacity: 0 } : {}) }}
      onLoad={event => { void decoded(event.currentTarget, src); }} onError={() => unavailable(src)} />)}
    {!shown ? <span data-studio-media-placeholder role="status">{candidate ? "正在準備媒體…" : fallback || "此媒體沒有可用預覽圖片"}</span> : null}
    {shown && poster && failed.includes(poster) ? <span data-studio-media-notice role="status">新素材無法載入，保留目前畫面</span> : null}
    {media && media.type !== "image" && play !== media.url ? <button type="button" data-studio-media-play onClick={() => setPlay(media.url)}>播放預覽影片</button> : null}
    {play === media?.url && media?.type === "video" ? <video ref={videos} src={media.url} poster={shown || candidate} controls autoPlay playsInline preload="metadata"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: playing ? 1 : 0 }}
      onPlaying={() => setPlaying(true)} onError={() => { setPlay(undefined); setPlaying(false); }} /> : null}
    {play === media?.url && media?.type === "youtube" && media.videoId ? <iframe src={youtubeEmbedUrl(media.videoId)} title={alt} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} /> : null}
  </span>;
}
