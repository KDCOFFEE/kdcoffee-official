import "server-only";

import { getHomepageData } from "@/data/homepageData";
import { getLiveWebsiteData } from "@/data/websiteData";
import { collectCloudinaryVideoUsage } from "@/lib/cloudinaryMediaUsageCore";
export type { CloudinaryMediaReference } from "@/lib/cloudinaryMediaUsageCore";

export async function getCloudinaryVideoUsage() {
  const [homepage, website] = await Promise.all([
    getHomepageData(),
    getLiveWebsiteData(),
  ]);
  return collectCloudinaryVideoUsage(homepage, website);
}

export async function getReferencedCloudinaryVideoPublicIds() {
  return (await getCloudinaryVideoUsage()).referencedPublicIds;
}
