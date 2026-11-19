/** G.5F.3 read-only bridge: turn actual public selector evidence into candidate
 * Merchant records without treating a photo suggestion as approval or guessing
 * whether a deep link selects the advertised price. No HTTP route or writes. */
import { createHash } from 'node:crypto';
import { buildGoogleMerchantCoffeeFeedDraft, isUnpurchasableMerchantPreview } from './googleMerchantCoffeeFeedCore';
import type { MerchantFeedDraft } from './googleMerchantCoffeeFeedCore';
import { inspectGoogleMerchantLiveEvidence } from './googleMerchantCoffeeLiveEvidence';
import type { EvidenceProduct, EvidenceSku, ImageSuggestion } from './googleMerchantCoffeeLiveEvidence';

export type ExplicitSkuAttestation = Readonly<{
  productId: string; skuId: string;
  approvedPriceTwd: number;
  approvedOfferSha256: string;
  /** Owner-verified photo of the actual item, not an artwork illustration. */
  approvedProductImageUrl: string;
  approvedProductImageSha256: string;
  /** Product landing URL has been verified to select exactly this SKU. */
  landingSkuSelected: boolean;
  /** Customer-facing purchase amount matches persisted SKU price. */
  checkoutPriceVerified: boolean;
}>;
export type ReconciledCoffeeFeed = Readonly<{
  protocol: 'KD_GOOGLE_FEED_RECONCILIATION_V1';
  publicationAuthorized: false;
  source: 'single_live_works_snapshot';
  visibleProductCount: number;
  visibleSelectorSkuCount: number;
  excludedDisabledSkuCount: number;
  warnings: readonly string[];
  draft: MerchantFeedDraft;
}>;
const keyOf = (p:string,s:string) => `${p}::${s}`;

/** Versioned checkout/landing evidence. Inventory and availability may change independently. */
export function merchantCoffeeOfferSha256(product: EvidenceProduct, sku: EvidenceSku): string | null {
  if (typeof sku.detail !== 'string') return null;
  return createHash('sha256').update(JSON.stringify([
    'KD_MERCHANT_COFFEE_OFFER_V1',
    product.id, product.slug, product.name, product.origin, product.process, product.roast,
    product.variety, product.altitude, sku.id, sku.label, sku.detail, sku.kind, sku.price,
  ])).digest('hex');
}

export function reconcileLiveCoffeeToMerchantFeed(
  visibleProducts: readonly EvidenceProduct[],
  findPhoto: (product: EvidenceProduct) => ImageSuggestion | null,
  attestations: readonly ExplicitSkuAttestation[] = [],
): ReconciledCoffeeFeed {
  const products = visibleProducts.filter(product => !isUnpurchasableMerchantPreview(product));
  const audit = inspectGoogleMerchantLiveEvidence(products, findPhoto);
  const warnings: string[] = [];
  const seen = new Set<string>();
  const approvalImages: Record<string,string> = Object.create(null);
  const checkoutVerified: string[] = [];
  const eligibleKeys = new Set(audit.lines.filter(line => line.visibleInPurchaseSelector)
    .map(line => keyOf(line.productId,line.skuId)));
  const sourceByKey = new Map(audit.lines.map(line => [keyOf(line.productId,line.skuId),line]));
  const offers = new Map(products.flatMap(product => Array.isArray(product.skus)
    ? product.skus.map((sku: EvidenceSku) => [keyOf(product.id ?? '', sku.id ?? ''), merchantCoffeeOfferSha256(product, sku)] as const)
    : []));
  for (const approval of attestations) {
    const k = keyOf(approval.productId,approval.skuId);
    if (seen.has(k)) { warnings.push('duplicate_attestation'); continue; }
    seen.add(k);
    const line = sourceByKey.get(k);
    if (!eligibleKeys.has(k) || !line || line.source !== 'skus' ||
        line.blockers.some(reason => !['approved_product_photo_missing',
          'sku_image_approval_required','checkout_transaction_verification_required'].includes(reason))) {
      warnings.push('attestation_for_unverified_sku'); continue;
    }
    if (!line.suggestedProductImageUrl || approval.approvedProductImageUrl !== line.suggestedProductImageUrl) {
      warnings.push('approved_image_mismatch'); continue;
    }
    if (!line.suggestedProductImageSha256 ||
        approval.approvedProductImageSha256 !== line.suggestedProductImageSha256) {
      warnings.push('approved_image_evidence_changed_or_unavailable'); continue;
    }
    if (!approval.landingSkuSelected || !approval.checkoutPriceVerified) {
      warnings.push('landing_or_price_unverified'); continue;
    }
    if (approval.approvedPriceTwd !== line.priceTwd || !approval.approvedOfferSha256 ||
        approval.approvedOfferSha256 !== offers.get(k)) {
      warnings.push('approved_price_or_specification_changed'); continue;
    }
    approvalImages[k] = approval.approvedProductImageUrl;
    checkoutVerified.push(k);
  }
  // Disabled SKUs aren't in the public selector; never export them as offers.
  // Do not fabricate coffee beans and ground coffee as distinct persisted SKUs.
  const candidateDraft = buildGoogleMerchantCoffeeFeedDraft(products,
    { approvedImageUrlsBySku: approvalImages, checkoutVerifiedSkuIds: checkoutVerified }, true);
  // Reject contradictory attestations or cross-product SKU identity collisions.
  // We never silently publish a subset of an ambiguous source.
  const sourceConflict = audit.lines.some(line => line.blockers.includes('invalid_or_duplicate_identity'));
  const draft: MerchantFeedDraft = warnings.length || sourceConflict
    ? {...candidateDraft, rows: [], tsv: null, rejectedCount: candidateDraft.candidates.length}
    : candidateDraft;
  // No special exception for all-blocked, zero-products, unapproved images, or
  // partially validated catalogs. G.5F.1 refuses an incomplete TSV.
  return Object.freeze({protocol:'KD_GOOGLE_FEED_RECONCILIATION_V1',publicationAuthorized:false,
    source:'single_live_works_snapshot',visibleProductCount:visibleProducts.length,
    visibleSelectorSkuCount:audit.eligibleSelectorSkuCount,
    excludedDisabledSkuCount:audit.totalSkuCount-audit.eligibleSelectorSkuCount,
    warnings:Object.freeze(warnings),draft});
}
