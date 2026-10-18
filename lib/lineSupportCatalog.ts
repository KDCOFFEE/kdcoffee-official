import "server-only";
import type { CoffeeArtwork } from "../data/websiteData";
import { promises as fs } from "node:fs";
import { getWebsiteDataFile } from "./storagePaths";
import { isLineBeanAvailable, lineProductId } from "./lineSupportFeatures";
/** Current J6 Product source, read-only. An unavailable catalog never substitutes products. */
export async function readLineSupportCatalog(): Promise<CoffeeArtwork[]> {
  try { const data=JSON.parse(await fs.readFile(getWebsiteDataFile(),"utf8"));return Array.isArray(data?.menu?.products)?data.menu.products:[]; } catch { return []; }
}
export async function readLineSupportProductChoices() {
  return (await readLineSupportCatalog()).filter(product=>product&&typeof product.slug==="string"&&typeof product.name==="string").map(product=>({id:lineProductId(product),name:product.name,available:isLineBeanAvailable(product)}));
}
