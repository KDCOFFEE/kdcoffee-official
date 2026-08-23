export type CloudinaryMediaReference = {
  sourceType: "homepage" | "product";
  sourceLabel: string;
  section?: string;
  field: string;
  slug?: string;
};

export type CloudinaryVideoUsageSnapshot = {
  referencedPublicIds: Set<string>;
  referencesByPublicId: Map<string, CloudinaryMediaReference[]>;
};

type JsonRecord = Record<string, unknown>;

const PRODUCT_VIDEO_FIELDS = [
  ["hero", "Hero"],
  ["productPhoto", "Product Photo"],
  ["mainVisual", "Main Visual"],
  ["artworkCover", "Artwork Cover"],
] as const;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function cleanLabel(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function addReferencedVideo(
  owner: unknown,
  reference: CloudinaryMediaReference,
  snapshot: CloudinaryVideoUsageSnapshot,
) {
  if (!isRecord(owner) || !isRecord(owner.media)) return;
  const media = owner.media;
  const publicId = typeof media.publicId === "string" ? media.publicId.trim() : "";
  if (
    media.provider !== "cloudinary" ||
    media.type !== "video" ||
    !publicId
  ) return;

  snapshot.referencedPublicIds.add(publicId);
  const references = snapshot.referencesByPublicId.get(publicId) || [];
  references.push(reference);
  snapshot.referencesByPublicId.set(publicId, references);
}

function collectHomepageUsage(
  homepage: JsonRecord,
  snapshot: CloudinaryVideoUsageSnapshot,
) {
  addReferencedVideo(homepage.hero, {
    sourceType: "homepage",
    sourceLabel: "首頁",
    section: "Hero",
    field: "media",
  }, snapshot);

  for (const campaign of recordArray(homepage.campaigns)) {
    addReferencedVideo(campaign, {
      sourceType: "homepage",
      sourceLabel: "首頁",
      section: "Campaign",
      field: "media",
    }, snapshot);
  }

  const collections: Array<[string, string, string]> = [
    ["home002", "cards", "HOME002"],
    ["home003", "cards", "HOME003"],
    ["home005", "steps", "HOME005"],
    ["home007", "cards", "HOME007"],
    ["home008", "images", "HOME008"],
  ];
  for (const [sectionKey, collectionKey, sectionLabel] of collections) {
    const section = homepage[sectionKey];
    if (!isRecord(section)) continue;
    for (const item of recordArray(section[collectionKey])) {
      addReferencedVideo(item, {
        sourceType: "homepage",
        sourceLabel: "首頁",
        section: sectionLabel,
        field: "media",
      }, snapshot);
    }
  }

  addReferencedVideo(homepage.home006, {
    sourceType: "homepage",
    sourceLabel: "首頁",
    section: "HOME006",
    field: "media",
  }, snapshot);
}

function collectProductUsage(
  website: JsonRecord,
  snapshot: CloudinaryVideoUsageSnapshot,
) {
  const menu = isRecord(website.menu) ? website.menu : {};
  for (const product of recordArray(menu.products)) {
    const assets = isRecord(product.assets) ? product.assets : {};
    const sourceLabel = cleanLabel(product.name, "商品（名稱不可用）");
    const slug = cleanLabel(product.slug, "");
    for (const [fieldKey, fieldLabel] of PRODUCT_VIDEO_FIELDS) {
      addReferencedVideo(assets[fieldKey], {
        sourceType: "product",
        sourceLabel,
        field: fieldLabel,
        ...(slug ? { slug } : {}),
      }, snapshot);
    }
    const cleanRoastingMedia = isRecord(product.cleanRoastingMedia) ? product.cleanRoastingMedia : {};
    recordArray(cleanRoastingMedia.items).forEach((item, index) => {
      addReferencedVideo(item, {
        sourceType: "product",
        sourceLabel,
        section: "Clean Roasting",
        field: `Media ${index + 1}`,
        ...(slug ? { slug } : {}),
      }, snapshot);
    });
    recordArray(product.productCustomSections).forEach((section, index) => {
      const mediaPlacement = isRecord(section.media) ? section.media : {};
      const asset = isRecord(mediaPlacement.asset) ? mediaPlacement.asset : null;
      if (!asset) return;
      addReferencedVideo({ media: asset }, {
        sourceType: "product",
        sourceLabel,
        section: cleanLabel(section.adminName, `Custom Section ${index + 1}`),
        field: "Custom Section Media",
        ...(slug ? { slug } : {}),
      }, snapshot);
    });
  }
}

export function collectCloudinaryVideoUsage(
  homepage: unknown,
  website: unknown,
): CloudinaryVideoUsageSnapshot {
  const snapshot: CloudinaryVideoUsageSnapshot = {
    referencedPublicIds: new Set<string>(),
    referencesByPublicId: new Map<string, CloudinaryMediaReference[]>(),
  };
  if (isRecord(homepage)) collectHomepageUsage(homepage, snapshot);
  if (isRecord(website)) collectProductUsage(website, snapshot);
  return snapshot;
}
