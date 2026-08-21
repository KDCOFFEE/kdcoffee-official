"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

type PurchaseChapterRevealProps = {
  children: ReactNode;
};

export default function PurchaseChapterReveal({ children }: PurchaseChapterRevealProps) {
  const chapterRef = useRef<HTMLDivElement>(null);
  const [isActivated, setIsActivated] = useState(false);

  useEffect(() => {
    const chapter = chapterRef.current;

    if (!chapter || !("IntersectionObserver" in window)) {
      return;
    }

    const initialScrollY = window.scrollY;
    let observer: IntersectionObserver | null = null;

    const beginObserving = () => {
      if (Math.abs(window.scrollY - initialScrollY) < 1) {
        return;
      }

      window.removeEventListener("scroll", beginObserving);

      try {
        observer = new IntersectionObserver(
          ([entry]) => {
            if (!entry?.isIntersecting || entry.intersectionRatio < 0.15) {
              return;
            }

            setIsActivated(true);
            observer?.disconnect();
          },
          { rootMargin: "0px", threshold: 0.15 },
        );
        observer.observe(chapter);
      } catch {
        observer?.disconnect();
      }
    };

    window.addEventListener("scroll", beginObserving, { passive: true });

    return () => {
      window.removeEventListener("scroll", beginObserving);
      observer?.disconnect();
    };
  }, []);

  return (
    <div
      ref={chapterRef}
      className={`product-purchase-chapter${isActivated ? " is-purchase-chapter-active" : ""}`}
    >
      {children}
    </div>
  );
}
