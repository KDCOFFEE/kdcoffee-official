import {
  DEFAULT_OPTIONAL_SECTION_LAYOUT,
  PRODUCT_SECTION_REGISTRY,
  normalizeProductSectionOrder,
  normalizeProductSectionPlacement,
} from "@/lib/productPageSections";
import {
  PRODUCT_ANIMATION_CHILDREN_BY_SECTION,
  normalizeProductSectionAnimation,
  type ProductAnimationChildKey,
} from "@/lib/productPageAnimations";
import { normalizeCleanRoastingMedia } from "@/lib/cleanRoastingMedia";
import {
  normalizeProductPageContent,
  ProductPageContentValidationError,
} from "@/lib/productPageContentValidation";
import {
  normalizeProductCustomSections,
  ProductCustomSectionsValidationError,
} from "@/lib/productCustomSectionsValidation";

export const PRODUCT_METADATA_FIELDS = [
  "name",
  "nameEn",
  "artist",
  "origin",
  "process",
  "roast",
  "flavors",
  "shortCopy",
  "mood",
  "sort",
  "subtitle",
  "tag",
  "relatedProducts",
  "campaignDisplay",
  "productPageAnimations",
  "cleanRoastingMedia",
  "productPageContent",
  "productCustomSections",
  "displayFields",
] as const;

export const PRODUCT_TAG_MAX_LENGTH = 12;

export const PRODUCT_SENSITIVE_FIELDS = [
  "status",
  "purchasable",
  "showOnHomepage",
  "active",
  "inMonthlyMenu",
  "publish",
  "featured",
] as const;

export const SKU_SENSITIVE_FIELDS = ["label", "detail", "price", "stock", "enabled", "pvEnabled", "pvValue"] as const;

type ProductMetadataField = (typeof PRODUCT_METADATA_FIELDS)[number];
type ProductSensitiveField = (typeof PRODUCT_SENSITIVE_FIELDS)[number];
type SkuSensitiveField = (typeof SKU_SENSITIVE_FIELDS)[number];
type ProductRecord = Record<string, unknown>;

export type ProductFieldChange =
  | { field: ProductMetadataField; nextValue: unknown }
  | { field: ProductSensitiveField; expectedValue: unknown; nextValue: unknown };

export type SkuOperation =
  | {
      operation: "updateSku";
      skuId: string;
      fields: Array<{ field: SkuSensitiveField; expectedValue: unknown; nextValue: unknown }>;
    }
  | { operation: "addSku"; sku: ProductRecord }
  | { operation: "removeSku"; skuId: string; expectedValue: ProductRecord };

export type ProductChange =
  | {
      operation: "updateProduct";
      id: string;
      slug?: string;
      fields: ProductFieldChange[];
      skuOperations: SkuOperation[];
    }
  | { operation: "addProduct"; temporaryId?: string; product: ProductRecord };

export class ProductCommerceUpdateError extends Error {
  readonly status: 400 | 409;

  constructor(message: string, status: 400 | 409 = 400) {
    super(message);
    this.name = "ProductCommerceUpdateError";
    this.status = status;
  }
}

const hasOwn = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);
const isRecord = (value: unknown): value is ProductRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const clone = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value));
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function identity(product: ProductRecord) {
  return String(product.id || product.slug || "").trim();
}

function baselineSkuMap(product: ProductRecord) {
  const map = new Map<string, ProductRecord>();
  for (const sku of Array.isArray(product.skus) ? product.skus : []) {
    const id = String(sku?.id || "").trim();
    if (!id || map.has(id)) throw new ProductCommerceUpdateError(`商品「${product.name || product.slug || "未命名商品"}」含有缺少或重複的 SKU ID。`);
    map.set(id, sku);
  }
  return map;
}

function productForAdd(product: ProductRecord) {
  const result: ProductRecord = {};
  for (const field of PRODUCT_METADATA_FIELDS) result[field] = clone(product[field]);
  for (const field of PRODUCT_SENSITIVE_FIELDS) result[field] = clone(product[field]);
  result.showWhenSoldOut = product.showWhenSoldOut !== false;
  result.displayFields = clone(product.displayFields || {});
  result.skus = clone(Array.isArray(product.skus) ? product.skus : []);
  return result;
}

export function buildProductChanges(baselineProducts: ProductRecord[], currentProducts: ProductRecord[]): ProductChange[] {
  const baselineById = new Map(baselineProducts.map((product) => [identity(product), product]));
  const changes: ProductChange[] = [];

  for (const current of currentProducts) {
    const currentId = identity(current);
    const baseline = baselineById.get(currentId);
    if (!baseline || String(current.id || "").startsWith("new-")) {
      changes.push({ operation: "addProduct", temporaryId: String(current.id || "") || undefined, product: productForAdd(current) });
      continue;
    }

    const fields: ProductFieldChange[] = [];
    for (const field of PRODUCT_METADATA_FIELDS) {
      if (!equal(baseline[field], current[field])) fields.push({ field, nextValue: clone(current[field]) });
    }
    for (const field of PRODUCT_SENSITIVE_FIELDS) {
      if (!equal(baseline[field], current[field])) {
        fields.push({ field, expectedValue: clone(baseline[field]), nextValue: clone(current[field]) });
      }
    }

    const beforeSkus = baselineSkuMap(baseline);
    const afterSkus = baselineSkuMap(current);
    const skuOperations: SkuOperation[] = [];
    for (const [skuId, before] of beforeSkus) {
      const after = afterSkus.get(skuId);
      if (!after) {
        skuOperations.push({ operation: "removeSku", skuId, expectedValue: clone(before) });
        continue;
      }
      const skuFields: Array<{ field: SkuSensitiveField; expectedValue: unknown; nextValue: unknown }> = [];
      for (const field of SKU_SENSITIVE_FIELDS) {
        if (!equal(before[field], after[field])) {
          skuFields.push({ field, expectedValue: clone(before[field]), nextValue: clone(after[field]) });
        }
      }
      if (skuFields.length) skuOperations.push({ operation: "updateSku", skuId, fields: skuFields });
    }
    for (const [skuId, after] of afterSkus) {
      if (!beforeSkus.has(skuId)) skuOperations.push({ operation: "addSku", sku: clone(after) });
    }

    if (fields.length || skuOperations.length) {
      changes.push({
        operation: "updateProduct",
        id: String(current.id || "").trim(),
        slug: String(current.slug || "").trim() || undefined,
        fields,
        skuOperations,
      });
    }
  }
  return changes;
}

function normalizeString(value: unknown, label: string) {
  if (typeof value !== "string") throw new ProductCommerceUpdateError(`${label}格式不正確。`);
  return value;
}

function normalizeNonNegativeInteger(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ProductCommerceUpdateError(`${label}必須是有效的非負整數。`);
  }
  return value;
}

function normalizeNonNegativeNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new ProductCommerceUpdateError(`${label}必須是有效的非負數字。`);
  return value;
}

function normalizeReferenceIds(value: unknown, label: string, maximum?: number) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ProductCommerceUpdateError(`${label}格式不正確。`);
  }
  const ids = value.map((item) => item.trim()).filter(Boolean);
  if (maximum !== undefined && ids.length > maximum) {
    throw new ProductCommerceUpdateError(`${label}最多只能設定 ${maximum} 筆。`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new ProductCommerceUpdateError(`${label}不可包含重複項目。`);
  }
  return ids;
}

function normalizeRelatedProducts(value: unknown) {
  if (!isRecord(value) || (value.enabled !== undefined && typeof value.enabled !== "boolean")) {
    throw new ProductCommerceUpdateError("推薦比較作品設定格式不正確。");
  }
  if (value.title !== undefined && typeof value.title !== "string") {
    throw new ProductCommerceUpdateError("推薦比較作品標題格式不正確。");
  }
  const fallback = DEFAULT_OPTIONAL_SECTION_LAYOUT["related-products"];
  return {
    enabled: value.enabled !== false,
    title: typeof value.title === "string" ? value.title.trim() : "也可以比較這三款",
    productIds: normalizeReferenceIds(value.productIds, "推薦比較作品", 3),
    placement: normalizeProductSectionPlacement(value.placement, fallback.placement),
    order: normalizeProductSectionOrder(value.order, fallback.order),
  };
}

function normalizeCampaignDisplay(value: unknown) {
  if (!isRecord(value) || (value.enabled !== undefined && typeof value.enabled !== "boolean")) {
    throw new ProductCommerceUpdateError("最新活動設定格式不正確。");
  }
  const fallback = DEFAULT_OPTIONAL_SECTION_LAYOUT.campaigns;
  return {
    enabled: value.enabled === true,
    campaignIds: normalizeReferenceIds(value.campaignIds, "最新活動"),
    placement: normalizeProductSectionPlacement(value.placement, fallback.placement),
    order: normalizeProductSectionOrder(value.order, fallback.order),
  };
}

function normalizeProductPageAnimations(value: unknown) {
  if (!isRecord(value)) return {};
  const normalized: ProductRecord = {};
  for (const section of PRODUCT_SECTION_REGISTRY) {
    if (!hasOwn(value, section.key)) continue;
    const animation = normalizeProductSectionAnimation(value[section.key]);
    const allowedChildren = PRODUCT_ANIMATION_CHILDREN_BY_SECTION[section.key];
    if (animation.children) {
      animation.children = allowedChildren
        ? Object.fromEntries(Object.entries(animation.children).filter(([key]) => allowedChildren.includes(key as ProductAnimationChildKey)))
        : undefined;
    }
    normalized[section.key] = animation;
  }
  return normalized;
}

function normalizeMetadataField(field: ProductMetadataField, value: unknown) {
  if (field === "flavors") {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      throw new ProductCommerceUpdateError("商品風味格式不正確。");
    }
    return value.map((item) => item.trim()).filter(Boolean);
  }
  if (field === "sort") return normalizeNonNegativeInteger(value, "商品排序");
  if (field === "tag") {
    const tag = normalizeString(value, "作品標籤").trim();
    if (Array.from(tag).length > PRODUCT_TAG_MAX_LENGTH) {
      throw new ProductCommerceUpdateError(`作品標籤不可超過 ${PRODUCT_TAG_MAX_LENGTH} 個字。`);
    }
    const containsUnsafeCharacter = tag.includes("<") || tag.includes(">") || Array.from(tag).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    });
    if (containsUnsafeCharacter) {
      throw new ProductCommerceUpdateError("作品標籤不可包含 HTML 標記或控制字元。");
    }
    return tag;
  }
  if (field === "relatedProducts") return normalizeRelatedProducts(value);
  if (field === "campaignDisplay") return normalizeCampaignDisplay(value);
  if (field === "productPageAnimations") return normalizeProductPageAnimations(value);
  if (field === "cleanRoastingMedia") return normalizeCleanRoastingMedia(value);
  if (field === "productPageContent") {
    try {
      return normalizeProductPageContent(value);
    } catch (error) {
      if (error instanceof ProductPageContentValidationError) {
        throw new ProductCommerceUpdateError(error.message);
      }
      throw error;
    }
  }
  if (field === "productCustomSections") {
    try {
      return value === undefined ? undefined : normalizeProductCustomSections(value);
    } catch (error) {
      if (error instanceof ProductCustomSectionsValidationError) {
        throw new ProductCommerceUpdateError(error.message);
      }
      throw error;
    }
  }
  if (field === "displayFields") {
    if (!isRecord(value)) throw new ProductCommerceUpdateError("商品資料顯示設定格式不正確。");
    const allowed = ["origin", "process", "roast", "variety", "altitude", "flavors", "shortCopy", "mood"];
    return Object.fromEntries(allowed.filter((key) => hasOwn(value, key)).map((key) => {
      if (typeof value[key] !== "boolean") throw new ProductCommerceUpdateError(`商品資料顯示設定 ${key} 必須是布林值。`);
      return [key, value[key]];
    }));
  }
  return normalizeString(value, `商品欄位 ${field}`);
}

function normalizeProductSensitiveField(field: ProductSensitiveField, value: unknown) {
  if (["purchasable", "showOnHomepage", "active", "inMonthlyMenu", "featured"].includes(field)) {
    if (typeof value !== "boolean") throw new ProductCommerceUpdateError(`商品欄位 ${field} 必須是布林值。`);
    return value;
  }
  if (field === "status") {
    const status = normalizeString(value, "商品狀態");
    if (!["active", "sold_out", "coming_soon", "discontinued", "hidden"].includes(status)) {
      throw new ProductCommerceUpdateError("商品狀態不正確。");
    }
    return status;
  }
  if (!isRecord(value)) throw new ProductCommerceUpdateError("商品發布設定格式不正確。");
  const publish: ProductRecord = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "boolean") throw new ProductCommerceUpdateError(`發布設定 ${key} 必須是布林值。`);
    publish[key] = item;
  }
  return publish;
}

function normalizeSkuField(field: SkuSensitiveField, value: unknown) {
  if (field === "label" || field === "detail") return normalizeString(value, `SKU ${field}`);
  if (field === "enabled") {
    if (typeof value !== "boolean") throw new ProductCommerceUpdateError("SKU enabled 必須是布林值。");
    return value;
  }
  if (field === "pvEnabled") {
    if (typeof value !== "boolean") throw new ProductCommerceUpdateError("SKU PV 開關必須是布林值。");
    return value;
  }
  if (field === "pvValue") return normalizeNonNegativeNumber(value, "SKU PV");
  return normalizeNonNegativeInteger(value, field === "price" ? "SKU 價格" : "SKU 庫存");
}

function normalizeAddedSku(value: unknown) {
  if (!isRecord(value)) throw new ProductCommerceUpdateError("新增 SKU 格式不正確。");
  const id = normalizeString(value.id, "SKU ID").trim();
  if (!id) throw new ProductCommerceUpdateError("新增 SKU 必須有唯一 ID。");
  return {
    ...clone(value),
    id,
    label: normalizeSkuField("label", value.label),
    detail: normalizeSkuField("detail", value.detail),
    price: normalizeSkuField("price", value.price),
    stock: normalizeSkuField("stock", value.stock),
    enabled: normalizeSkuField("enabled", value.enabled),
    pvEnabled: normalizeSkuField("pvEnabled", value.pvEnabled ?? false),
    pvValue: normalizeSkuField("pvValue", value.pvValue ?? 0),
  };
}

function rebuildDerived(product: ProductRecord) {
  const skus: ProductRecord[] = Array.isArray(product.skus) ? product.skus : [];
  const stock = skus.filter((sku) => sku.enabled !== false).reduce((sum, sku) => sum + normalizeNonNegativeInteger(sku.stock, "SKU 庫存"), 0);
  product.stock = stock;
  product.purchase = skus.filter((sku) => sku.enabled !== false).map((sku) => {
    const purchaseSku = { ...sku };
    delete purchaseSku.stock;
    delete purchaseSku.enabled;
    return purchaseSku;
  });
  if (stock <= 0 && product.status === "active") product.status = "sold_out";
  if (stock > 0 && product.status === "sold_out") product.status = "active";
}

function conflict(product: ProductRecord, label: string) {
  throw new ProductCommerceUpdateError(`「${product.name || product.slug || "商品"}｜${label}」已被其他操作更新，請重新載入後再修改。`, 409);
}

function addHistory(product: ProductRecord, summary: string) {
  const history = Array.isArray(product.history) ? product.history : [];
  const version = Number(history[0]?.version || 0) + 1;
  product.history = [{ id: `H-${Date.now()}-${product.id}`, version, summary, createdAt: new Date().toISOString() }, ...history].slice(0, 20);
}

function nextNumber(products: ProductRecord[]) {
  return Math.max(0, ...products.map((product) => Number(String(product.id || "").replace(/\D/g, "")) || 0)) + 1;
}

function slugify(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function uniqueSlug(base: string, used: Set<string>) {
  let slug = base || "artwork";
  let suffix = 2;
  while (used.has(slug)) slug = `${base || "artwork"}-${suffix++}`;
  used.add(slug);
  return slug;
}

function addProduct(products: ProductRecord[], change: Extract<ProductChange, { operation: "addProduct" }>, usedSlugs: Set<string>, usedSkuIds: Set<string>, sequence: { value: number }) {
  if (!isRecord(change.product)) throw new ProductCommerceUpdateError("新增商品格式不正確。");
  const source = change.product;
  const id = `P${String(sequence.value++).padStart(5, "0")}`;
  const sku = `KD${String(Number(id.replace(/\D/g, ""))).padStart(4, "0")}`;
  const slug = uniqueSlug(slugify(String(source.nameEn || source.name || id)), usedSlugs);
  const skus = (Array.isArray(source.skus) ? source.skus : []).map(normalizeAddedSku);
  if (!skus.length) throw new ProductCommerceUpdateError("新增商品至少需要一個 SKU。");
  for (const item of skus) {
    if (usedSkuIds.has(item.id)) throw new ProductCommerceUpdateError(`SKU ID「${item.id}」已存在。`);
    usedSkuIds.add(item.id);
  }
  const product: ProductRecord = {
    id,
    sku,
    slug,
    schemaVersion: "12.0",
    showWhenSoldOut: source.showWhenSoldOut !== false,
    displayFields: isRecord(source.displayFields) ? clone(source.displayFields) : {},
    assets: {},
    pageLayout: {},
    history: [],
    skus,
  };
  for (const field of PRODUCT_METADATA_FIELDS) product[field] = normalizeMetadataField(field, source[field]);
  for (const field of PRODUCT_SENSITIVE_FIELDS) product[field] = normalizeProductSensitiveField(field, source[field]);
  rebuildDerived(product);
  addHistory(product, "建立商品");
  products.push(product);
}

export function applyProductChanges(serverProducts: ProductRecord[], requestedChanges: unknown) {
  if (!Array.isArray(requestedChanges) || !requestedChanges.length) throw new ProductCommerceUpdateError("沒有可儲存的商品變更。");
  const products = clone(serverProducts);
  const usedProductIndexes = new Set<number>();
  const usedSlugs = new Set(products.map((product: ProductRecord) => String(product.slug || "")).filter(Boolean));
  const usedSkuIds = new Set<string>();
  for (const product of products) {
    for (const sku of Array.isArray(product.skus) ? product.skus : []) {
      const skuId = String(sku?.id || "").trim();
      if (!skuId || usedSkuIds.has(skuId)) throw new ProductCommerceUpdateError(`伺服器商品資料含有缺少或重複的 SKU ID「${skuId}」。`);
      usedSkuIds.add(skuId);
    }
  }
  const sequence = { value: nextNumber(products) };

  for (const rawChange of requestedChanges) {
    if (!isRecord(rawChange)) throw new ProductCommerceUpdateError("商品變更格式不正確。");
    if (rawChange.operation === "addProduct") {
      addProduct(products, rawChange as Extract<ProductChange, { operation: "addProduct" }>, usedSlugs, usedSkuIds, sequence);
      continue;
    }
    if (rawChange.operation !== "updateProduct") throw new ProductCommerceUpdateError("不支援的商品變更操作。");
    const id = normalizeString(rawChange.id, "商品 ID").trim();
    if (!id) throw new ProductCommerceUpdateError("商品變更缺少正式 ID。");
    const index = products.findIndex((product: ProductRecord) => String(product.id || "") === id);
    if (index < 0) throw new ProductCommerceUpdateError(`找不到商品 ID「${id}」。`);
    if (usedProductIndexes.has(index)) throw new ProductCommerceUpdateError(`商品 ID「${id}」在同一 request 重複出現。`);
    usedProductIndexes.add(index);
    const product = products[index];
    const slug = typeof rawChange.slug === "string" ? rawChange.slug.trim() : "";
    if (slug && slug !== String(product.slug || "")) throw new ProductCommerceUpdateError(`商品 ID「${id}」與 slug 不一致。`);
    const fields = Array.isArray(rawChange.fields) ? rawChange.fields : [];
    const skuOperations = Array.isArray(rawChange.skuOperations) ? rawChange.skuOperations : [];
    if (!fields.length && !skuOperations.length) throw new ProductCommerceUpdateError(`商品「${product.name || id}」沒有實際變更。`);
    const seenFields = new Set<string>();
    const summary: string[] = [];

    for (const rawField of fields) {
      if (!isRecord(rawField) || typeof rawField.field !== "string") throw new ProductCommerceUpdateError("商品欄位變更格式不正確。");
      if (seenFields.has(rawField.field)) throw new ProductCommerceUpdateError(`商品欄位「${rawField.field}」重複提交。`);
      seenFields.add(rawField.field);
      if ((PRODUCT_METADATA_FIELDS as readonly string[]).includes(rawField.field)) {
        product[rawField.field] = normalizeMetadataField(rawField.field as ProductMetadataField, rawField.nextValue);
        if (
          rawField.field === "relatedProducts" &&
          isRecord(product.relatedProducts) &&
          Array.isArray(product.relatedProducts.productIds) &&
          product.relatedProducts.productIds.includes(String(product.slug || ""))
        ) {
          throw new ProductCommerceUpdateError("推薦比較作品不可選擇目前商品本身。");
        }
        summary.push(`更新 ${rawField.field}`);
        continue;
      }
      if (!(PRODUCT_SENSITIVE_FIELDS as readonly string[]).includes(rawField.field)) throw new ProductCommerceUpdateError(`商品欄位「${rawField.field}」不允許修改。`);
      if (!hasOwn(rawField, "expectedValue")) throw new ProductCommerceUpdateError(`敏感欄位「${rawField.field}」缺少 expectedValue。`);
      if (!equal(product[rawField.field], rawField.expectedValue)) conflict(product, rawField.field);
      product[rawField.field] = normalizeProductSensitiveField(rawField.field as ProductSensitiveField, rawField.nextValue);
      summary.push(`更新 ${rawField.field}`);
    }

    const productSkus = (Array.isArray(product.skus) ? product.skus : []) as ProductRecord[];
    product.skus = productSkus;
    const skuIdsForProduct = new Set(productSkus.map((sku) => String(sku.id || "")));
    const touchedSkuIds = new Set<string>();
    let skusChanged = false;
    for (const rawOperation of skuOperations) {
      if (!isRecord(rawOperation) || typeof rawOperation.operation !== "string") throw new ProductCommerceUpdateError("SKU 變更格式不正確。");
      if (rawOperation.operation === "addSku") {
        const sku = normalizeAddedSku(rawOperation.sku);
        if (usedSkuIds.has(sku.id)) throw new ProductCommerceUpdateError(`SKU ID「${sku.id}」已存在，不能新增。`);
        usedSkuIds.add(sku.id);
        skuIdsForProduct.add(sku.id);
        productSkus.push(sku);
        skusChanged = true;
        summary.push(`新增 SKU ${sku.label}`);
        continue;
      }
      const skuId = normalizeString(rawOperation.skuId, "SKU ID").trim();
      if (!skuId || touchedSkuIds.has(skuId)) throw new ProductCommerceUpdateError(`SKU ID「${skuId}」缺少或重複提交。`);
      touchedSkuIds.add(skuId);
      if (!skuIdsForProduct.has(skuId)) {
        if (usedSkuIds.has(skuId)) throw new ProductCommerceUpdateError(`SKU ID「${skuId}」屬於其他商品。`);
        throw new ProductCommerceUpdateError(`找不到 SKU ID「${skuId}」。`);
      }
      const skuIndex = productSkus.findIndex((sku) => String(sku.id || "") === skuId);
      const sku = productSkus[skuIndex];
      if (rawOperation.operation === "removeSku") {
        if (!hasOwn(rawOperation, "expectedValue") || !equal(sku, rawOperation.expectedValue)) conflict(product, String(sku.label || skuId));
        productSkus.splice(skuIndex, 1);
        usedSkuIds.delete(skuId);
        skuIdsForProduct.delete(skuId);
        skusChanged = true;
        summary.push(`刪除 SKU ${sku.label || skuId}`);
        continue;
      }
      if (rawOperation.operation !== "updateSku" || !Array.isArray(rawOperation.fields) || !rawOperation.fields.length) {
        throw new ProductCommerceUpdateError(`SKU「${skuId}」變更格式不正確。`);
      }
      const seenSkuFields = new Set<string>();
      for (const rawField of rawOperation.fields) {
        if (!isRecord(rawField) || typeof rawField.field !== "string" || !(SKU_SENSITIVE_FIELDS as readonly string[]).includes(rawField.field)) {
          throw new ProductCommerceUpdateError(`SKU「${skuId}」含有不允許的欄位。`);
        }
        if (seenSkuFields.has(rawField.field) || !hasOwn(rawField, "expectedValue")) {
          throw new ProductCommerceUpdateError(`SKU「${skuId}」欄位「${rawField.field}」缺少 expectedValue 或重複提交。`);
        }
        seenSkuFields.add(rawField.field);
        const currentValue = rawField.field === "pvEnabled" ? sku.pvEnabled ?? false : rawField.field === "pvValue" ? sku.pvValue ?? 0 : sku[rawField.field];
        if (!equal(currentValue, rawField.expectedValue)) conflict(product, String(sku.label || skuId));
        sku[rawField.field] = normalizeSkuField(rawField.field as SkuSensitiveField, rawField.nextValue);
        summary.push(`更新 ${sku.label || skuId} ${rawField.field}`);
      }
      skusChanged = true;
    }
    if (skusChanged) rebuildDerived(product);
    product.schemaVersion = "12.0";
    addHistory(product, summary.join("、") || "更新商品資料");
  }

  return products;
}
