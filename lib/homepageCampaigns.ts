import type { HomepageCampaign, HomepageData, CampaignPlacement } from "../data/homepageData";

// Shared unchanged selection rules; no server imports or persistence.
export function campaignIsActive(campaign: HomepageCampaign, now: Date) {
  const start = campaign.startDate
    ? new Date(`${campaign.startDate}T00:00:00`)
    : null;
  const end = campaign.endDate
    ? new Date(`${campaign.endDate}T23:59:59`)
    : null;

  return (
    (!start || now >= start) &&
    (!end || now <= end)
  );
}

export function campaignSupportsPlacement(campaign: HomepageCampaign, placement: CampaignPlacement) {
  return !Array.isArray(campaign.placements) || campaign.placements.includes(placement);
}

export function activeHomepageCampaigns(
  homepageData: HomepageData,
  now = new Date(),
) {
  const items =
    homepageData.campaigns
      .filter((campaign) => campaign.enabled !== false)
      .filter((campaign) => campaignIsActive(campaign, now))
      .filter((campaign) => campaignSupportsPlacement(campaign, "frontend_campaign_section"))
      .sort(
        (a, b) =>
          Number(a.sort || 0) -
          Number(b.sort || 0),
      );

  const limit =
    Number(
      homepageData
        .campaignSection
        .displayLimit || 0,
    );

  return limit > 0
    ? items.slice(0, limit)
    : items;
}
