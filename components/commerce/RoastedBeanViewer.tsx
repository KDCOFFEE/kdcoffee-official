"use client";

import { useEffect, useRef, useState } from "react";

type RoastedBeanViewerProps = { productName: string; imageSrc: string; imageAlt: string };
type ViewerState = "closed" | "open" | "closing";

export default function RoastedBeanViewer({ productName, imageSrc, imageAlt }: RoastedBeanViewerProps) {
  const [viewerState, setViewerState] = useState<ViewerState>("closed");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const isOpen = viewerState !== "closed";

  const finishClose = () => {
    setViewerState("closed");
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const closeViewer = () => {
    if (viewerState !== "open") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return finishClose();
    setViewerState("closing");
    closeTimerRef.current = window.setTimeout(finishClose, 240);
  };

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
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
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  useEffect(() => () => { if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current); }, []);

  return <>
    <button ref={triggerRef} type="button" className="roasted-bean-viewer-trigger" onClick={() => setViewerState("open")} aria-haspopup="dialog" aria-expanded={isOpen}>
      <span>實際烘焙豆</span><strong>查看照片 <i aria-hidden="true">→</i></strong>
    </button>
    {isOpen ? <div className={`roasted-bean-viewer-backdrop${viewerState === "closing" ? " is-closing" : ""}`} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeViewer(); }}>
      <div ref={dialogRef} className={`roasted-bean-viewer-modal${viewerState === "closing" ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-labelledby="roasted-bean-viewer-title">
        <button type="button" className="roasted-bean-viewer-close" aria-label="關閉烘焙豆照片" data-roasted-bean-close onClick={closeViewer}>×</button>
        <div className="roasted-bean-viewer-heading"><p>實際烘焙豆</p><h2 id="roasted-bean-viewer-title">{productName}</h2></div>
        <img src={imageSrc} alt={imageAlt} className="roasted-bean-viewer-image" />
      </div>
    </div> : null}
  </>;
}
