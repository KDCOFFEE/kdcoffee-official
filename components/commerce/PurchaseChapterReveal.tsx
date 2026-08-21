"use client";

import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import {
  getProductAnimationAttributes,
  normalizeAnimationDelay,
  normalizeAnimationDuration,
  type ProductSectionAnimationConfig,
} from "@/lib/productPageAnimations";

type PurchaseChapterRevealProps = {
  children: ReactNode;
  animation?: ProductSectionAnimationConfig | null;
};

export default function PurchaseChapterReveal({ children, animation = null }: PurchaseChapterRevealProps) {
  const chapterRef = useRef<HTMLDivElement>(null);
  const [isActivated, setIsActivated] = useState(false);

  useEffect(() => {
    const chapter = chapterRef.current;

    if (animation || !chapter || !("IntersectionObserver" in window)) {
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
  }, [animation]);

  const animationAttributes = getProductAnimationAttributes(animation);
  const left = animation?.children?.left;
  const right = animation?.children?.right;
  const animationStyle = "style" in animationAttributes ? animationAttributes.style : {};

  return (
    <div
      {...animationAttributes}
      id="select-your-coffee"
      ref={chapterRef}
      className={`product-purchase-chapter${isActivated ? " is-purchase-chapter-active" : ""}`}
      data-select-left-effect={left?.effect || "slide-left"}
      data-select-right-effect={right?.effect || "slide-right"}
      style={{
        ...animationStyle,
        "--select-left-duration": `${normalizeAnimationDuration(left?.durationMs, 540)}ms`,
        "--select-left-delay": `${normalizeAnimationDelay(left?.delayMs, 0)}ms`,
        "--select-right-duration": `${normalizeAnimationDuration(right?.durationMs, 540)}ms`,
        "--select-right-delay": `${normalizeAnimationDelay(right?.delayMs, 100)}ms`,
      } as CSSProperties}
    >
      {children}
    </div>
  );
}
