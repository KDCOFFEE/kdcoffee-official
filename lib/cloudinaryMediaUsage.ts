import "server-only";

import { getHomepageData } from "@/data/homepageData";
import { getLiveWebsiteData } from "@/data/websiteData";
import { collectCloudinaryVideoUsage } from "@/lib/cloudinaryMediaUsageCore";
import { createStoreRepository } from "@/lib/storeRepository";
export type { CloudinaryMediaReference } from "@/lib/cloudinaryMediaUsageCore";

export async function getCloudinaryVideoUsage() {
  const [homepage, website, storeCatalog] = await Promise.all([
    getHomepageData(),
    getLiveWebsiteData(),
    // A corrupt/unreadable catalog rejects the entire scan; never substitute empty usage.
    createStoreRepository().read(),
  ]);
  return collectCloudinaryVideoUsage(homepage, website, storeCatalog);
}

export async function getReferencedCloudinaryVideoPublicIds() {
  return (await getCloudinaryVideoUsage()).referencedPublicIds;
}
