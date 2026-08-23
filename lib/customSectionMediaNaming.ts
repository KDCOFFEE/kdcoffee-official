import { isCanonicalProductSlug } from "./productMediaNaming";

export const CUSTOM_SECTION_MEDIA_PURPOSE = "custom-section" as const;
export const CUSTOM_SECTION_MEDIA_TYPES = ["image", "video"] as const;
export type CustomSectionMediaType = (typeof CUSTOM_SECTION_MEDIA_TYPES)[number];

const SECTION_ID_PATTERN = /^cs-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_SEQUENCE = 99;

export function isCustomSectionStableId(value: unknown): value is string {
  return typeof value === "string" && SECTION_ID_PATTERN.test(value);
}

export function isCustomSectionMediaType(value: unknown): value is CustomSectionMediaType {
  return value === "image" || value === "video";
}

export function customSectionMediaToken(sectionId: string) {
  if (!isCustomSectionStableId(sectionId)) throw new Error("Custom Section media requires a stable Section ID");
  const compact = sectionId.slice(3).replaceAll("-", "");
  return `${compact.slice(0, 8)}${compact.slice(-8)}`;
}

export function buildCustomSectionMediaPublicId({
  productSlug,
  sectionId,
  mediaType,
  sequence,
}: {
  productSlug: string;
  sectionId: string;
  mediaType: CustomSectionMediaType;
  sequence: number;
}) {
  if (!isCanonicalProductSlug(productSlug)) throw new Error("Custom Section media requires a canonical product slug");
  if (!isCustomSectionMediaType(mediaType)) throw new Error("Custom Section media type is invalid");
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_SEQUENCE) throw new Error("Custom Section media sequence is unavailable");
  return `kdcoffee-${productSlug}-custom-section-${customSectionMediaToken(sectionId)}-${mediaType}-${String(sequence).padStart(2, "0")}`;
}

export function customSectionMediaPublicIdPrefix(input: Omit<Parameters<typeof buildCustomSectionMediaPublicId>[0], "sequence">) {
  return buildCustomSectionMediaPublicId({ ...input, sequence: 1 }).slice(0, -2);
}

export function extractCustomSectionMediaSequence({
  publicId,
  ...input
}: Omit<Parameters<typeof buildCustomSectionMediaPublicId>[0], "sequence"> & { publicId: string }) {
  const fileName = publicId.slice(publicId.lastIndexOf("/") + 1);
  const prefix = customSectionMediaPublicIdPrefix(input);
  if (!fileName.startsWith(prefix)) return undefined;
  const suffix = fileName.slice(prefix.length);
  if (!/^\d{2}$/.test(suffix)) return undefined;
  const sequence = Number(suffix);
  return sequence >= 1 && sequence <= MAX_SEQUENCE ? sequence : undefined;
}

export function nextAvailableCustomSectionMediaSequence({
  existingPublicIds,
  ...input
}: Omit<Parameters<typeof buildCustomSectionMediaPublicId>[0], "sequence"> & { existingPublicIds: Iterable<string> }) {
  const used = new Set<number>();
  for (const publicId of existingPublicIds) {
    const sequence = extractCustomSectionMediaSequence({ ...input, publicId });
    if (sequence !== undefined) used.add(sequence);
  }
  for (let sequence = 1; sequence <= MAX_SEQUENCE; sequence += 1) {
    if (!used.has(sequence)) return sequence;
  }
  throw new Error("No Custom Section media sequence is available");
}

export function isCustomSectionMediaPublicId({
  publicId,
  productSlug,
  sectionId,
  mediaType,
}: Omit<Parameters<typeof buildCustomSectionMediaPublicId>[0], "sequence"> & { publicId: string }) {
  return extractCustomSectionMediaSequence({ publicId, productSlug, sectionId, mediaType }) !== undefined;
}

export function isAnyCustomSectionMediaPublicId({
  publicId,
  sectionId,
  mediaType,
}: {
  publicId: string;
  sectionId: string;
  mediaType: CustomSectionMediaType;
}) {
  if (!isCustomSectionStableId(sectionId) || !isCustomSectionMediaType(mediaType)) return false;
  const fileName = publicId.slice(publicId.lastIndexOf("/") + 1);
  const suffix = `-custom-section-${customSectionMediaToken(sectionId)}-${mediaType}-`;
  if (!fileName.startsWith("kdcoffee-") || !fileName.includes(suffix)) return false;
  const productSlug = fileName.slice("kdcoffee-".length, fileName.lastIndexOf(suffix));
  const sequence = fileName.slice(fileName.lastIndexOf(suffix) + suffix.length);
  return isCanonicalProductSlug(productSlug) && /^\d{2}$/.test(sequence) && Number(sequence) >= 1 && Number(sequence) <= MAX_SEQUENCE;
}

export function filterCustomSectionMediaReservedPublicIds({
  publicIds,
  productSlug,
  sectionId,
  mediaType,
}: {
  publicIds: readonly string[];
  productSlug: string;
  sectionId: string;
  mediaType: CustomSectionMediaType;
}) {
  return publicIds.filter((publicId) => isCustomSectionMediaPublicId({
    publicId,
    productSlug,
    sectionId,
    mediaType,
  }));
}
