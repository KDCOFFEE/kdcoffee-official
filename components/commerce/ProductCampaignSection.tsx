"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import CampaignMedia from "@/components/home/CampaignMedia";
import type { HomepageCampaign } from "@/data/homepageData";
import { getProductAnimationAttributes, type ProductSectionAnimationConfig } from "@/lib/productPageAnimations";

export default function ProductCampaignSection({ campaigns, animation = null }: { campaigns: HomepageCampaign[]; animation?: ProductSectionAnimationConfig | null }) {
  const presentationRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const presentation = presentationRef.current;
    presentation?.classList.add("is-product-campaign-enhanced");
    return () => presentation?.classList.remove("is-product-campaign-enhanced");
  }, []);

  if (!campaigns.length) return null;
  const currentIndex = Math.min(activeIndex, campaigns.length - 1);

  return (
    <section {...getProductAnimationAttributes(animation)} id="campaigns" className="revenue-content-section product-campaign-section" aria-labelledby="product-campaign-title">
      <div className="revenue-section-title">
        <p>LATEST ACTIVITY</p>
        <h2 id="product-campaign-title">最新活動</h2>
      </div>
      <div className="product-campaign-presentation" ref={presentationRef}>
        <div className="product-campaign-stack">
          {campaigns.map((campaign, index) => (
            <article className={`product-campaign-card${index === currentIndex ? " is-active" : ""}`} key={campaign.id}>
              <div className="product-campaign-visual">
                <CampaignMedia src={campaign.image} media={campaign.media} alt={campaign.title} />
                <span>{String(index + 1).padStart(2, "0")}</span>
              </div>
              <div className="product-campaign-copy">
                <p>{campaign.eyebrow}</p>
                <h3>{campaign.title}</h3>
                <div>{campaign.description}</div>
                {campaign.details?.length ? <ul>{campaign.details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}
                {campaign.ctaHref && campaign.ctaLabel ? <Link href={campaign.ctaHref}>{campaign.ctaLabel}<span>↗</span></Link> : null}
              </div>
            </article>
          ))}
        </div>
        {campaigns.length > 1 ? (
          <div className="product-campaign-controls" aria-label="切換最新活動">
            {campaigns.map((campaign, index) => (
              <button type="button" key={campaign.id} aria-pressed={index === currentIndex} onClick={() => setActiveIndex(index)}>
                <span>{String(index + 1).padStart(2, "0")}</span>{campaign.title}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
