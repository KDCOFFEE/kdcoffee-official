"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

import KdMedia from "@/components/media/KdMedia";
import type { WorksHeroOverlayPreset, WorksPageMediaReference } from "@/lib/worksPageCms";

export default function WorksHeroMedia({ desktop, mobile, overlay, motionPending = false, motionClassName = "", motionStyle }: { desktop?: WorksPageMediaReference; mobile?: WorksPageMediaReference; overlay: WorksHeroOverlayPreset; motionPending?: boolean; motionClassName?: string; motionStyle?: CSSProperties }) {
  const [mobileViewport, setMobileViewport] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 700px)");
    const update = () => setMobileViewport(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const selected = mobileViewport ? mobile || desktop : desktop;
  if (!selected) return null;
  return <><div className={`works-hero-media-motion ${motionClassName}`} style={motionStyle} data-works-motion-target="heroMedia" data-works-motion-state={motionPending ? "pre-reveal" : undefined}><KdMedia key={selected.media.url} media={selected.media} alt={selected.alt} className="works-hero-media" backgroundVideo eager /></div><div className={`works-hero-overlay overlay-${overlay}`} aria-hidden="true" /></>;
}
