import type { CSSProperties } from "react";
import { activeHomepageCampaigns, type HomepageData } from "@/data/homepageData";
import CampaignMedia from "@/components/home/CampaignMedia";
import CmsLink from "@/components/CmsLink";
import type { CmsLinkProduct, PublishedCmsPage } from "@/lib/cmsLinks";
import { homepageMotionCssVariables, resolveHomepageMotion } from "@/lib/homepageCms";

export default function MonthlyCampaign({ homepageData, products, pages, order }: { homepageData: HomepageData; products: CmsLinkProduct[]; pages: PublishedCmsPage[]; order?: number }) {
  const section = homepageData.campaignSection;
  const configuredMotion = (section as typeof section & { motion?: unknown }).motion;
  const motion = configuredMotion === undefined ? null : resolveHomepageMotion(configuredMotion, "campaignSection");
  const motionProps = motion ? {
    "data-home-motion": motion.activePreset,
    style: { ...homepageMotionCssVariables(motion), ...(order === undefined ? {} : { order }) } as CSSProperties,
  } : order === undefined ? {} : { style: { order } as CSSProperties };
  const campaigns = activeHomepageCampaigns(homepageData);
  if (section.enabled === false || campaigns.length === 0) return null;

  return (
    <section id="monthly-campaign" className="monthly-campaign section-light campaign-multi-section home-surface-light" {...motionProps}>
      <div className="campaign-section-heading" data-home-reveal="content" data-home-motion-part style={{ "--home-motion-index": 0 } as CSSProperties}>
        <p className="eyebrow dark">{section.eyebrow}</p>
        <h2>{section.title}</h2>
        <p>{section.intro}</p>
      </div>

      <div
        className={`campaign-multi-grid home-mobile-rail ${campaigns.length === 1 ? "is-single" : "is-multiple"}`}
        data-home-reveal="media"
        tabIndex={campaigns.length > 1 ? 0 : undefined}
        aria-label={campaigns.length > 1 ? "本月活動，可左右滑動瀏覽" : undefined}
      >
        {campaigns.map((campaign, index) => (
          <article className="campaign-multi-card" key={campaign.id} data-home-motion-item style={{ "--home-motion-index": index + 1 } as CSSProperties}>
            <div className="campaign-multi-visual">
              <span className="campaign-number">{String(index + 1).padStart(2, "0")}</span>
              <CampaignMedia src={campaign.image} media={campaign.media} alt={campaign.title} />
              {campaign.note ? <small className="campaign-card-note">{campaign.note}</small> : null}
            </div>
            <div className="campaign-multi-copy">
              <p className="eyebrow dark">{campaign.eyebrow}</p>
              <h3>{campaign.title}</h3>
              <p>{campaign.description}</p>
              {campaign.details?.length ? <ul>{campaign.details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}
              <div className="campaign-actions">
                {campaign.ctaEnabled !== false ? <CmsLink className="campaign-primary" value={campaign.ctaHref} registry={{ products, pages }}>{campaign.ctaLabel}<span>↗</span></CmsLink> : null}
                {campaign.secondaryCtaEnabled !== false && campaign.secondaryLabel && campaign.secondaryHref ? <CmsLink className="campaign-secondary" value={campaign.secondaryHref} registry={{ products, pages }}>{campaign.secondaryLabel}</CmsLink> : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
