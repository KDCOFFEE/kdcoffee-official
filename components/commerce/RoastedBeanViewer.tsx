"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import KdMedia from "@/components/media/KdMedia";
import { resolveMediaAsset, type MediaAsset } from "@/lib/media";

export type RoastedBeanGalleryItem = {
  id?: string;
  path?: string;
  media?: MediaAsset | null;
  alt?: string;
  title?: string;
  caption?: string;
};

type RoastedBeanViewerProps = {
  productName: string;
  items?: RoastedBeanGalleryItem[];
  imageSrc?: string;
  imageAlt?: string;
  heading?: string;
  cta?: string;
};

type ViewerState = "closed" | "open" | "closing";
const closeDuration = 300;

export default function RoastedBeanViewer({
  productName,
  items = [],
  imageSrc = "",
  imageAlt = "",
  heading = "看見這支咖啡烘焙後的樣子",
  cta = "VIEW ROASTED BEANS",
}: RoastedBeanViewerProps) {
  const mediaItems = useMemo<RoastedBeanGalleryItem[]>(() => {
    const valid = items.filter((item) => item && (item.path || item.media));
    if (valid.length) return valid;
    return imageSrc ? [{ id: "legacy-roasted-1", path: imageSrc, alt: imageAlt }] : [];
  }, [items, imageSrc, imageAlt]);

  const [viewerState, setViewerState] = useState<ViewerState>("closed");
  const [activeIndex, setActiveIndex] = useState(0);
  const viewerStateRef = useRef<ViewerState>("closed");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const activeIndexRef = useRef(0);
  const isOpen = viewerState !== "closed";
  const isViewerMounted = isOpen && typeof document !== "undefined";
  const activeItem = mediaItems[Math.min(activeIndex, Math.max(mediaItems.length - 1, 0))];
  const activeMedia = activeItem ? resolveMediaAsset(activeItem.media, activeItem.path) : null;

  const setViewerPhase = (nextState: ViewerState) => {
    viewerStateRef.current = nextState;
    setViewerState(nextState);
  };
  const finishClose = () => {
    setViewerPhase("closed");
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const closeViewer = () => {
    if (viewerStateRef.current !== "open") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return finishClose();
    setViewerPhase("closing");
    closeTimerRef.current = window.setTimeout(finishClose, closeDuration);
  };
  const setActiveMediaIndex = (index: number) => {
    const nextIndex = Math.min(Math.max(index, 0), Math.max(mediaItems.length - 1, 0));
    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
  };
  const openViewer = (index = 0) => {
    setActiveMediaIndex(index);
    setViewerPhase("open");
  };
  const selectRelative = (direction: -1 | 1) => {
    if (mediaItems.length < 2) return;
    setActiveMediaIndex((activeIndexRef.current + direction + mediaItems.length) % mediaItems.length);
  };

  useEffect(() => {
    if (!isViewerMounted) return;
    document.body.classList.add("roasted-bean-viewer-open");

    const focusInitialControl = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLButtonElement>("[data-roasted-bean-close]")?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (viewerStateRef.current !== "open") return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          setViewerPhase("closed");
          window.requestAnimationFrame(() => triggerRef.current?.focus());
        } else {
          setViewerPhase("closing");
          closeTimerRef.current = window.setTimeout(() => {
            setViewerPhase("closed");
            window.requestAnimationFrame(() => triggerRef.current?.focus());
          }, closeDuration);
        }
        return;
      }
      if (event.key === "ArrowLeft" && mediaItems.length > 1) {
        event.preventDefault();
        const nextIndex = (activeIndexRef.current - 1 + mediaItems.length) % mediaItems.length;
        activeIndexRef.current = nextIndex;
        setActiveIndex(nextIndex);
        return;
      }
      if (event.key === "ArrowRight" && mediaItems.length > 1) {
        event.preventDefault();
        const nextIndex = (activeIndexRef.current + 1) % mediaItems.length;
        activeIndexRef.current = nextIndex;
        setActiveIndex(nextIndex);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusInitialControl);
      document.body.classList.remove("roasted-bean-viewer-open");
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isViewerMounted, mediaItems.length]);
  useEffect(() => () => { if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current); }, []);

  if (!mediaItems.length) return null;

  const renderThumb = (item: RoastedBeanGalleryItem, index: number, modal = false) => {
    const media = resolveMediaAsset(item.media, item.path);
    const imageUrl = media?.type === "image" ? media.url : media?.type === "video" ? media.posterUrl : item.path;
    const video = media?.type === "video" || media?.type === "youtube";
    return (
      <button
        key={item.id || `${item.path || media?.url || "roasted"}-${index}`}
        type="button"
        className={`roasted-bean-viewer-thumb${index === activeIndex ? " is-active" : ""}${modal ? " is-modal" : ""}`}
        aria-label={`查看第 ${index + 1} 筆烘焙豆媒體`}
        aria-current={index === activeIndex ? "true" : undefined}
        onClick={() => modal ? setActiveMediaIndex(index) : openViewer(index)}
      >
        {imageUrl ? <img src={imageUrl} alt="" /> : <span className="roasted-bean-viewer-thumb-placeholder">{video ? "▶" : "MEDIA"}</span>}
        {video ? <i aria-hidden="true">▶</i> : null}
        <b>{String(index + 1).padStart(2, "0")}</b>
      </button>
    );
  };

  return <>
    <button ref={triggerRef} type="button" className="roasted-bean-viewer-trigger" onClick={() => openViewer(0)} aria-haspopup="dialog" aria-expanded={isOpen}>
      <span className="roasted-bean-viewer-eyebrow">ROASTED BEANS</span>
      <span className="roasted-bean-viewer-copy"><strong>{heading}</strong><span>{cta} <i aria-hidden="true">↗</i></span></span>
    </button>

    <div className="roasted-bean-viewer-entry-thumbs" aria-label="烘焙豆照片與影片縮圖">
      {mediaItems.map((item, index) => renderThumb(item, index))}
    </div>

    {isViewerMounted ? createPortal(
      <div className={`roasted-bean-viewer-backdrop${viewerState === "closing" ? " is-closing" : ""}`} role="presentation" onMouseDown={(event) => { if (!(event.target as HTMLElement).closest("[data-roasted-bean-content]")) closeViewer(); }}>
        <div ref={dialogRef} className={`roasted-bean-viewer-modal${viewerState === "closing" ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-labelledby="roasted-bean-viewer-title">
          <div className="roasted-bean-viewer-heading" data-roasted-bean-content><p>ROASTED BEANS</p><h2 id="roasted-bean-viewer-title">{productName}</h2><span>{activeIndex + 1} / {mediaItems.length}</span></div>
          <button type="button" className="roasted-bean-viewer-close" aria-label="關閉烘焙豆 Gallery" data-roasted-bean-close data-roasted-bean-content onClick={closeViewer}>×</button>

          <div className="roasted-bean-viewer-stage" data-roasted-bean-content>
            {mediaItems.length > 1 ? <button type="button" className="roasted-bean-viewer-nav is-prev" aria-label="上一筆媒體" onClick={() => selectRelative(-1)}>‹</button> : null}
            <figure className="roasted-bean-viewer-figure">
              {activeMedia ? <KdMedia media={activeMedia} alt={activeItem?.alt || `${productName} 實際烘焙咖啡豆`} fallbackImageUrl={activeItem?.path} className="roasted-bean-viewer-media" eager fallback={<span className="roasted-bean-viewer-media-fallback">媒體暫時無法顯示</span>} /> : null}
              <figcaption>{activeItem?.caption || (activeMedia?.type === "video" || activeMedia?.type === "youtube" ? "實際烘焙豆影片" : "實際烘焙豆影像")}</figcaption>
            </figure>
            {mediaItems.length > 1 ? <button type="button" className="roasted-bean-viewer-nav is-next" aria-label="下一筆媒體" onClick={() => selectRelative(1)}>›</button> : null}
          </div>

          {mediaItems.length > 1 ? <div className="roasted-bean-viewer-modal-thumbs" data-roasted-bean-content>{mediaItems.map((item, index) => renderThumb(item, index, true))}</div> : null}
        </div>
      </div>,
      document.body
    ) : null}
  </>;
}
