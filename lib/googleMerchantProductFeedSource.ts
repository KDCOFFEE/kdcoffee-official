import "server-only";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { getLiveWebsiteData, type WebsiteData } from "@/data/websiteData";
import { validateUnifiedCartItem } from "./commerceCart";
import { commerceOrderMoney } from "./commerceOrderPricing";
import {
  chargeMerchantImageBytes, checkDeadline, createMerchantImageBudget, matchesMerchantImage,
  suggestPhoto, verifyLocalMerchantProductImage,
} from "./googleMerchantCoffeeFeedSource";
import { merchantProductImageUrl } from "./googleMerchantCoffeeLiveEvidence";
import {
  buildMerchantProductFeed, MAX_MERCHANT_PRODUCTS, merchantProductId,
  type MerchantExclusion, type MerchantProduct,
} from "./googleMerchantProductFeed";
import { CUSTOM_SECTION_IMAGE_LIMITS } from "./media";
import { priceOrderFromWebsiteData } from "./orderPricing";
import { resolveWorksProductListing } from "./productListing";
import { getCanonicalPublicSiteOrigin } from "./publicSiteOrigin";
import { getStorageRootContract, getWebsiteDataFile } from "./storagePaths";
import { isStoreCommerceEnabled } from "./storeCommerceCapability";
import { isStoreProductSlug } from "./storePublicMetadata";
import { selectPublicStoreIndex } from "./storePublicSelectors";
import { createStoreRepository } from "./storeRepository";
import type { StoreCatalog } from "./storeTypes";

type ImageBudget = ReturnType<typeof createMerchantImageBudget>;
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const MAX_IMAGE_PROBES = 5_000;

function sameSource(a: Awaited<ReturnType<typeof lstat>>, b: Awaited<ReturnType<typeof lstat>>) {
  return b.isFile() && !b.isSymbolicLink() && a.dev === b.dev && a.ino === b.ino &&
    a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}

// Check the exact file the live reader uses. In particular, Store's missing-file
// fallback must never become a successful empty snapshot.
async function sourceEvidence(file: string, budget: ImageBudget, readValue = false) {
  checkDeadline(budget);
  const before = await lstat(/* turbopackIgnore: true */ file);
  if (!before.isFile() || before.isSymbolicLink() || before.size < 2 || before.size > MAX_SOURCE_BYTES ||
      await realpath(/* turbopackIgnore: true */ file) !== file) throw new Error("merchant_source_path");
  const handle = await open(/* turbopackIgnore: true */ file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!sameSource(before, await handle.stat())) throw new Error("merchant_source_changed");
    const content = readValue ? Buffer.allocUnsafe(before.size) : null;
    const hash = createHash("sha256");
    let offset = 0;
    while (offset < before.size) {
      checkDeadline(budget);
      const { bytesRead } = await handle.read(budget.buffer, 0, Math.min(budget.buffer.length, before.size - offset), offset);
      if (!bytesRead) throw new Error("merchant_source_changed");
      const bytes = budget.buffer.subarray(0, bytesRead);
      hash.update(bytes);
      if (content) bytes.copy(content, offset);
      offset += bytesRead;
    }
    if (!sameSource(before, await handle.stat()) || !sameSource(before, await lstat(/* turbopackIgnore: true */ file)) ||
        await realpath(/* turbopackIgnore: true */ file) !== file) throw new Error("merchant_source_changed");
    return {
      version: [before.dev, before.ino, before.size, before.mtimeMs, before.ctimeMs, hash.digest("hex")].join(":"),
      value: content ? JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content)) as unknown : undefined,
    };
  } finally {
    await handle.close();
  }
}

function checkCoffeeCatalog(website: WebsiteData) {
  const products = website?.menu?.products;
  if (!Number.isSafeInteger(website?.version) || !Array.isArray(products) || products.length > MAX_MERCHANT_PRODUCTS ||
      products.some(product => !product || typeof product !== "object" || Array.isArray(product) ||
        (product.inMonthlyMenu !== undefined && typeof product.inMonthlyMenu !== "boolean"))) {
    throw new Error("merchant_coffee_source_invalid");
  }
}

function countKey(counts: Map<string, number>, key: unknown) {
  if (typeof key === "string") counts.set(key, (counts.get(key) ?? 0) + 1);
}

function coffeeCandidates(website: WebsiteData, exclusions: MerchantExclusion[], budget: ImageBudget) {
  const skuCounts = new Map<string, number>();
  const slugCounts = new Map<string, number>();
  const products = website.menu.products;
  let sourceSkuCount = 0;
  for (const product of products) {
    countKey(slugCounts, product.slug);
    const options = Array.isArray(product.skus) && product.skus.length ? product.skus : product.purchase;
    if (!Array.isArray(options)) continue;
    sourceSkuCount += options.length;
    if (sourceSkuCount > MAX_MERCHANT_PRODUCTS) throw new Error("merchant_coffee_sku_limit");
    for (const sku of options) countKey(skuCounts, sku?.id);
  }

  const candidates: MerchantProduct[] = [];
  for (const product of resolveWorksProductListing(products)) {
    checkDeadline(budget);
    const soldOut = product.status === "sold_out";
    if (typeof product.status !== "string" || !["active", "coming_soon", "sold_out"].includes(product.status) ||
        [product.active, product.purchasable].some(flag => flag !== undefined && typeof flag !== "boolean")) {
      exclusions.push({ item: product.slug, reason: "invalid_coffee_publication_state" });
      continue;
    }
    if (!soldOut && (product.active === false || product.purchasable === false)) continue;
    const items = Array.isArray(product.skus) ? product.skus.filter(sku => sku?.enabled !== false) : [];
    if (!items.length) {
      exclusions.push({ item: product.slug, reason: "missing_public_persisted_sku" });
      continue;
    }
    const photo = suggestPhoto(product);
    const description = [product.shortCopy, product.subtitle].find(value => typeof value === "string" && value.trim()) ?? "";
    for (const sku of items) {
      checkDeadline(budget);
      try {
        if (typeof product.id !== "string" || !sku || typeof sku.id !== "string" ||
            slugCounts.get(product.slug) !== 1 || skuCounts.get(sku.id) !== 1 ||
            typeof sku.detail !== "string" || !["beans", "drip"].includes(sku.kind ?? "") ||
            typeof sku.stock !== "number" || !Number.isSafeInteger(sku.stock) || sku.stock < 0) throw new Error("invalid_coffee_offer");
        const unitPrice = commerceOrderMoney(sku.price);
        const available = !soldOut && sku.stock > 0;
        validateUnifiedCartItem({
          domain: "coffee", productId: product.id, variantId: sku.id, slug: product.slug, name: product.name,
          unitPrice, quantity: 1, optionLabel: sku.label, optionDetail: sku.detail, coffeeOptions: { customRoast: false },
        });
        if (available) priceOrderFromWebsiteData(website, [{
          slug: product.slug, optionId: sku.id, optionLabel: sku.label, quotedUnitPrice: unitPrice, quantity: 1,
        }]);
        candidates.push({
          id: merchantProductId("coffee", product.id, sku.id), title: `${product.name} - ${sku.label}`,
          description, link: `${getCanonicalPublicSiteOrigin()}/works/${product.slug}?sku=${encodeURIComponent(sku.id)}`,
          images: photo ? [photo.path] : [], priceTwd: unitPrice, availability: available ? "in_stock" : "out_of_stock",
        });
      } catch {
        exclusions.push({ item: sku?.id ?? product.slug, reason: "invalid_coffee_offer" });
      }
    }
  }
  return candidates;
}

function storeCandidates(catalog: StoreCatalog, commerceEnabled: boolean, exclusions: MerchantExclusion[], budget: ImageBudget) {
  if ([catalog.products, catalog.sections, catalog.categories].some(rows => rows.length > MAX_MERCHANT_PRODUCTS)) {
    throw new Error("merchant_store_catalog_limit");
  }
  const sources = new Map(catalog.products.map(product => [product.slug, product]));
  const first = selectPublicStoreIndex(catalog).products;
  const candidates: MerchantProduct[] = [];
  for (let page = 1; page <= first.totalPages; page++) {
    checkDeadline(budget);
    const cards = page === 1 ? first.items : selectPublicStoreIndex(catalog, { page }).products.items;
    for (const product of cards) {
      const source = sources.get(product.slug);
      if (!source) throw new Error("merchant_store_projection_mismatch");
      if (!commerceEnabled || source.sku === "GIFT-CUSTOM" ||
          (source.productType === "gift" && product.category?.slug === "custom-gift")) {
        exclusions.push({ item: source.sku, reason: !commerceEnabled ? "store_commerce_disabled" : "inquiry_only" });
        continue;
      }
      try {
        if (!isStoreProductSlug(product.slug) || !Number.isSafeInteger(source.inventory) || source.inventory < 0 ||
            typeof source.sku !== "string" || !source.sku.trim()) throw new Error("invalid_store_offer");
        // Mirrors the public Store offer and transaction resolver, with the same integer-TWD contract.
        const unitPrice = commerceOrderMoney(product.salePrice !== undefined && product.salePrice < product.price ?
          product.salePrice : product.price);
        validateUnifiedCartItem({
          domain: "store", productId: source.id, variantId: "default", slug: product.slug,
          name: product.name, sku: source.sku, unitPrice, quantity: 1,
        });
        const images = [product.heroMedia, ...source.gallery].flatMap(media => media?.type === "image" ? [media.url] : []);
        candidates.push({
          id: merchantProductId("store", source.id, source.sku), title: product.name,
          description: product.shortDescription.trim() || source.description, images, priceTwd: unitPrice,
          link: `${getCanonicalPublicSiteOrigin()}/store/${product.slug}`,
          availability: product.inStock ? "in_stock" : "out_of_stock",
        });
      } catch {
        exclusions.push({ item: source.sku, reason: "invalid_store_offer" });
      }
    }
  }
  return candidates;
}

function cloudinaryImage(raw: string) {
  const account = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  if (!account || !/^[\w-]+$/u.test(account) || !raw.startsWith("https://res.cloudinary.com/") ||
      /[\\%?#\s\u0000-\u001f\u007f]|\/\.{1,2}(?:\/|$)/u.test(raw)) return null;
  const url = new URL(raw);
  const prefix = `/${account}/image/upload/`;
  // Only original versioned uploads from this store's account, never redirects or transformations.
  return url.pathname.startsWith(prefix) &&
    /^v\d+\/(?:[\w-]+\/)*[\w.-]+\.(?:jpe?g|png|webp|gif|avif)$/iu.test(url.pathname.slice(prefix.length)) ? url.href : null;
}

async function hashCloudinaryImage(url: string, budget: ImageBudget) {
  checkDeadline(budget);
  const response = await fetch(url, {
    redirect: "manual", cache: "no-store", credentials: "omit",
    signal: AbortSignal.timeout(Math.max(1, Math.ceil(budget.deadline - performance.now()))),
  });
  const body = response.body;
  if (!body) return null;
  const reader = body.getReader();
  try {
    const mime = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (response.status !== 200 || !mime || !/^image\/(?:jpeg|png|webp|gif|avif)$/u.test(mime)) return null;
    let size = 0;
    const start = Buffer.alloc(12);
    const hash = createHash("sha256");
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chargeMerchantImageBytes(budget, value.byteLength);
      start.set(value.subarray(0, Math.max(0, start.length - size)), Math.min(start.length, size));
      size += value.byteLength;
      if (size > CUSTOM_SECTION_IMAGE_LIMITS.maxBytes) return null;
      hash.update(value);
    }
    if (size < start.length || !matchesMerchantImage(url, start)) return null;
    return hash.digest("hex");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function generateFeed() {
  const budget = createMerchantImageBudget();
  const storage = getStorageRootContract();
  if (storage.source === "local") throw new Error("merchant_persistent_source_required");
  const storeCommerce = isStoreCommerceEnabled();
  const coffeeFile = getWebsiteDataFile();
  const storeFile = path.join(storage.root, "store-domain", "catalog.json");
  const initialCoffee = await sourceEvidence(coffeeFile, budget, true);
  const initialStore = await sourceEvidence(storeFile, budget, true);
  const [website, catalog] = await Promise.all([getLiveWebsiteData(), createStoreRepository().read()]);
  if (!isDeepStrictEqual(website, initialCoffee.value) || !isDeepStrictEqual(catalog, initialStore.value)) {
    throw new Error("merchant_source_reader_mismatch");
  }
  checkCoffeeCatalog(website);

  const exclusions: MerchantExclusion[] = [];
  const products = [...coffeeCandidates(website, exclusions, budget), ...storeCandidates(catalog, storeCommerce, exclusions, budget)];
  const images = new Map<string, () => Promise<void>>();
  const checkedUrls = new Set<string>();
  const result = await buildMerchantProductFeed(products, async raw => {
    checkDeadline(budget);
    const local = merchantProductImageUrl(raw);
    const url = local ?? cloudinaryImage(raw);
    if (!url || checkedUrls.has(url) && !images.has(url)) return null;
    if (images.has(url)) return url;
    checkedUrls.add(url);
    if (checkedUrls.size > MAX_IMAGE_PROBES) throw new Error("merchant_image_probe_limit");
    if (local) {
      const image = await verifyLocalMerchantProductImage(url, budget);
      if (!image) return null;
      images.set(url, image.recheck);
    } else {
      const initialHash = await hashCloudinaryImage(url, budget);
      if (!initialHash) return null;
      images.set(url, async () => {
        if (await hashCloudinaryImage(url, budget) !== initialHash) throw new Error("merchant_image_changed");
      });
    }
    return url;
  }, exclusions);

  for (const recheck of images.values()) await recheck();
  if ((await sourceEvidence(coffeeFile, budget)).version !== initialCoffee.version ||
      (await sourceEvidence(storeFile, budget)).version !== initialStore.version ||
      !isDeepStrictEqual(getStorageRootContract(), storage) || storeCommerce !== isStoreCommerceEnabled()) {
    throw new Error("merchant_source_changed");
  }
  checkDeadline(budget);
  if (exclusions.length) {
    const reasons = new Map<string, number>();
    for (const entry of exclusions) reasons.set(entry.reason, (reasons.get(entry.reason) ?? 0) + 1);
    console.warn("[merchant-product-feed] exclusions", { reasons: Object.fromEntries(reasons),
      items: exclusions.slice(0, 50).map(entry => ({ item: String(entry.item ?? "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120), reason: entry.reason })) });
  }
  return { ...result, exclusions };
}

// One bounded full snapshot per process at a time, discarded as soon as it completes.
let inFlight: ReturnType<typeof generateFeed> | undefined;
export function readLiveMerchantProductFeed() {
  inFlight ??= generateFeed().finally(() => { inFlight = undefined; });
  return inFlight;
}
