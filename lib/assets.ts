import { promises as fs } from "fs";
import path from "path";

export type AssetRecord = {
  id: string;
  category: string;
  name: string;
  usage: string;
  path: string;
  recommendedSize: string;
  displaySize: string;
  format: string;
  alt: string;
  seoStem: string;
  status: "active" | "missing" | "draft";
  originalFileName?: string;
  updatedAt?: string;
};

export type AssetLibrary = {
  version: number;
  updatedAt: string;
  assets: AssetRecord[];
};

const assetPath = path.join(process.cwd(), "public", "data", "assets.json");

export async function getAssetLibrary(): Promise<AssetLibrary> {
  return JSON.parse(await fs.readFile(assetPath, "utf8")) as AssetLibrary;
}

export async function saveAssetLibrary(library: AssetLibrary) {
  library.version = Number(library.version || 0) + 1;
  library.updatedAt = new Date().toISOString();
  await fs.writeFile(assetPath, `${JSON.stringify(library, null, 2)}\n`, "utf8");
}

export async function getAsset(id: string) {
  const library = await getAssetLibrary();
  return library.assets.find((asset) => asset.id === id) || null;
}
