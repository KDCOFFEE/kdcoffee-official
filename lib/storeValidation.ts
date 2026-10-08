import type { StoreCatalog, StoreCategory, StoreProduct, StoreSection } from "./storeTypes";

export class StoreValidationError extends Error {
  constructor(message: string) { super(message); this.name = "StoreValidationError"; }
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new StoreValidationError(message);
}

export const STORE_SECTION_FIELDS = ["name", "slug", "shortDescription", "description", "active", "published", "sortOrder", "showOnHomepage", "homepageSortOrder", "showInNavigation", "navigationSortOrder", "seoTitle", "seoDescription"] as const;
export const STORE_CATEGORY_FIELDS = ["sectionId", "name", "slug", "description", "sortOrder", "active"] as const;
export const STORE_PRODUCT_FIELDS = ["slug", "name", "shortDescription", "description", "sectionId", "categoryId", "productType", "sku", "price", "salePrice", "inventory", "active", "published", "sortOrder", "featured", "heroMedia", "gallery", "specifications", "pvValue", "kdRedemption"] as const;
const ENTITY_FIELDS = ["id", "revision", "createdAt", "updatedAt", "archivedAt"];

/** Reject unknown/server-owned keys, accessors, and prototype-shaped payloads. */
export function storeInputRecord(input: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  ensure(input !== null && typeof input === "object" && !Array.isArray(input), `${label}: object required`);
  const prototype = Object.getPrototypeOf(input);
  ensure(prototype === Object.prototype || prototype === null, `${label}: plain object required`);
  ensure(Object.getOwnPropertySymbols(input).length === 0, `${label}: symbol keys forbidden`);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(input))) {
    ensure(!["__proto__", "prototype", "constructor"].includes(key) && allowed.includes(key), `${label}: unexpected field ${key}`);
    ensure("value" in descriptor && descriptor.enumerable, `${label}: data properties required`);
  }
  return input as Record<string, unknown>;
}

function text(value: unknown, label: string, max: number, required = false): asserts value is string {
  ensure(typeof value === "string" && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value), `${label}: invalid text`);
  if (required) ensure(value.trim().length > 0, `${label}: required`);
}
function id(value: unknown, label: string) {
  ensure(typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u.test(value), `${label}: invalid ID`);
}
function slug(value: unknown, label: string) {
  ensure(typeof value === "string" && value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value), `${label}: invalid slug`);
}
function bool(value: unknown, label: string) { ensure(typeof value === "boolean", `${label}: boolean required`); }
function nonNegative(value: unknown, label: string): number {
  ensure(typeof value === "number" && Number.isFinite(value) && value >= 0, `${label}: finite non-negative number required`);
  return value;
}
function integer(value: unknown, label: string, min = 0): number {
  ensure(typeof value === "number" && Number.isSafeInteger(value) && value >= min, `${label}: safe integer >= ${min} required`);
  return value;
}
function timestamp(value: unknown, label: string): asserts value is string {
  ensure(typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value, `${label}: canonical ISO timestamp required`);
}
function list(value: unknown, label: string, max: number): unknown[] {
  ensure(Array.isArray(value) && value.length <= max, `${label}: bounded array required`);
  return value;
}
function entity(value: Record<string, unknown>, label: string) {
  id(value.id, `${label}.id`);
  integer(value.revision, `${label}.revision`, 1);
  timestamp(value.createdAt, `${label}.createdAt`);
  timestamp(value.updatedAt, `${label}.updatedAt`);
  ensure(value.updatedAt >= value.createdAt, `${label}: updatedAt precedes createdAt`);
  if (value.archivedAt !== null) {
    timestamp(value.archivedAt, `${label}.archivedAt`);
    ensure(value.archivedAt >= value.createdAt && value.archivedAt <= value.updatedAt, `${label}: invalid archive timestamp`);
    ensure(value.active === false && (!("published" in value) || value.published === false), `${label}: archived entity must be inactive/unpublished`);
  }
  bool(value.active, `${label}.active`);
  integer(value.sortOrder, `${label}.sortOrder`);
  text(value.name, `${label}.name`, 200, true);
  slug(value.slug, `${label}.slug`);
  text(value.description, `${label}.description`, 20_000);
  if ("published" in value) {
    bool(value.published, `${label}.published`);
    ensure(!value.published || value.active, `${label}: published entity must be active`);
  }
}

export function validateStoreSection(input: unknown): asserts input is StoreSection {
  const value = storeInputRecord(input, [...ENTITY_FIELDS, ...STORE_SECTION_FIELDS], "section");
  entity(value, "section");
  bool(value.published, "section.published");
  text(value.shortDescription, "section.shortDescription", 500);
  for (const key of ["showOnHomepage", "showInNavigation"]) bool(value[key], `section.${key}`);
  for (const key of ["homepageSortOrder", "navigationSortOrder"]) integer(value[key], `section.${key}`);
  text(value.seoTitle, "section.seoTitle", 160);
  text(value.seoDescription, "section.seoDescription", 500);
}

export function validateStoreCategory(input: unknown): asserts input is StoreCategory {
  const value = storeInputRecord(input, [...ENTITY_FIELDS, ...STORE_CATEGORY_FIELDS], "category");
  entity(value, "category");
  id(value.sectionId, "category.sectionId");
}

function mediaUrl(value: unknown, label: string): asserts value is string {
  text(value, label, 2048, true);
  ensure(!/[\\\u0000-\u0020]/u.test(value), `${label}: unsafe URL`);
  if (value.startsWith("/")) {
    ensure(!value.startsWith("//") && !/[?#]/u.test(value), `${label}: local absolute path required`);
    for (const segment of value.split("/")) {
      let decoded: string;
      try { decoded = decodeURIComponent(segment); } catch { throw new StoreValidationError(`${label}: malformed URL encoding`); }
      ensure(![".", ".."].includes(decoded) && !/[\\/\u0000-\u0020]/u.test(decoded), `${label}: unsafe local path`);
    }
  } else {
    let url: URL;
    try { url = new URL(value); } catch { throw new StoreValidationError(`${label}: invalid URL`); }
    ensure(url.protocol === "https:" && !url.username && !url.password, `${label}: HTTPS without credentials required`);
  }
}
function media(input: unknown) {
  const value = storeInputRecord(input, ["type", "url", "provider", "publicId", "videoId", "posterUrl", "width", "height", "duration", "format", "bytes", "alt"], "media");
  ensure(typeof value.type === "string" && ["image", "video", "youtube"].includes(value.type), "media.type: invalid type");
  mediaUrl(value.url, "media.url");
  text(value.alt, "media.alt", 300);
  if ("provider" in value) ensure(value.provider === "local" || value.provider === "cloudinary", "media.provider: invalid provider");
  if (value.provider === "local") ensure(value.url.startsWith("/"), "media: local provider requires local path");
  if ("posterUrl" in value) mediaUrl(value.posterUrl, "media.posterUrl");
  for (const key of ["width", "height"]) if (key in value) integer(value[key], `media.${key}`, 1);
  for (const key of ["duration", "bytes"]) if (key in value) nonNegative(value[key], `media.${key}`);
  for (const key of ["publicId", "format"]) if (key in value) text(value[key], `media.${key}`, 300, true);
  if (value.type === "youtube") {
    ensure(typeof value.videoId === "string" && /^[A-Za-z0-9_-]{11}$/u.test(value.videoId), "media.videoId: invalid YouTube ID");
    ensure(value.url.startsWith("https:") && ["youtube.com", "www.youtube.com", "youtu.be"].includes(new URL(value.url).hostname), "media: invalid YouTube URL");
  } else ensure(!("videoId" in value), "media: videoId only permitted for YouTube");
}

export function validateStoreProduct(input: unknown): asserts input is StoreProduct {
  const value = storeInputRecord(input, [...ENTITY_FIELDS, ...STORE_PRODUCT_FIELDS, "subscriptionEligible"], "product");
  entity(value, "product");
  bool(value.published, "product.published");
  text(value.shortDescription, "product.shortDescription", 500);
  id(value.sectionId, "product.sectionId");
  if ("categoryId" in value) id(value.categoryId, "product.categoryId");
  ensure(typeof value.productType === "string" && ["general", "equipment", "food", "gift"].includes(value.productType), "product.productType: invalid type");
  text(value.sku, "product.sku", 120, true);
  ensure(!/\s/u.test(value.sku), "product.sku: whitespace forbidden");
  const price = nonNegative(value.price, "product.price");
  if ("salePrice" in value) ensure(nonNegative(value.salePrice, "product.salePrice") <= price, "product.salePrice: exceeds price");
  integer(value.inventory, "product.inventory");
  // No conversion, inheritance, rounding, default from price, or wallet calls.
  nonNegative(value.pvValue, "product.pvValue");
  ensure(value.subscriptionEligible === false, "product.subscriptionEligible: must remain false");
  bool(value.featured, "product.featured");
  if ("heroMedia" in value) media(value.heroMedia);
  for (const item of list(value.gallery, "product.gallery", 24)) media(item);
  const specificationKeys = new Set<string>();
  for (const inputSpec of list(value.specifications, "product.specifications", 80)) {
    const spec = storeInputRecord(inputSpec, ["key", "label", "value", "sortOrder"], "specification");
    ensure(typeof spec.key === "string" && /^[a-z][a-z0-9_-]{0,63}$/u.test(spec.key), "specification.key: invalid key");
    ensure(!specificationKeys.has(spec.key), "specification.key: duplicate key");
    specificationKeys.add(spec.key);
    text(spec.label, "specification.label", 120, true);
    text(spec.value, "specification.value", 4000, true);
    integer(spec.sortOrder, "specification.sortOrder");
  }
  if ("kdRedemption" in value) {
    const redemption = storeInputRecord(value.kdRedemption, ["mode", "maxDiscountPercent"], "kdRedemption");
    ensure(typeof redemption.mode === "string" && ["inherit", "enabled", "disabled"].includes(redemption.mode), "kdRedemption.mode: invalid mode");
    if ("maxDiscountPercent" in redemption) ensure(nonNegative(redemption.maxDiscountPercent, "kdRedemption.maxDiscountPercent") <= 100, "kdRedemption.maxDiscountPercent: must be <= 100");
  }
}

function unique(values: string[], label: string) { ensure(new Set(values).size === values.length, `${label}: duplicate identity`); }

export function validateStoreCatalog(input: unknown): asserts input is StoreCatalog {
  const value = storeInputRecord(input, ["schemaVersion", "revision", "updatedAt", "sections", "categories", "products"], "catalog");
  ensure(value.schemaVersion === 1, "catalog.schemaVersion: unsupported version");
  const revision = integer(value.revision, "catalog.revision");
  if (value.updatedAt !== null) timestamp(value.updatedAt, "catalog.updatedAt");
  ensure(revision === 0 ? value.updatedAt === null : value.updatedAt !== null, "catalog: inconsistent revision timestamp");
  const sections = list(value.sections, "catalog.sections", 1000) as StoreSection[];
  const categories = list(value.categories, "catalog.categories", 10_000) as StoreCategory[];
  const products = list(value.products, "catalog.products", 100_000) as StoreProduct[];
  sections.forEach(validateStoreSection);
  categories.forEach(validateStoreCategory);
  products.forEach(validateStoreProduct);
  ensure(revision > 0 || (sections.length + categories.length + products.length) === 0, "catalog: revision zero must be empty");
  unique([...sections, ...categories, ...products].map(item => item.id), "catalog.id");
  unique(sections.map(item => item.slug), "section.slug");
  unique(categories.map(item => `${item.sectionId}:${item.slug}`), "category.section/slug");
  unique(products.map(item => item.slug), "product.slug");
  unique(products.map(item => item.sku.toUpperCase()), "product.sku");
  const sectionMap = new Map(sections.map(item => [item.id, item]));
  const categoryMap = new Map(categories.map(item => [item.id, item]));
  for (const category of categories) {
    const section = sectionMap.get(category.sectionId);
    ensure(section, "category.sectionId: missing section");
    ensure(category.archivedAt !== null || section.archivedAt === null, "category: live child under archived section");
  }
  for (const product of products) {
    const section = sectionMap.get(product.sectionId);
    ensure(section, "product.sectionId: missing section");
    ensure(product.archivedAt !== null || section.archivedAt === null, "product: live child under archived section");
    const category = product.categoryId === undefined ? undefined : categoryMap.get(product.categoryId);
    if (product.categoryId !== undefined) {
      ensure(category && category.sectionId === section.id, "product.categoryId: missing or cross-section category");
      ensure(product.archivedAt !== null || category.archivedAt === null, "product: live child under archived category");
    }
    if (product.published) ensure(section.active && section.published && (!category || category.active), "product: published parent/category required");
  }
}
