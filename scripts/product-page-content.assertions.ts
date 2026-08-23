import assert from "node:assert/strict";
import { LEGACY_CLEAN_ROASTING_PROOFS, resolveProductPageContent } from "../lib/productPageContent";
import {
  PRODUCT_PAGE_CONTENT_MAX_PROOFS,
  ProductPageContentValidationError,
  normalizeProductPageContent,
} from "../lib/productPageContentValidation";

const baseProduct = {
  slug: "future-coffee",
  name: "Future Coffee",
  artist: "FUTURE ARTIST",
  shortCopy: "Current product copy",
  mood: "Current story",
  origin: "Taiwan",
  process: "Washed",
  roast: "Light",
  flavors: ["Floral", "Citrus"],
  relatedProducts: { title: "Current related heading", productIds: [] },
  skus: [{ id: "future-01", label: "Beans", detail: "227g", price: 700, stock: 4 }],
};

const legacy = resolveProductPageContent(baseProduct);
assert.deepEqual(legacy["clean-roasting"].proofs, LEGACY_CLEAN_ROASTING_PROOFS);
assert.equal(new Set(legacy["clean-roasting"].proofs.map((proof) => proof.id)).size, legacy["clean-roasting"].proofs.length);

const headingOverride = resolveProductPageContent({ ...baseProduct, productPageContent: { "clean-roasting": { heading: "Override heading" } } });
assert.equal(headingOverride["clean-roasting"].heading, "Override heading");

const emptyOverride = resolveProductPageContent({ ...baseProduct, productPageContent: { "clean-roasting": { heading: "   " } } });
assert.equal(emptyOverride["clean-roasting"].heading, "乾淨的烘焙");

const proofOverride: Array<{ id: string; icon: "air" | "heat" | "cupping"; title: string; body: string }> = LEGACY_CLEAN_ROASTING_PROOFS.map((proof) => ({ ...proof }));
proofOverride[1] = { ...proofOverride[1], body: "Only proof 02 changed" };
const changedProof = resolveProductPageContent({ ...baseProduct, productPageContent: { "clean-roasting": { proofs: proofOverride } } });
assert.equal(changedProof["clean-roasting"].proofs[0].body, LEGACY_CLEAN_ROASTING_PROOFS[0].body);
assert.equal(changedProof["clean-roasting"].proofs[1].body, "Only proof 02 changed");
assert.equal(changedProof["clean-roasting"].proofs[2].body, LEGACY_CLEAN_ROASTING_PROOFS[2].body);

const sanitized = normalizeProductPageContent({ unknown: { heading: "discard" }, campaigns: { heading: "Campaign frame", records: [{ title: "must not copy" }] } });
assert.deepEqual(sanitized, { campaigns: { heading: "Campaign frame" } });

assert.throws(
  () => normalizeProductPageContent({ "clean-roasting": { proofs: Array.from({ length: PRODUCT_PAGE_CONTENT_MAX_PROOFS + 1 }, (_, index) => ({ id: `proof-${index + 1}`, title: "Title", body: "Body" })) } }),
  ProductPageContentValidationError,
);

const beforeCommerce = JSON.stringify(baseProduct.skus);
resolveProductPageContent({ ...baseProduct, productPageContent: { campaigns: { heading: "Product campaigns" } } });
assert.equal(JSON.stringify(baseProduct.skus), beforeCommerce);
assert.equal(baseProduct.skus[0].price, 700);

const futureProduct = resolveProductPageContent({ ...baseProduct, slug: "not-in-any-product-map", productPageContent: { "flavor-notes": { heading: "Future flavors" } } });
assert.equal(futureProduct["flavor-notes"].heading, "Future flavors");
assert.equal(futureProduct["related-products"].heading, "Current related heading");

console.log("Product page content assertions passed.");
