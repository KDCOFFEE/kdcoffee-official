import "server-only";

import { getHomepageData } from "@/data/homepageData";
import { getLiveWebsiteData } from "@/data/websiteData";

type JsonRecord = Record<string, unknown>;

const PRODUCT_VIDEO_FIELDS = [
  "hero",
  "productPhoto",
  "mainVisual",
  "artworkCover",
] as const;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function addReferencedVideo(owner: unknown, referenced: Set<string>) {
  if (!isRecord(owner) || !isRecord(owner.media)) return;
  const media = owner.media;
  const publicId = typeof media.publicId === "string" ? media.publicId.trim() : "";
  if (
    media.provider === "cloudinary" &&
    media.type === "video" &&
    publicId
  ) {
    referenced.add(publicId);
  }
}

function collectHomepageVideoIds(homepage: JsonRecord, referenced: Set<string>) {
  addReferencedVideo(homepage.hero, referenced);
  recordArray(homepage.campaigns).forEach((item) => addReferencedVideo(item, referenced));

  const collections: Array<[string, string]> = [
    ["home002", "cards"],
    ["home003", "cards"],
    ["home005", "steps"],
    ["home007", "cards"],
    ["home008", "images"],
  ];
  for (const [sectionKey, collectionKey] of collections) {
    const section = homepage[sectionKey];
    if (!isRecord(section)) continue;
    recordArray(section[collectionKey]).forEach((item) => addReferencedVideo(item, referenced));
  }
  addReferencedVideo(homepage.home006, referenced);
}

function collectProductVideoIds(website: JsonRecord, referenced: Set<string>) {
  const menu = isRecord(website.menu) ? website.menu : {};
  for (const product of recordArray(menu.products)) {
    const assets = isRecord(product.assets) ? product.assets : {};
    for (const key of PRODUCT_VIDEO_FIELDS) {
      addReferencedVideo(assets[key], referenced);
    }
  }
}

export async function getReferencedCloudinaryVideoPublicIds() {
  const [homepage, website] = await Promise.all([
    getHomepageData(),
    getLiveWebsiteData(),
  ]);
  const referenced = new Set<string>();
  collectHomepageVideoIds(homepage as unknown as JsonRecord, referenced);
  collectProductVideoIds(website as unknown as JsonRecord, referenced);
  return referenced;
}
