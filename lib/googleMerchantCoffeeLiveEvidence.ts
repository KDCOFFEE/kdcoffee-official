/** G.5F.2: Pure, read-only reality check against the SAME live snapshot used
 * by the /works purchase UI. This is NOT an owner media approval or a checkout
 * transaction quote, and cannot cause Google publication. */
export type EvidenceSku = Readonly<{
  id?: string; label?: string; detail?: string; price?: number; stock?: number;
  enabled?: boolean; kind?: 'beans' | 'drip';
}>;
export type EvidenceProduct = Readonly<{
  id?: string; slug: string; name: string; active?: boolean;
  purchasable?: boolean; status?: string; stock?: number;
  origin?: string; process?: string; roast?: string; variety?: string; altitude?: string;
  skus?: readonly EvidenceSku[]; purchase?: readonly EvidenceSku[];
}>;
export type ImageSuggestion = Readonly<{ path: string; key: string; sha256?: string }>;
export type EvidenceLine = Readonly<{
  productId: string; slug: string; skuId: string; skuLabel: string;
  source: 'skus' | 'legacy_purchase_fallback';
  visibleInPurchaseSelector: boolean; priceTwd: number | null;
  stock: number | null; availability: 'in_stock' | 'out_of_stock';
  preparation: 'drip' | 'beans_with_optional_grinding' | 'unverified';
  suggestedProductImageUrl: string | null;
  suggestedProductImageSha256: string | null;
  imageOwnerApproved: false;
  checkoutTransactionVerified: false;
  blockers: readonly string[];
}>;
export type LiveEvidenceAudit = Readonly<{
  protocol: 'KD_MERCHANT_LIVE_EVIDENCE_V1';
  publicationAuthorized: false;
  source: 'single_live_works_snapshot';
  visibleProductCount: number;
  eligibleSelectorSkuCount: number;
  totalSkuCount: number;
  lines: readonly EvidenceLine[];
}>;
const BASE = 'https://www.kdcoffee1962.com';
export function merchantProductImageUrl(path: string | undefined): string | null {
  // Validate raw segments before URL parsing can normalize dot segments or backslashes.
  if (!path || typeof path !== 'string' || path.trim() !== path || path.startsWith('//') ||
      /[\\%\u0000-\u001f\u007f]/u.test(path) || /\/\.{1,2}(?:\/|$)/u.test(path)) return null;
  try {
    const u = new URL(path, BASE);
    if (u.origin !== BASE || u.protocol !== 'https:' || u.username || u.password || u.hash || u.search) return null;
    if (!/^\/(?:uploads|images)\/[a-zA-Z0-9_./-]+$/u.test(u.pathname) || /\.(?:mp4|mov|webm)$/iu.test(u.pathname)) return null;
    return u.toString();
  } catch { return null; }
}
/** "Beans" with a grind choice is ONE SKU in the actual purchase UI.
 * No synthetic bean / ground IDs are created. */
export function inspectGoogleMerchantLiveEvidence(
  visibleProducts: readonly EvidenceProduct[],
  suggestActualProductPhoto: (product: EvidenceProduct) => ImageSuggestion | null,
): LiveEvidenceAudit {
  const lines: EvidenceLine[] = [];
  const seenSkuIds = new Set<string>();
  const seenProductIds = new Set<string>();
  for (const product of visibleProducts) {
    const hasSkuSource = Array.isArray(product.skus) && product.skus.length > 0;
    const options = hasSkuSource ? product.skus! : (Array.isArray(product.purchase) ? product.purchase : []);
    const photo = suggestActualProductPhoto(product);
    const photoUrl = photo?.key === 'productPhoto' || photo?.key === 'productVisual'
      ? merchantProductImageUrl(photo.path) : null;
    const productId = product.id ?? '';
    const repeatedProduct = !productId || seenProductIds.has(productId);
    seenProductIds.add(productId);
    for (const sku of options) {
      const blockers: string[] = [];
      const skuId = sku.id ?? '';
      const duplicate = !skuId || seenSkuIds.has(skuId);
      seenSkuIds.add(skuId);
      if (repeatedProduct || duplicate || !sku.label || !product.slug) blockers.push('invalid_or_duplicate_identity');
      if (!hasSkuSource) blockers.push('legacy_purchase_fallback_not_merchant_authority');
      // AddToCart.normalizeOptions filters enabled===false (undefined is visible).
      const visibleInPurchaseSelector = sku.enabled !== false;
      if (!visibleInPurchaseSelector) blockers.push('disabled_sku_not_visible_to_shopper');
      const price = typeof sku.price === 'number' && Number.isSafeInteger(sku.price) && sku.price >= 0 ? sku.price : null;
      const stock = typeof sku.stock === 'number' && Number.isSafeInteger(sku.stock) && sku.stock >= 0 ? sku.stock : null;
      if (price === null || price === 0) blockers.push('invalid_google_price');
      if (stock === null) blockers.push('unverified_persisted_stock');
      if (sku.kind !== 'beans' && sku.kind !== 'drip') blockers.push('preparation_kind_unverified');
      if (!photoUrl) blockers.push('approved_product_photo_missing');
      // A product display photo is NOT per-SKU owner approval.
      blockers.push('sku_image_approval_required');
      // A common snapshot is helpful, but does not prove a transaction price.
      blockers.push('checkout_transaction_verification_required');
      const unavailable = product.status === 'sold_out' || product.purchasable === false || product.active === false || stock === 0;
      lines.push({productId,slug:product.slug,skuId,skuLabel:sku.label ?? '',
        source:hasSkuSource?'skus':'legacy_purchase_fallback',visibleInPurchaseSelector,
        priceTwd:price,stock,availability:unavailable?'out_of_stock':'in_stock',
        preparation:sku.kind==='drip'?'drip':sku.kind==='beans'?'beans_with_optional_grinding':'unverified',
        suggestedProductImageUrl:photoUrl,suggestedProductImageSha256:photoUrl ? photo?.sha256 ?? null : null,
        imageOwnerApproved:false,checkoutTransactionVerified:false,blockers});
    }
  }
  return {protocol:'KD_MERCHANT_LIVE_EVIDENCE_V1',publicationAuthorized:false,
    source:'single_live_works_snapshot',visibleProductCount:visibleProducts.length,
    eligibleSelectorSkuCount:lines.filter(item=>item.visibleInPurchaseSelector).length,
    totalSkuCount:lines.length,lines};
}
