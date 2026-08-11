import { promises as fs } from "fs";
import path from "path";

export type HeroSettings = {
  enabled?: boolean;
  eyebrow: string;
  titleLines: string[];
  lead: string;
  buttonLabel: string;
  buttonHref: string;
  poster: string;
  videoWebm: string;
  videoMp4: string;
  location: string;
  method: string;
  monthNumber: string;
  monthLabel: string;
};

export type HomepageCampaign = {
  id: string;
  enabled?: boolean;
  sort?: number;
  eyebrow: string;
  title: string;
  description: string;
  details: string[];
  ctaLabel: string;
  ctaHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  note?: string;
  image?: string;
  startDate?: string;
  endDate?: string;
};

export type HomepageData = {
  version: number;
  updatedAt: string;
  hero: HeroSettings;
  campaignSection: {
    enabled?: boolean;
    eyebrow: string;
    title: string;
    intro: string;
    displayLimit?: number;
  };
  campaigns: HomepageCampaign[];
  sectionMedia: {
    whyKdImage?: string;
    contactImage?: string;
    footerBackground?: string;
  };
};

const homepagePath = path.join(process.cwd(), "public", "data", "homepage.json");

export async function getHomepageData(): Promise<HomepageData> {
  return JSON.parse(await fs.readFile(homepagePath, "utf8")) as HomepageData;
}

export function activeHomepageCampaigns(homepageData: HomepageData, now = new Date()) {
  const items = homepageData.campaigns
    .filter((campaign) => campaign.enabled !== false)
    .filter((campaign) => {
      const start = campaign.startDate ? new Date(`${campaign.startDate}T00:00:00`) : null;
      const end = campaign.endDate ? new Date(`${campaign.endDate}T23:59:59`) : null;
      return (!start || now >= start) && (!end || now <= end);
    })
    .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0));
  const limit = Number(homepageData.campaignSection.displayLimit || 0);
  return limit > 0 ? items.slice(0, limit) : items;
}
