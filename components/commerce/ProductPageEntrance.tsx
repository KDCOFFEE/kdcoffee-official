"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

type ProductPageEntranceProps = {
  children: ReactNode;
  enabled: boolean;
};

/**
 * Holds the first visual state through a paint before enabling the product
 * entrance transition. Editorial sections use their own observer separately.
 */
export default function ProductPageEntrance({ children, enabled }: ProductPageEntranceProps) {
  const [isEntranceReady, setIsEntranceReady] = useState(false);
  const firstFrameRef = useRef<number | null>(null);
  const secondFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    firstFrameRef.current = window.requestAnimationFrame(() => {
      secondFrameRef.current = window.requestAnimationFrame(() => {
        setIsEntranceReady(true);
      });
    });

    return () => {
      if (firstFrameRef.current !== null) {
        window.cancelAnimationFrame(firstFrameRef.current);
      }
      if (secondFrameRef.current !== null) {
        window.cancelAnimationFrame(secondFrameRef.current);
      }
    };
  }, [enabled]);

  return (
    <div className={`product-page-entrance${isEntranceReady ? " is-entrance-ready" : ""}`}>
      {children}
    </div>
  );
}
