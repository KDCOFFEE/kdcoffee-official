export const PRODUCT_MEDIA_PURPOSES = [
  "clean-roasting",
  "hero",
  "campaign",
  "gallery",
] as const;

export type ProductMediaPurpose = (typeof PRODUCT_MEDIA_PURPOSES)[number];

const PRODUCT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_PRODUCT_SLUG_LENGTH = 80;
const MAX_MEDIA_SEQUENCE = 99;

export function isCanonicalProductSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_PRODUCT_SLUG_LENGTH &&
    PRODUCT_SLUG_PATTERN.test(value)
  );
}

export function isProductMediaPurpose(value: unknown): value is ProductMediaPurpose {
  return (PRODUCT_MEDIA_PURPOSES as readonly unknown[]).includes(value);
}

export function buildProductMediaPublicId({
  productSlug,
  mediaPurpose,
  sequence,
}: {
  productSlug: string;
  mediaPurpose: ProductMediaPurpose;
  sequence: number;
}) {
  if (!isCanonicalProductSlug(productSlug)) {
    throw new Error("Product media naming requires a canonical product slug");
  }
  if (!isProductMediaPurpose(mediaPurpose)) {
    throw new Error("Product media purpose is invalid");
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_MEDIA_SEQUENCE) {
    throw new Error("Product media sequence is unavailable");
  }
  return `kdcoffee-${productSlug}-${mediaPurpose}-${String(sequence).padStart(2, "0")}`;
}

export function productMediaPublicIdPrefix({
  productSlug,
  mediaPurpose,
}: {
  productSlug: string;
  mediaPurpose: ProductMediaPurpose;
}) {
  return `${buildProductMediaPublicId({ productSlug, mediaPurpose, sequence: 1 }).slice(0, -2)}`;
}

export function extractProductMediaSequence({
  publicId,
  productSlug,
  mediaPurpose,
}: {
  publicId: string;
  productSlug: string;
  mediaPurpose: ProductMediaPurpose;
}) {
  const fileName = publicId.slice(publicId.lastIndexOf("/") + 1);
  const prefix = productMediaPublicIdPrefix({ productSlug, mediaPurpose });
  if (!fileName.startsWith(prefix)) return undefined;
  const suffix = fileName.slice(prefix.length);
  if (!/^\d{2}$/.test(suffix)) return undefined;
  const sequence = Number(suffix);
  return sequence >= 1 && sequence <= MAX_MEDIA_SEQUENCE ? sequence : undefined;
}

export function nextAvailableProductMediaSequence({
  productSlug,
  mediaPurpose,
  existingPublicIds,
}: {
  productSlug: string;
  mediaPurpose: ProductMediaPurpose;
  existingPublicIds: Iterable<string>;
}) {
  const used = new Set<number>();
  for (const publicId of existingPublicIds) {
    const sequence = extractProductMediaSequence({ publicId, productSlug, mediaPurpose });
    if (sequence !== undefined) used.add(sequence);
  }
  for (let sequence = 1; sequence <= MAX_MEDIA_SEQUENCE; sequence += 1) {
    if (!used.has(sequence)) return sequence;
  }
  throw new Error("No product media sequence is available");
}

export function isProductMediaPublicId({
  publicId,
  mediaPurpose,
}: {
  publicId: string;
  mediaPurpose: ProductMediaPurpose;
}) {
  const fileName = publicId.slice(publicId.lastIndexOf("/") + 1);
  const suffix = `-${mediaPurpose}-`;
  if (!fileName.startsWith("kdcoffee-") || !fileName.includes(suffix)) return false;
  const sequenceText = fileName.slice(fileName.lastIndexOf(suffix) + suffix.length);
  const productSlug = fileName.slice("kdcoffee-".length, fileName.lastIndexOf(suffix));
  if (!isCanonicalProductSlug(productSlug) || !/^\d{2}$/.test(sequenceText)) return false;
  const sequence = Number(sequenceText);
  return sequence >= 1 && sequence <= MAX_MEDIA_SEQUENCE;
}
