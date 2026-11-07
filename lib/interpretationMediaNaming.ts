import "server-only";
import fs from "node:fs/promises";
import { isCanonicalProductSlug } from "@/lib/productMediaNaming";
import { getWebsiteDataFile } from "@/lib/storagePaths";

export async function isStoredInterpretationWork(slug: unknown): Promise<boolean> {
  if (!isCanonicalProductSlug(slug)) return false;
  const data = JSON.parse(await fs.readFile(getWebsiteDataFile(), "utf8")) as {
    menu?: { products?: Array<{ slug?: string } | null> };
  };
  return Array.isArray(data.menu?.products) && data.menu.products.some(work => work?.slug === slug);
}
