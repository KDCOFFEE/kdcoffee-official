import type { CSSProperties } from "react";
import { createHomepagePresentationBindings, homepagePresentationProps, mergeHomepageStyles } from "@/lib/homepagePresentationBindings";
import { activeHomepageCampaigns, type HomepageData } from "@/data/homepageData";
import CampaignMedia from "@/components/home/CampaignMedia";
import CmsLink from "@/components/CmsLink";
import { resolveHomepageCta } from "@/lib/homepageCta";
import type { CmsLinkProduct, PublishedCmsPage } from "@/lib/cmsLinks";
import { homepageMotionCssVariables, resolveHomepageMotion } from "@/lib/homepageCms";

export default function MonthlyCampaign({ homepageData, products, pages, order }: { homepageData: HomepageData; products: CmsLinkProduct[]; pages: PublishedCmsPage[]; order?: number }) {
  const section = homepageData.campaignSection;
  const presentation = createHomepagePresentationBindings(homepageData.presentation)("campaignSection");
  const configuredMotion = (section as typeof section & { motion?: unknown }).motion;
  const motion = configuredMotion === undefined ? null : resolveHomepageMotion(configuredMotion, "campaignSection");
  const motionProps = motion ? {
    "data-home-motion": motion.activePreset,
    style: { ...homepageMotionCssVariables(motion), ...(order === undefined ? {} : { order }) } as CSSProperties,
  } : order === undefined ? {} : { style: { order } as CSSProperties };
  const campaigns = activeHomepageCampaigns(homepageData);
  if (section.enabled === false || campaigns.length === 0) return null;

  return (
    <section id="monthly-campaign" className="monthly-campaign section-light campaign-multi-section home-surface-light" {...motionProps} {...homepagePresentationProps(mergeHomepageStyles(motionProps.style, presentation.sectionStyle))}>
      <div className="campaign-section-heading" data-home-reveal="content" data-home-motion-part {...homepagePresentationProps(presentation.contentStyle({ "--home-motion-index": 0 } as CSSProperties))}>
        <p className="eyebrow dark" {...homepagePresentationProps(presentation.textStyle("eyebrow"))}>{section.eyebrow}</p>
        <h2 {...homepagePresentationProps(presentation.textStyle("title"))}>{section.title}</h2>
        <p {...homepagePresentationProps(presentation.textStyle("intro"))}>{section.intro}</p>
      </div>

      <div
        className={`campaign-multi-grid home-mobile-rail ${campaigns.length === 1 ? "is-single" : "is-multiple"}`}
        {...homepagePresentationProps(presentation.contentStyle())}
        data-home-reveal="media"
        tabIndex={campaigns.length > 1 ? 0 : undefined}
        aria-label={campaigns.length > 1 ? "本月活動，可左右滑動瀏覽" : undefined}
      >
        {campaigns.map((campaign, index) => {
          const registry = { products, pages };
          const primaryCta = resolveHomepageCta({ label: campaign.ctaLabel, href: campaign.ctaHref, enabled: campaign.ctaEnabled }, registry);
          const secondaryCta = resolveHomepageCta({ label: campaign.secondaryLabel, href: campaign.secondaryHref, enabled: campaign.secondaryCtaEnabled }, registry);
          return (
          <article className="campaign-multi-card" key={campaign.id} data-home-motion-item style={{ "--home-motion-index": index + 1 } as CSSProperties}>
            <div className="campaign-multi-visual">
              <span className="campaign-number" {...homepagePresentationProps(presentation.textStyle("metadata"))}>{String(index + 1).padStart(2, "0")}</span>
              <CampaignMedia src={campaign.image} media={campaign.media} alt={campaign.title} />
              {campaign.note ? <small className="campaign-card-note" {...homepagePresentationProps(presentation.textStyle("metadata"))}>{campaign.note}</small> : null}
            </div>
            <div className="campaign-multi-copy">
              <p className="eyebrow dark" {...homepagePresentationProps(presentation.textStyle("eyebrow"))}>{campaign.eyebrow}</p>
              <h3 {...homepagePresentationProps(presentation.textStyle("cardTitle"))}>{campaign.title}</h3>
              <p {...homepagePresentationProps(presentation.textStyle("cardBody"))}>{campaign.description}</p>
              {campaign.details?.length ? <ul>{campaign.details.map((detail) => <li key={detail} {...homepagePresentationProps(presentation.textStyle("body"))}>{detail}</li>)}</ul> : null}
              {primaryCta || secondaryCta ? <div className="campaign-actions">
                {primaryCta ? <CmsLink className="campaign-primary" {...homepagePresentationProps(presentation.textStyle("cta"))} value={primaryCta.value} registry={{ products, pages }}>{primaryCta.label}<span>↗</span></CmsLink> : null}
                {secondaryCta ? <CmsLink className="campaign-secondary" {...homepagePresentationProps(presentation.textStyle("cta"))} value={secondaryCta.value} registry={{ products, pages }}>{secondaryCta.label}</CmsLink> : null}
              </div> : null}
            </div>
          </article>
          );
        })}
      </div>
    </section>
  );
}
