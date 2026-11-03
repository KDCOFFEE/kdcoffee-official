"use client";

import { useEffect, useRef } from "react";
import type { MediaAsset } from "@/lib/media";

/** Decorative header playback; the existing poster also covers blocked autoplay. */
export default function MonthlyMenuVideo({ media, fit, position }: {
  media: MediaAsset;
  fit: "cover" | "contain";
  position: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    function update() {
      if (!element) return;
      if (preference.matches) {
        element.pause();
        element.removeAttribute("src");
        element.load();
      } else {
        element.src = media.url;
        element.muted = true;
        void element.play().catch(() => undefined);
      }
    }
    update();
    preference.addEventListener("change", update);
    return () => { preference.removeEventListener("change", update); element.pause(); };
  }, [media.url]);

  return <video ref={video} poster={media.posterUrl} muted loop playsInline preload="none"
    aria-hidden="true" disablePictureInPicture
    style={{ width: "100%", height: "100%", position: "absolute", inset: 0, objectFit: fit, objectPosition: position }}
    onError={() => { const element = video.current; if (element?.hasAttribute("src")) { element.removeAttribute("src"); element.load(); } }} />;
}
