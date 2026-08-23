import "server-only";

import { verifyCloudinaryCustomSectionMedia } from "./cloudinary";
import { isCustomSectionMediaPublicId } from "./customSectionMediaNaming";
import { isCanonicalProductSlug } from "./productMediaNaming";
import { normalizeProductCustomSections } from "./productCustomSectionsValidation";

type JsonRecord = Record<string, unknown>;

export class ProductCustomSectionMediaVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductCustomSectionMediaVerificationError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function verifiedSections(productSlug: string, value: unknown) {
  if (!isCanonicalProductSlug(productSlug)) {
    throw new ProductCustomSectionMediaVerificationError("自訂 Section 媒體需要有效的商品 slug。");
  }
  const sections = normalizeProductCustomSections(value);
  for (const section of sections) {
    if (!section.media || section.media.provider === "youtube") continue;
    const { asset } = section.media;
    if (
      !asset.publicId ||
      !isCustomSectionMediaPublicId({
        publicId: asset.publicId,
        productSlug,
        sectionId: section.id,
        mediaType: asset.type,
      })
    ) {
      throw new ProductCustomSectionMediaVerificationError("自訂 Section 媒體與商品或 Section 識別資料不符。");
    }
    try {
      section.media.asset = await verifyCloudinaryCustomSectionMedia(asset.publicId, asset.type);
    } catch {
      throw new ProductCustomSectionMediaVerificationError("自訂 Section 媒體驗證失敗，請重新上傳或稍後再試。");
    }
  }
  return sections;
}

export async function verifyProductCustomSectionMediaChanges(
  currentProducts: JsonRecord[],
  requestedChanges: unknown,
) {
  if (!Array.isArray(requestedChanges)) return requestedChanges;
  const changes = structuredClone(requestedChanges) as unknown[];
  for (const change of changes) {
    if (!isRecord(change)) continue;
    if (change.operation === "updateProduct" && Array.isArray(change.fields)) {
      const identity = String(change.id || change.slug || "").trim();
      const product = currentProducts.find((candidate) => String(candidate.id || candidate.slug || "").trim() === identity);
      const productSlug = String(product?.slug || change.slug || "").trim();
      for (const field of change.fields) {
        if (isRecord(field) && field.field === "productCustomSections" && field.nextValue !== undefined) {
          field.nextValue = await verifiedSections(productSlug, field.nextValue);
        }
      }
    }
    if (change.operation === "addProduct" && isRecord(change.product) && change.product.productCustomSections !== undefined) {
      const productSlug = String(change.product.slug || "").trim();
      change.product.productCustomSections = await verifiedSections(productSlug, change.product.productCustomSections);
    }
  }
  return changes;
}
