import 'server-only';
import { createHash } from 'node:crypto';

/**
 * Read-only commercial projection of the actual persisted Coffee contract.
 * Evidence: data/websiteData.ts; productCommerceUpdates.ts normalizeSkuField,
 * normalizeAddedSku, rebuildDerived, applyProductChanges; commerceCartResolver.ts.
 * This does not validate presentation extensions or claim full-document validity.
 */
type RecordValue = Record<string, unknown>;
export type CanonicalCoffeeSku = Readonly<{
  productId:string; slug:string; name:string; skuId:string; specification:string;
  specificationSha256:string; price:number; stock:number; quantityLimit:number;
  kind:'beans'|'drip'|null; eligibleByPersistedFields:boolean;
  blockers:readonly string[];
}>;
function valid(v:unknown):asserts v { if (!v) throw Error('COFFEE_COMMERCIAL_CONTRACT_INVALID'); }
const record = (v:unknown):v is RecordValue => !!v && typeof v==='object' && !Array.isArray(v);
const text = (v:unknown):v is string => typeof v==='string' && v.trim()===v && v.length>0 && v.length<=200 && !/[\u0000-\u001f\u007f]/u.test(v);
const integer = (v:unknown):v is number => typeof v==='number' && Number.isSafeInteger(v) && v>=0;
function unique(seen:Set<string>, value:unknown):asserts value is string { valid(text(value) && !seen.has(value)); seen.add(value); }
export function readCanonicalCoffeeCommercialContract(value:unknown) {
  valid(record(value) && integer(value.version) && typeof value.updatedAt==='string' &&
    Number.isFinite(Date.parse(value.updatedAt)) && new Date(value.updatedAt).toISOString()===value.updatedAt &&
    record(value.menu) && Array.isArray(value.menu.products) && value.menu.products.length<=1000);
  const ids=new Set<string>(), slugs=new Set<string>(), skus=new Set<string>();
  const rows:CanonicalCoffeeSku[]=[];
  for (const raw of value.menu.products) {
    valid(record(raw)); unique(ids,raw.id); unique(slugs,raw.slug);
    valid(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw.slug) && text(raw.name));
    for (const field of ['active','purchasable']) valid(raw[field]===undefined || typeof raw[field]==='boolean');
    valid(raw.status===undefined || ['active','sold_out','coming_soon','discontinued','hidden'].includes(String(raw.status)));
    // Never use the Admin GET's presentation fallback or the legacy cart fallback.
    valid(Array.isArray(raw.skus) && raw.skus.length>0 && raw.skus.length<=100);
    for (const sku of raw.skus) {
      valid(record(sku)); unique(skus,sku.id);
      valid(text(sku.label) && typeof sku.detail==='string' && sku.detail.length<=2000 &&
        !/[\u0000-\u001f\u007f]/u.test(sku.detail) && integer(sku.price) && integer(sku.stock));
      valid(sku.enabled===undefined || typeof sku.enabled==='boolean');
      valid(sku.kind===undefined || sku.kind==='beans' || sku.kind==='drip');
      if (sku.pvEnabled!==undefined) valid(typeof sku.pvEnabled==='boolean');
      if (sku.pvValue!==undefined) valid(typeof sku.pvValue==='number' && Number.isFinite(sku.pvValue) && sku.pvValue>=0);
      const blockers:string[]=[];
      if (raw.active!==true || raw.purchasable!==true || raw.status!=='active') blockers.push('visibility_or_purchase_unproven');
      if (sku.enabled!==true) blockers.push('sku_enablement_unproven');
      if (sku.stock===0) blockers.push('sku_sold_out');
      // Writer accepts zero. Existing Google offer contract requires positive price.
      if (sku.price===0) blockers.push('zero_price_google_contract_requires_review');
      if (sku.kind===undefined) blockers.push('preparation_kind_unproven');
      rows.push(Object.freeze({productId:raw.id,slug:raw.slug,name:raw.name,skuId:sku.id,
        specification:sku.label,specificationSha256:createHash('sha256').update(JSON.stringify({id:sku.id,label:sku.label,detail:sku.detail,kind:sku.kind})).digest('hex'),
        price:sku.price,stock:sku.stock,quantityLimit:Math.min(99,sku.stock),kind:sku.kind??null,
        eligibleByPersistedFields:blockers.length===0,blockers:Object.freeze(blockers)}));
    }
  }
  return Object.freeze({scope:'canonical_coffee_commercial_projection' as const,version:value.version,
    rows:Object.freeze(rows),fullDocumentSchemaProven:false as const,publicationAuthorized:false as const});
}
