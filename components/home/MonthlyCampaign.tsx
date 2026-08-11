import Link from "next/link";
import { activeHomepageCampaigns, type HomepageData } from "@/data/homepageData";
import CampaignMedia from "@/components/home/CampaignMedia";

export default function MonthlyCampaign({ homepageData }: { homepageData: HomepageData }) {
  const section = homepageData.campaignSection;
  const campaigns = activeHomepageCampaigns(homepageData);
  if (section.enabled === false || campaigns.length === 0) return null;

  return (
    <section id="monthly-campaign" className="monthly-campaign section-light campaign-multi-section">
      <div className="campaign-section-heading">
        <p className="eyebrow dark">{section.eyebrow}</p>
        <h2>{section.title}</h2>
        <p>{section.intro}</p>
      </div>

      <div className="campaign-multi-grid">
        {campaigns.map((campaign, index) => (
          <article className="campaign-multi-card" key={campaign.id}>
            <div className="campaign-multi-visual">
              <span className="campaign-number">{String(index + 1).padStart(2, "0")}</span>
              <CampaignMedia src={campaign.image} alt={campaign.title} />
              {campaign.note ? <small className="campaign-card-note">{campaign.note}</small> : null}
            </div>
            <div className="campaign-multi-copy">
              <p className="eyebrow dark">{campaign.eyebrow}</p>
              <h3>{campaign.title}</h3>
              <p>{campaign.description}</p>
              {campaign.details?.length ? <ul>{campaign.details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}
              <div className="campaign-actions">
                <Link className="campaign-primary" href={campaign.ctaHref}>{campaign.ctaLabel}<span>↗</span></Link>
                {campaign.secondaryLabel && campaign.secondaryHref ? <Link className="campaign-secondary" href={campaign.secondaryHref}>{campaign.secondaryLabel}</Link> : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
