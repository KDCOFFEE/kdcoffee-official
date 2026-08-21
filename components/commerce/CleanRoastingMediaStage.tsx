"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  enabledCleanRoastingMediaItems,
  type CleanRoastingMediaConfig,
} from "@/lib/cleanRoastingMedia";

type CleanRoastingMediaStageProps = {
  config: CleanRoastingMediaConfig;
  eligible: boolean;
};

export default function CleanRoastingMediaStage({ config, eligible }: CleanRoastingMediaStageProps) {
  const items = enabledCleanRoastingMediaItems(config);
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState<"next" | "previous">("next");
  const [hasTransitioned, setHasTransitioned] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const gesture = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const currentIndex = items.length ? Math.min(activeIndex, items.length - 1) : 0;
  const activeItem = items[currentIndex];
  const display = config.display || {};
  const isSlider = display.mode !== "single" && items.length > 1;

  const move = (step: -1 | 1) => {
    if (!isSlider) return;
    setHasTransitioned(true);
    setDirection(step > 0 ? "next" : "previous");
    setActiveIndex((current) => (Math.min(current, items.length - 1) + step + items.length) % items.length);
  };

  useEffect(() => {
    if (!isSlider || display.autoplay !== true) return;
    const interval = window.setInterval(() => {
      setDirection("next");
      setHasTransitioned(true);
      setActiveIndex((current) => (Math.min(current, items.length - 1) + 1) % items.length);
    }, Math.min(12000, Math.max(3000, display.autoplayIntervalMs || 6000)));
    return () => window.clearInterval(interval);
  }, [display.autoplay, display.autoplayIntervalMs, isSlider, items.length]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || activeItem?.type !== "video" || !eligible) return;
    void video.play().catch(() => {
      // Muted autoplay can still be declined; navigation remains available.
    });
    return () => video.pause();
  }, [activeItem?.id, activeItem?.type, eligible]);

  if (!activeItem) return null;

  const transition = display.transition === "fade" ? "fade" : "slide";
  const transitionDuration = Math.min(1200, Math.max(200, display.transitionDurationMs || 450));

  return (
    <figure
      className="clean-roasting-video-frame clean-roasting-reveal-video clean-roasting-media-stage"
      data-transition={transition}
      data-direction={direction}
      data-has-transitioned={hasTransitioned ? "true" : "false"}
      style={{ "--clean-media-transition-duration": `${transitionDuration}ms` } as CSSProperties}
      onPointerDown={(event) => {
        if (!event.isPrimary) return;
        gesture.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      }}
      onPointerUp={(event) => {
        const start = gesture.current;
        gesture.current = null;
        if (!start || start.pointerId !== event.pointerId) return;
        const horizontal = event.clientX - start.x;
        const vertical = event.clientY - start.y;
        if (Math.abs(horizontal) < 48 || Math.abs(horizontal) <= Math.abs(vertical) * 1.35) return;
        move(horizontal < 0 ? 1 : -1);
      }}
      onPointerCancel={() => { gesture.current = null; }}
    >
      <div className="clean-roasting-media-slide" key={activeItem.id}>
        {activeItem.type === "image" ? (
          <img src={activeItem.src} alt={activeItem.alt || "KD Coffee 乾淨烘焙實拍"} loading="lazy" decoding="async" />
        ) : (
          <>
            <video
              ref={videoRef}
              poster={activeItem.poster || activeItem.media?.posterUrl}
              autoPlay
              muted
              loop
              playsInline
              preload={eligible ? "auto" : "none"}
              aria-label={activeItem.alt || "KD Coffee 烘焙影片"}
            >
              {eligible ? <source src={activeItem.src} type={activeItem.media?.format ? `video/${activeItem.media.format}` : "video/mp4"} /> : null}
            </video>
            <noscript><video src={activeItem.src} poster={activeItem.poster || activeItem.media?.posterUrl} muted loop playsInline preload="metadata" /></noscript>
          </>
        )}
        <span className="clean-roasting-video-overlay" aria-hidden="true" />
      </div>
      {isSlider ? (
        <div className="clean-roasting-slider-controls">
          <button type="button" onClick={() => move(-1)} aria-label="上一個媒體">‹</button>
          <span aria-live="polite">{String(currentIndex + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}</span>
          <button type="button" onClick={() => move(1)} aria-label="下一個媒體">›</button>
        </div>
      ) : null}
    </figure>
  );
}
