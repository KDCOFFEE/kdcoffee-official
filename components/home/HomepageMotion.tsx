"use client";

import { useEffect } from "react";

const revealSelector = "[data-home-reveal]";
const sectionMotionSelector = "[data-home-motion]";

function reveal(target: HTMLElement) {
  if (target.matches(sectionMotionSelector)) {
    target.classList.remove("is-home-motion-pending");
    target.classList.add("is-home-motion-entered");
    target.dataset.homeMotionState = "entered";
    return;
  }
  target.classList.add("is-home-revealed");
}

export default function HomepageMotion() {
  useEffect(() => {
    const root = document.documentElement;
    const configuredSections = Array.from(document.querySelectorAll<HTMLElement>(sectionMotionSelector));
    const legacyTargets = Array.from(document.querySelectorAll<HTMLElement>(revealSelector)).filter(
      (target) => !target.closest(sectionMotionSelector),
    );
    const targets = [...configuredSections, ...legacyTargets];
    const rails = Array.from(
      document.querySelectorAll<HTMLElement>(".home-mobile-rail[tabindex='0']"),
    );
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const handleRailKeydown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

      const rail = event.currentTarget as HTMLElement;
      if (rail.scrollWidth <= rail.clientWidth) return;

      event.preventDefault();
      rail.scrollBy({
        left:
          (event.key === "ArrowRight" ? 1 : -1) *
          Math.min(rail.clientWidth * 0.82, 340),
        behavior: reducedMotion.matches ? "auto" : "smooth",
      });
    };

    rails.forEach((rail) => rail.addEventListener("keydown", handleRailKeydown));

    if (
      reducedMotion.matches ||
      !("IntersectionObserver" in window) ||
      targets.length === 0
    ) {
      return () => {
        rails.forEach((rail) =>
          rail.removeEventListener("keydown", handleRailKeydown),
        );
      };
    }

    let observer: IntersectionObserver | null = null;
    let failOpenTimer: number | undefined;
    let observerResponded = false;

    try {
      observer = new IntersectionObserver(
        (entries) => {
          // A callback with non-intersecting entries still proves that the
          // observer is healthy. Do not prematurely reveal every lower
          // section before the visitor has had a chance to reach it.
          observerResponded = true;
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            reveal(entry.target as HTMLElement);
            observer?.unobserve(entry.target);
          });
        },
        { rootMargin: "0px 0px -12%", threshold: 0.14 },
      );

      configuredSections.forEach((target) => {
        if (target.dataset.homeMotion === "none") return;
        target.classList.add("is-home-motion-pending");
        target.dataset.homeMotionState = "pending";
      });
      targets.forEach((target) => observer?.observe(target));
      root.classList.add("is-home-motion-ready");

      failOpenTimer = window.setTimeout(() => {
        if (observerResponded) return;
        targets.forEach(reveal);
        root.classList.remove("is-home-motion-ready");
        observer?.disconnect();
      }, 4000);
    } catch {
      root.classList.remove("is-home-motion-ready");
      targets.forEach(reveal);
    }

    return () => {
      if (failOpenTimer) window.clearTimeout(failOpenTimer);
      observer?.disconnect();
      configuredSections.forEach((target) => target.classList.remove("is-home-motion-pending"));
      rails.forEach((rail) =>
        rail.removeEventListener("keydown", handleRailKeydown),
      );
      root.classList.remove("is-home-motion-ready");
    };
  }, []);

  return null;
}
