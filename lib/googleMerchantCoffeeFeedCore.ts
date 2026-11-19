/** G.5F.1: Pure, read-only candidate generator. This module cannot publish or write. */
export type MerchantCoffeeSku = Readonly<{
  id?: string; label?: string; detail?: string; price?: number; stock?: number;
  enabled?: boolean; kind?: 'beans' | 'drip';
}>;
export type MerchantPublicCoffee = Readonly<{
  id?: string; slug: string; name: string; shortCopy?: string; subtitle?: string;
  status?: string; purchasable?: boolean; active?: boolean;
  skus?: readonly MerchantCoffeeSku[];
}>;
export type MerchantEvidence = Readonly<{
  /** Owner-confirmed, real per-variant public image URL; no URL inference. */
  approvedImageUrlsBySku: Readonly<Record<string, string>>;
  /** Explicit proof that landing page selects/matches that SKU and checkout price. */
  checkoutVerifiedSkuIds: readonly string[];
}>;
export type MerchantCandidate = Readonly<{
  id: string; productSlug: string; skuId: string; title: string;
  availability: 'in_stock' | 'out_of_stock';
  blockers: readonly string[];
}>;
export type MerchantFeedRow = Readonly<{
  id: string; title: string; description: string; link: string; image_link: string;
  availability: 'in_stock' | 'out_of_stock'; price: string; condition: 'new';
}>;
export type MerchantFeedDraft = Readonly<{
  protocol: 'KD_GOOGLE_FEED_DRAFT_V1'; publicationAuthorized: false;
  candidates: readonly MerchantCandidate[]; rows: readonly MerchantFeedRow[];
  sourceIssues: readonly Readonly<{
    productSlug: string;
    reason: 'missing_persisted_skus' | 'missing_public_selector_skus';
  }>[];
  rejectedCount: number; tsv: string | null;
}>;
const BASE = 'https://www.kdcoffee1962.com';
const skuKey = (productId: string, skuId: string) => `${productId}::${skuId}`;
function publicImageUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    // Do not trust external hosts or internal endpoints as a verified product image.
    if (!url.hostname || url.hostname === 'localhost' || url.hostname.endsWith('.local') || !url.pathname.startsWith('/')) return null;
    return url.toString();
  } catch { return null; }
}
function safeText(value: unknown, max = 500): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) return null;
  const trimmed = value.trim(); return trimmed.length ? trimmed : null;
}
function escapedField(v: string) { return v.replace(/[\t\r\n]/g, ' ').trim(); }
const headings = ['id','title','description','link','image_link','availability','price','condition'] as const;
/** Preview status alone does not stop checkout; the storefront honors these two flags. */
export function isUnpurchasableMerchantPreview(product: Pick<MerchantPublicCoffee, 'status' | 'active' | 'purchasable'>) {
  return product.status === 'coming_soon' && (product.active === false || product.purchasable === false);
}

/** Input MUST be the live /works public projection, never the full admin catalog. */
export function buildGoogleMerchantCoffeeFeedDraft(
  publicProducts: readonly MerchantPublicCoffee[],
  evidence: MerchantEvidence = {approvedImageUrlsBySku:{}, checkoutVerifiedSkuIds:[]},
  selectorOnly = false,
): MerchantFeedDraft {
  const candidates: MerchantCandidate[] = [], rows: MerchantFeedRow[] = [];
  const sourceIssues: MerchantFeedDraft['sourceIssues'][number][] = [];
  const verified = new Set(evidence.checkoutVerifiedSkuIds);
  const seen = new Set<string>();
  for (const product of publicProducts) {
    if (isUnpurchasableMerchantPreview(product)) continue;
    const slug = safeText(product.slug, 150);
    const productId = safeText(product.id, 150);
    const name = safeText(product.name, 150);
    const skus = Array.isArray(product.skus) ? product.skus : [];
    if ((product.status === 'sold_out' || (product.active !== false && product.purchasable !== false)) &&
        !skus.some(sku => sku.enabled !== false)) {
      sourceIssues.push({productSlug:product.slug,
        reason:skus.length ? 'missing_public_selector_skus' : 'missing_persisted_skus'});
    }
    for (const sku of skus) {
      if (selectorOnly && sku.enabled === false) continue;
      const blockers: string[] = [];
      const skuId = safeText(sku.id, 150);
      const label = safeText(sku.label, 150);
      const key = skuKey(productId || '', skuId || '');
      if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !productId || !name || !skuId || !label)
        blockers.push('invalid_product_or_sku_identity');
      if (seen.has(key)) blockers.push('duplicate_sku_identity');
      seen.add(key);
      if (product.active !== true || !['active', 'sold_out'].includes(product.status || '') || (product.purchasable !== true && product.status !== 'sold_out')) blockers.push('product_checkout_not_confirmed');
      if (sku.enabled !== true) blockers.push('sku_not_enabled');
      if (!Number.isSafeInteger(sku.price) || (sku.price ?? 0) <= 0) blockers.push('invalid_positive_price');
      if (!Number.isSafeInteger(sku.stock) || (sku.stock ?? -1) < 0) blockers.push('invalid_stock');
      if (sku.kind !== 'beans' && sku.kind !== 'drip') blockers.push('unverified_preparation_kind');
      const image = publicImageUrl(evidence.approvedImageUrlsBySku[key]);
      if (!image) blockers.push('missing_owner_approved_sku_image');
      if (!verified.has(key)) blockers.push('unverified_landing_and_checkout_price');
      // Sold-out visible artworks can be published out_of_stock after evidence approval.
      const soldOut = product.status === 'sold_out' || product.purchasable === false || product.active !== true || sku.stock === 0;
      const availability = soldOut ? 'out_of_stock' : 'in_stock';
      const id = `kd-coffee-${productId || 'invalid'}-${skuId || 'invalid'}`;
      const title = `${name || '未命名作品'}｜${label || '規格待確認'}`;
      candidates.push({id, productSlug:product.slug, skuId:skuId || '',title,availability,blockers});
      if (blockers.length) continue;
      const description = safeText(product.shortCopy || product.subtitle, 500) || `${name}，${label}。`;
      rows.push({id,title,description,link:`${BASE}/works/${encodeURIComponent(slug!)}?sku=${encodeURIComponent(skuId!)}`,
        image_link:image!,availability,price:`${sku.price} TWD`,condition:'new'});
    }
  }
  // A partial feed silently dropping visible products is unsafe: refuse any export
  // until each candidate is complete and at least one candidate exists.
  const ready = sourceIssues.length === 0 && candidates.length > 0 && candidates.length === rows.length;
  const tsv = ready ? [headings.join('\t'),...rows.map(row => headings.map(h=>escapedField(row[h])).join('\t'))].join('\n')+'\n' : null;
  return Object.freeze({protocol:'KD_GOOGLE_FEED_DRAFT_V1',publicationAuthorized:false,
    candidates,rows:ready?rows:[],sourceIssues,rejectedCount:candidates.length-rows.length,tsv});
}
