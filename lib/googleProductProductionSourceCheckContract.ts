/** A private diagnostic protocol, never a feed, quote or publication approval. */
export const PRODUCTION_DIAGNOSTIC_FLAGS = Object.freeze({
  publicationAuthorized: false, runtimeSourceProven: false, officialCheckoutVerified: false,
  ownerApprovedMediaVerified: false, crossDomainAtomicityProven: false,
  fullCoffeeDocumentSchemaProven: false, merchantConnectionEnabled: false,
} as const);
export const PRODUCTION_DIAGNOSTIC_REASONS = Object.freeze({
  capability_off: '正式來源診斷能力未啟用',
  runtime_unverified: '不是已指定的 Railway 正式執行環境',
  storage_unverified: '缺少合法的 Railway 持久化根目錄與掛載設定',
  source_missing: 'Coffee 持久化商品檔案不存在',
  source_unreadable: 'Coffee 商品檔案無法安全讀取',
  source_changed: '來源身分、內容或版本在讀取期間變動，已丟棄摘要',
  source_invalid: 'Coffee 文件或持久化 SKU 商業契約無效',
  transaction_unverified: '尚無同快照正式交易權威證據',
  image_unapproved: '尚無逐 SKU 與製備形式圖片核准',
  atomicity_unproven: '來源前後比對不是原子快照證明',
  store_not_requested: '本階段僅診斷 Coffee，未讀取或驗證 Store',
} as const);
export type ProductionDiagnosticReason = keyof typeof PRODUCTION_DIAGNOSTIC_REASONS;
export type CoffeeProductDiagnostic = Readonly<{
  productId: string | null; slug: string | null; name: string | null;
  comingSoon: boolean; worksListStatus: 'listed' | 'not_listed';
  active: boolean | null; purchasable: boolean | null;
  persistedSkuEntries: number | null; skuIncomplete: boolean;
  reasons: readonly ('missing_persisted_skus' | 'missing_preparation_kind' | 'beans_ground_unverified' |
    'duplicate_persisted_sku' | 'invalid_sku_price' | 'invalid_sku_stock' | 'invalid_sku_fields')[];
}>;
export type ProductionSourceCheckResult = Readonly<{
  protocol: 'KD_PRODUCTION_SOURCE_DIAGNOSTIC_V1';
  source: 'railway_production_diagnostic'; scope: 'coffee_only';
  state: 'diagnostic_complete' | 'blocked'; googleEligibility: 'BLOCKED';
  deploymentCommit: string | null;
  deploymentIdentity: 'server_metadata_only' | 'unverified';
  store: Readonly<{ state: 'not_requested' }>;
  coffee: Readonly<{
    physicalState: 'not_checked' | 'present' | 'missing' | 'unverified';
    documentStructure: 'not_checked' | 'valid_envelope' | 'invalid';
    commercialValidation: 'not_checked' | 'valid_projection' | 'invalid';
    consistency: 'not_checked' | 'stable_bracket' | 'changed';
    version: number | null; updatedAt: string | null; sha256: string | null;
    productCount: number | null; rawPersistedSkuEntries: number | null;
    validatedSkuCount: number | null; notListedProductCount: number | null;
    comingSoonProductCount: number | null; skuIncompleteProductCount: number | null;
    /** Present only for a stable, structurally bounded envelope. Not verified SKU offers. */
    diagnostics: readonly CoffeeProductDiagnostic[];
  }>;
  reasons: readonly ProductionDiagnosticReason[];
}> & typeof PRODUCTION_DIAGNOSTIC_FLAGS;
export function productionDiagnosticFailure(reason: ProductionDiagnosticReason): ProductionSourceCheckResult {
  return { protocol: 'KD_PRODUCTION_SOURCE_DIAGNOSTIC_V1', source: 'railway_production_diagnostic',
    scope: 'coffee_only', state: 'blocked', googleEligibility: 'BLOCKED',
    deploymentCommit: null, deploymentIdentity: 'unverified', store: {state: 'not_requested'},
    coffee: {physicalState:'not_checked',documentStructure:'not_checked',commercialValidation:'not_checked',
      consistency:'not_checked',version:null,updatedAt:null,sha256:null,productCount:null,
      rawPersistedSkuEntries:null,validatedSkuCount:null,notListedProductCount:null,
      comingSoonProductCount:null,skuIncompleteProductCount:null,diagnostics:[]},
    reasons:[reason,'transaction_unverified','image_unapproved','atomicity_unproven','store_not_requested'],
    ...PRODUCTION_DIAGNOSTIC_FLAGS };
}
