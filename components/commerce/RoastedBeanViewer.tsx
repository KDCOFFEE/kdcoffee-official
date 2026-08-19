"use client";

import { useEffect, useRef, useState } from "react";

type RoastedBeanViewerProps = { productName: string; imageSrc: string; imageAlt: string };
type ViewerState = "closed" | "open" | "closing";
const closeDuration = 300;

export default function RoastedBeanViewer({ productName, imageSrc, imageAlt }: RoastedBeanViewerProps) {
  const [viewerState, setViewerState] = useState<ViewerState>("closed");
  const viewerStateRef = useRef<ViewerState>("closed");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const isOpen = viewerState !== "closed";

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

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.classList.add("roasted-bean-viewer-open");
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    const focusInitialControl = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLButtonElement>("[data-roasted-bean-close]")?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeViewer(); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || []);
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusInitialControl);
      document.body.classList.remove("roasted-bean-viewer-open");
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  useEffect(() => () => { if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current); }, []);

  return <>
    <button ref={triggerRef} type="button" className="roasted-bean-viewer-trigger" onClick={() => setViewerPhase("open")} aria-haspopup="dialog" aria-expanded={isOpen}>
      <span className="roasted-bean-viewer-eyebrow">ROASTED BEANS</span>
      <span className="roasted-bean-viewer-copy"><strong>看見這支咖啡烘焙後的樣子</strong><span>VIEW ROASTED BEANS <i aria-hidden="true">↗</i></span></span>
    </button>
    {isOpen ? <div className={`roasted-bean-viewer-backdrop${viewerState === "closing" ? " is-closing" : ""}`} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeViewer(); }}>
      <div ref={dialogRef} className={`roasted-bean-viewer-modal${viewerState === "closing" ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-labelledby="roasted-bean-viewer-title">
        <div className="roasted-bean-viewer-heading"><p>ROASTED BEANS</p><h2 id="roasted-bean-viewer-title">{productName}</h2></div>
        <button type="button" className="roasted-bean-viewer-close" aria-label="關閉烘焙豆照片" data-roasted-bean-close onClick={closeViewer}>×</button>
        <figure className="roasted-bean-viewer-figure"><img src={imageSrc} alt={imageAlt} className="roasted-bean-viewer-image" /><figcaption>實際烘焙豆影像</figcaption></figure>
      </div>
    </div> : null}
  </>;
}
