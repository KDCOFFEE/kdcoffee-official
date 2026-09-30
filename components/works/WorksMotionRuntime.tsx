"use client";

import { useLayoutEffect } from "react";
import type { ResolvedWorksPageCms } from "@/lib/worksPageCms";
import {
  beginWorksMotion,
  claimWorksMotionRuntime,
  completeWorksMotion,
  markWorksMotionRevealed,
  releaseWorksMotionRuntime,
  resolveWorksMotionTiming,
  worksMotionState,
} from "./worksMotionLifecycle";

const keyframes = {
  fade: [{ opacity: 0 }, { opacity: 1 }],
  "fade-up": [{ opacity: 0, transform: "translateY(var(--works-motion-distance))" }, { opacity: 1, transform: "none" }],
  "slide-left": [{ opacity: 0, transform: "translateX(calc(var(--works-motion-distance) * -1))" }, { opacity: 1, transform: "none" }],
  "slide-right": [{ opacity: 0, transform: "translateX(var(--works-motion-distance))" }, { opacity: 1, transform: "none" }],
  "scale-reveal": [{ opacity: 0, transform: "scale(.97)" }, { opacity: 1, transform: "none" }],
  editorial: [{ opacity: 0, transform: "translateY(calc(var(--works-motion-distance) * .7))", clipPath: "inset(0 0 35% 0)" }, { opacity: 1, transform: "none", clipPath: "inset(0)" }],
} as const;

export default function WorksMotionRuntime({ motion }: { motion: ResolvedWorksPageCms["motion"] }) {
  useLayoutEffect(() => {
    const documentRoot = document.documentElement;
    claimWorksMotionRuntime(documentRoot);
    const releaseRuntime = () => releaseWorksMotionRuntime(documentRoot);
    const revealAll = () => {
      document.querySelectorAll<HTMLElement>("[data-works-motion-state]").forEach((node) => {
        if (worksMotionState(node) !== "revealed") {
          markWorksMotionRevealed(node);
        }
      });
      delete documentRoot.dataset.worksMotionCapable;
    };
    window.dispatchEvent(new Event("works-motion-runtime-ready"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { revealAll(); return releaseRuntime; }
    const root = document.querySelector<HTMLElement>("[data-works-motion-root]");
    if (!root) { revealAll(); return releaseRuntime; }
    const cleanups: Array<() => void> = [];
    try {
    (["hero", "heroMedia", "catalogIntro", "productGrid"] as const).forEach((target) => {
      const setting = motion[target];
      if (!setting.enabled || setting.preset === "none") return;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(`[data-works-motion-target="${target}"]`)).filter((node) => worksMotionState(node) === "pre-reveal");
      const play = () => nodes.forEach((node, index) => {
        if (!beginWorksMotion(node)) return;
        const timing = resolveWorksMotionTiming(setting, target, index);
        const animation = node.animate(keyframes[setting.preset as keyof typeof keyframes] as unknown as Keyframe[], { ...timing, easing: "cubic-bezier(.22,.75,.25,1)", fill: "both" });
        void animation.finished.then(() => {
          completeWorksMotion(node, animation);
        }).catch(() => undefined);
      });
      if (!setting.triggerOnViewport) { play(); return; }
      if (!("IntersectionObserver" in window)) { nodes.forEach(markWorksMotionRevealed); return; }
      const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { play(); observer.disconnect(); } }, { threshold: 0.15 });
      nodes.forEach((node) => observer.observe(node));
      cleanups.push(() => { observer.disconnect(); });
    });
    return () => {
      cleanups.forEach((cleanup) => cleanup());
      releaseRuntime();
    };
    } catch {
      revealAll();
      return releaseRuntime;
    }
  }, [motion]);
  return null;
}
