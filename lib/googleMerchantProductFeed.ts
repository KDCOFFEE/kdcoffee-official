import { createHash } from "node:crypto";
import { getCanonicalPublicSiteOrigin } from "./publicSiteOrigin";

export type MerchantProduct = {
  id: string;
  title: string;
  description: string;
  link: string;
  images: readonly string[];
  approvedImageSha256?: string;
  availability: "in_stock" | "out_of_stock";
  priceTwd: number;
};

export type MerchantExclusion = { item: string; reason: string };

const header = "id\ttitle\tdescription\tlink\timage_link\tavailability\tprice\tcondition\n";
const MAX_FEED_BYTES = 2_000_000;
export const MAX_MERCHANT_PRODUCTS = 5_000;
const safeId = /^[A-Za-z0-9_-]{1,50}$/u;

export function merchantProductId(domain: "coffee" | "store", productId: string, skuId: string): string {
  const legacy = `kd-coffee-${productId}-${skuId}`;
  if (domain === "coffee" && safeId.test(legacy)) return legacy;
  // Store identity follows the persisted product ID even if the merchant-facing SKU changes.
  const key = domain === "coffee" ? [domain, productId, skuId] : [domain, productId];
  return `kd-${domain}-${createHash("sha256").update(JSON.stringify(key)).digest("hex").slice(0, 40)}`;
}

function field(value: string, limit: number): string {
  const clean = value.replace(/[\s\u0000-\u001f\u007f]+/gu, " ").trim();
  return Array.from(clean).slice(0, limit).join("");
}

export async function buildMerchantProductFeed(
  candidates: readonly MerchantProduct[],
  verifyImage: (url: string, approvedSha256?: string) => Promise<string | null>,
  exclusions: MerchantExclusion[],
): Promise<{ tsv: string; rows: number }> {
  if (candidates.length + exclusions.length > MAX_MERCHANT_PRODUCTS) throw new Error("merchant_product_limit");
  const ids = new Map<string, number>();
  for (const candidate of candidates) ids.set(candidate.id, (ids.get(candidate.id) ?? 0) + 1);
  const seenImages = new Map<string, string | null>();
  const lines: string[] = [];
  let bytes = Buffer.byteLength(header);
  for (const product of candidates) {
    const title = field(product.title, 150);
    const description = field(product.description, 5_000);
    if (ids.get(product.id) !== 1 || !safeId.test(product.id)) {
      exclusions.push({ item: product.id, reason: "invalid_or_duplicate_feed_id" });
      continue;
    }
    if (!title || !description || !Number.isSafeInteger(product.priceTwd) || product.priceTwd <= 0 ||
        !product.link.startsWith(getCanonicalPublicSiteOrigin() + "/") || product.link.length > 2_000) {
      exclusions.push({ item: product.id, reason: "invalid_merchant_fields" });
      continue;
    }
    let image: string | null = null;
    for (const url of product.images) {
      const key = JSON.stringify([url, product.approvedImageSha256]);
      if (!seenImages.has(key)) seenImages.set(key, await verifyImage(url, product.approvedImageSha256));
      image = seenImages.get(key) ?? null;
      if (image) break;
    }
    if (!image) {
      exclusions.push({ item: product.id, reason: "missing_or_invalid_image" });
      continue;
    }
    const line = [product.id, title, description, product.link, image, product.availability, `${product.priceTwd} TWD`, "new"].join("\t") + "\n";
    bytes += Buffer.byteLength(line);
    if (bytes > MAX_FEED_BYTES) throw new Error("merchant_tsv_limit");
    lines.push(line);
  }
  // Verified empty catalogs (or catalogs without eligible rows) publish a header-only snapshot.
  return { tsv: header + lines.join(""), rows: lines.length };
}
