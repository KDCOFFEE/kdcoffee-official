"use client";

import { useEffect, useRef, useState } from "react";

type CleanRoastingProof = {
  title: string;
  text: string;
};

type CleanRoastingChapterProps = {
  proofs: readonly CleanRoastingProof[];
};

const CLEAN_ROASTING_VIDEO = "/videos/kdcoffee-clean-roasting-fluid-bed-v01.mp4";

export default function CleanRoastingChapter({ proofs }: CleanRoastingChapterProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
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

  useEffect(() => {
    if (!isActivated || !videoRef.current) {
      return;
    }

    videoRef.current.load();
    void videoRef.current.play().catch(() => {
      // Muted autoplay can still be declined by browser or user policy.
    });
  }, [isActivated]);

  return (
    <section
      ref={sectionRef}
      className={`revenue-content-section clean-roasting-section${isActivated ? " is-clean-roasting-active" : ""}`}
      aria-labelledby="clean-roasting-title"
    >
      <div className="clean-roasting-visual">
        <div className="clean-roasting-intro clean-roasting-reveal-heading">
          <p>CLEAN ROASTING</p>
          <h2 id="clean-roasting-title">乾淨的烘焙</h2>
        </div>
        <figure className="clean-roasting-video-frame clean-roasting-reveal-video">
          <video
            ref={videoRef}
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            aria-label="KD Coffee 流床式熱風烘焙實拍影片"
          >
            {isActivated ? <source src={CLEAN_ROASTING_VIDEO} type="video/mp4" /> : null}
          </video>
          <span className="clean-roasting-video-overlay" aria-hidden="true" />
        </figure>
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
