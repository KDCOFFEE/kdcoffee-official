"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

type ProductSectionRevealsProps = {
  children: ReactNode;
};

/**
 * Adds restrained, progressive reveal motion to editorial product content.
 * One observer is shared by every marked section inside this boundary.
 */
export default function ProductSectionReveals({ children }: ProductSectionRevealsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [motionEnabled, setMotionEnabled] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (!root || prefersReducedMotion.matches || !("IntersectionObserver" in window)) {
      return;
    }

    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-section-reveal]"));
    if (!targets.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px 12% 0px", threshold: 0.01 },
    );

    targets.forEach((target) => {
      const requestedDelay = Number.parseInt(target.dataset.revealDelay || "0", 10);
      const delay = Number.isFinite(requestedDelay) ? Math.min(Math.max(requestedDelay, 0), 120) : 0;
      target.style.setProperty("--product-reveal-delay", `${delay}ms`);
      observer.observe(target);
    });

    setMotionEnabled(true);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      className={`product-section-reveals${motionEnabled ? " is-reveal-enabled" : ""}`}
    >
      {children}
    </div>
  );
}
