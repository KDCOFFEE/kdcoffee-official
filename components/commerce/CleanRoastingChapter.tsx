"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import CleanRoastingMediaStage from "@/components/commerce/CleanRoastingMediaStage";
import {
  getProductAnimationAttributes,
  normalizeAnimationDelay,
  type ProductSectionAnimationConfig,
} from "@/lib/productPageAnimations";
import { CLEAN_ROASTING_LEGACY_CONFIG, type CleanRoastingMediaConfig } from "@/lib/cleanRoastingMedia";

type CleanRoastingProof = {
  title: string;
  text: string;
};

type CleanRoastingChapterProps = {
  proofs: readonly CleanRoastingProof[];
  animation?: ProductSectionAnimationConfig | null;
  mediaConfig?: CleanRoastingMediaConfig;
};

export default function CleanRoastingChapter({ proofs, animation = null, mediaConfig = CLEAN_ROASTING_LEGACY_CONFIG }: CleanRoastingChapterProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [isActivated, setIsActivated] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;

    if (!section) {
      return;
    }

    if (!("IntersectionObserver" in window)) {
      setIsActivated(true);
      return;
    }

    let observer: IntersectionObserver | null = null;

    try {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) {
            return;
          }

          setIsActivated(true);
          observer?.disconnect();
        },
        { rootMargin: "0px", threshold: 0.15 },
      );
      observer.observe(section);
    } catch {
      setIsActivated(true);
    }

    return () => observer?.disconnect();
  }, []);

  const animationAttributes = getProductAnimationAttributes(animation);
  const animationStyle = "style" in animationAttributes ? animationAttributes.style : {};
  const childDelays = animation?.children;

  return (
    <section
      {...animationAttributes}
      id="clean-roasting"
      ref={sectionRef}
      className={`revenue-content-section clean-roasting-section${isActivated ? " is-clean-roasting-active" : ""}`}
      aria-labelledby="clean-roasting-title"
      style={{
        ...animationStyle,
        "--clean-heading-delay": `${normalizeAnimationDelay(childDelays?.heading?.delayMs, 0)}ms`,
        "--clean-media-delay": `${normalizeAnimationDelay(childDelays?.["media-stage"]?.delayMs, 120)}ms`,
        "--clean-proof-1-delay": `${normalizeAnimationDelay(childDelays?.["proof-1"]?.delayMs, 300)}ms`,
        "--clean-proof-2-delay": `${normalizeAnimationDelay(childDelays?.["proof-2"]?.delayMs, 450)}ms`,
        "--clean-proof-3-delay": `${normalizeAnimationDelay(childDelays?.["proof-3"]?.delayMs, 600)}ms`,
      } as CSSProperties}
    >
      <div className="clean-roasting-visual">
        <div className="clean-roasting-intro clean-roasting-reveal-heading">
          <p>CLEAN ROASTING</p>
          <h2 id="clean-roasting-title">乾淨的烘焙</h2>
        </div>
        <CleanRoastingMediaStage config={mediaConfig} eligible={isActivated} />
      </div>
      <div className="clean-roasting-proofs">
        {proofs.map((proof) => (
          <article key={proof.title}>
            <div>
              <h3>{proof.title}</h3>
              <p>{proof.text}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
