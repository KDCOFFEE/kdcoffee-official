import "server-only";

import { verifyCloudinaryVideo } from "@/lib/cloudinary";
import {
  isMediaAsset,
  localImageMedia,
  type CloudinaryMediaUsage,
} from "@/lib/media";
import { normalizeYouTubeVideoId, parseYouTubeUrl, youtubeWatchUrl } from "@/lib/youtubeMedia";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSafeLocalHomepageImage(url: string) {
  return (
    url.startsWith("/") &&
    !url.startsWith("//") &&
    !url.includes("..") &&
    (url.startsWith("/images/") || url.startsWith("/uploads/"))
  );
}

async function verifyOwnerMedia(
  owner: JsonRecord,
  legacyImageField: "image" | "poster",
  usage: CloudinaryMediaUsage,
) {
  const candidate = owner.media;
  if (candidate === undefined || candidate === null) {
    delete owner.media;
    return;
  }
  if (!isMediaAsset(candidate)) {
    throw new Error("首頁媒體資料格式不正確。");
  }

  if (candidate.type === "youtube") {
    try {
      const videoId = candidate.videoId
        ? normalizeYouTubeVideoId(candidate.videoId)
        : parseYouTubeUrl(candidate.url);
      owner.media = {
        type: "youtube",
        videoId,
        url: youtubeWatchUrl(videoId),
      };
      return;
    } catch {
      throw new Error("YouTube 影片網址無效，請重新貼上完整網址。");
    }
  }

  if (candidate.type === "image") {
    const legacyImage =
      typeof owner[legacyImageField] === "string"
        ? owner[legacyImageField].trim()
        : "";
    if (
      candidate.provider === "cloudinary" ||
      !legacyImage ||
      candidate.url !== legacyImage ||
      !isSafeLocalHomepageImage(candidate.url)
    ) {
      throw new Error("首頁圖片媒體必須使用既有圖片上傳結果。");
    }
    owner.media = localImageMedia(legacyImage);
    return;
  }

  if (
    candidate.provider !== "cloudinary" ||
    typeof candidate.publicId !== "string" ||
    !candidate.publicId
  ) {
    throw new Error("首頁影片缺少已驗證的 Cloudinary 資料。");
  }
  try {
    owner.media = await verifyCloudinaryVideo(candidate.publicId, usage);
  } catch {
    throw new Error("首頁影片驗證失敗，請重新上傳或稍後再試。");
  }
}

function recordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export async function verifyHomepageMedia(homepage: JsonRecord) {
  const checks: Promise<void>[] = [];
  const allowedOwners = new Set<JsonRecord>();
  const addOwner = (owner: JsonRecord, legacyImageField: "image" | "poster", usage: CloudinaryMediaUsage) => {
    allowedOwners.add(owner);
    checks.push(verifyOwnerMedia(owner, legacyImageField, usage));
    for (const mediaItem of recordArray(owner.mediaItems)) {
      allowedOwners.add(mediaItem);
      checks.push(verifyOwnerMedia(mediaItem, "image", usage));
    }
  };
  const hero = isRecord(homepage.hero) ? homepage.hero : null;
  if (hero) {
    addOwner(hero, "poster", "hero");
  }

  for (const campaign of recordArray(homepage.campaigns)) {
    addOwner(campaign, "image", "content");
  }

  const collectionFields: Array<[string, string]> = [
    ["home002", "cards"],
    ["home003", "cards"],
    ["home005", "steps"],
    ["home007", "cards"],
    ["home008", "images"],
    ["home008", "mediaItems"],
  ];
  for (const [sectionKey, collectionKey] of collectionFields) {
    const section = homepage[sectionKey];
    if (!isRecord(section)) continue;
    for (const item of recordArray(section[collectionKey])) {
      addOwner(item, "image", "content");
    }
  }

  const home006 = homepage.home006;
  if (isRecord(home006)) {
    addOwner(home006, "image", "content");
  }

  const rejectUnexpectedMedia = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(rejectUnexpectedMedia);
      return;
    }
    if (!isRecord(value)) return;
    if ("media" in value && !allowedOwners.has(value)) {
      throw new Error("此首頁區塊不支援影片媒體。");
    }
    Object.values(value).forEach(rejectUnexpectedMedia);
  };
  rejectUnexpectedMedia(homepage);

  await Promise.all(checks);
}
