"use client";

import { type ReactNode, useEffect, useRef } from "react";

type ProductSectionRevealsProps = {
  children: ReactNode;
  calibrated?: boolean;
};

/** One fail-open enhancement boundary for legacy and Admin-managed entrances. */
export default function ProductSectionReveals({ children, calibrated = false }: ProductSectionRevealsProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const resetRuntimeClasses = () => {
      root.classList.remove("is-reveal-enabled");
      root.querySelectorAll<HTMLElement>("[data-section-reveal]").forEach((target) => {
        target.classList.remove("is-revealed");
        target.style.removeProperty("--product-reveal-delay");
      });
      root.querySelectorAll<HTMLElement>('[data-product-animation-managed="true"]').forEach((target) => {
        target.classList.remove("is-product-animation-ready", "is-product-animation-active");
      });
    };

    resetRuntimeClasses();
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (prefersReducedMotion.matches || !("IntersectionObserver" in window)) return;

    const observers: IntersectionObserver[] = [];
    const animationFrames: number[] = [];
    const legacyTargets = Array.from(root.querySelectorAll<HTMLElement>("[data-section-reveal]"))
      .filter((target) => !target.closest('[data-product-animation-managed="true"]'));

    if (legacyTargets.length) {
      const triggerOffset = calibrated
        ? getComputedStyle(root).getPropertyValue("--product-section-trigger-offset").trim() || "-22%"
        : "12%";
      try {
        const legacyObserver = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              entry.target.classList.add("is-revealed");
              legacyObserver.unobserve(entry.target);
            });
          },
          { rootMargin: `0px 0px ${triggerOffset} 0px`, threshold: calibrated ? 0.1 : 0.01 },
        );
        legacyTargets.forEach((target) => {
          const requestedDelay = Number.parseInt(target.dataset.revealDelay || "0", 10);
          const maximumDelay = calibrated ? 440 : 220;
          const delay = Number.isFinite(requestedDelay) ? Math.min(Math.max(requestedDelay, 0), maximumDelay) : 0;
          target.style.setProperty("--product-reveal-delay", `${delay}ms`);
          legacyObserver.observe(target);
        });
        root.classList.add("is-reveal-enabled");
        observers.push(legacyObserver);
      } catch {
        root.classList.remove("is-reveal-enabled");
      }
    }

    const managedTargets = Array.from(root.querySelectorAll<HTMLElement>(
      '[data-product-animation-managed="true"][data-product-animation-enabled="true"]',
    ));
    const viewportGroups = new Map<number, HTMLElement[]>();

    managedTargets.forEach((target) => {
      const trigger = target.dataset.productAnimationTrigger;
      if (trigger === "none") return;
      if (trigger === "page-load") {
        target.classList.add("is-product-animation-ready");
        animationFrames.push(requestAnimationFrame(() => target.classList.add("is-product-animation-active")));
        return;
      }
      if (trigger !== "viewport") return;
      const requestedThreshold = Number(target.dataset.productAnimationThreshold);
      const threshold = Number.isFinite(requestedThreshold) ? Math.min(0.5, Math.max(0.05, requestedThreshold)) : 0.15;
      viewportGroups.set(threshold, [...(viewportGroups.get(threshold) || []), target]);
    });

    viewportGroups.forEach((targets, threshold) => {
      try {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              const target = entry.target as HTMLElement;
              if (entry.isIntersecting && entry.intersectionRatio >= threshold) {
                target.classList.add("is-product-animation-active");
                if (target.dataset.productAnimationOnce !== "false") observer.unobserve(target);
              } else if (target.dataset.productAnimationOnce === "false") {
                target.classList.remove("is-product-animation-active");
              }
            });
          },
          { rootMargin: "0px", threshold },
        );
        targets.forEach((target) => observer.observe(target));
        targets.forEach((target) => target.classList.add("is-product-animation-ready"));
        observers.push(observer);
      } catch {
        targets.forEach((target) => target.classList.remove("is-product-animation-ready", "is-product-animation-active"));
      }
    });

    return () => {
      observers.forEach((observer) => observer.disconnect());
      animationFrames.forEach((frame) => cancelAnimationFrame(frame));
      resetRuntimeClasses();
    };
  }, [calibrated]);

  return (
    <div
      ref={rootRef}
      className="product-section-reveals"
    >
      {children}
    </div>
  );
}
