import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { WebsiteData } from "../data/websiteData";
import {
  OrderPriceConflictError,
  priceOrderFromWebsiteData,
} from "../lib/orderPricing";
import {
  createIdempotencyRequestHash,
  isValidIdempotencyKey,
} from "../lib/orderIdempotency";

const root = process.cwd();
const website = JSON.parse(
  await readFile(path.join(root, "public/data/website-data.json"), "utf8"),
) as WebsiteData;

const product = website.menu.products.find((entry) => {
  const options = Array.isArray(entry.skus) && entry.skus.length ? entry.skus : entry.purchase;
  return entry.active !== false
    && entry.purchasable !== false
    && entry.status !== "hidden"
    && entry.status !== "sold_out"
    && Array.isArray(options)
    && options.some((option) => option.enabled !== false && Number(option.stock ?? 1) > 0);
});
assert(product, "A purchasable live-catalog product is required for the regression test");

const options = Array.isArray(product.skus) && product.skus.length ? product.skus : product.purchase;
const option = options.find((entry) => entry.enabled !== false && Number(entry.stock ?? 1) > 0);
assert(option, "The selected product must have an enabled in-stock option");

const requestItem = {
  slug: product.slug,
  optionId: option.id,
  optionLabel: option.label,
  quotedUnitPrice: Number(option.price),
  quantity: 1,
};
const result = priceOrderFromWebsiteData(website, [requestItem]);
assert.equal(result.priced.items.length, 1);
assert.equal(result.priced.items[0].unitPrice, Number(option.price));
assert.equal(result.priced.subtotal, Number(option.price));
assert.equal(result.priced.shipping, Number(option.price) >= 1500 ? 0 : 60);
assert.equal(result.priced.total, result.priced.subtotal + result.priced.shipping);

assert.throws(
  () => priceOrderFromWebsiteData(website, [{ ...requestItem, quotedUnitPrice: Number(option.price) + 1 }]),
  OrderPriceConflictError,
  "Checkout must reject a stale or manipulated client price",
);

const idempotencyKey = "8b992ad8-cf29-4e45-9f43-99687d444316";
assert.equal(isValidIdempotencyKey(idempotencyKey), true);
assert.equal(isValidIdempotencyKey("not-a-uuid"), false);
const baseRequest = { items: [requestItem], deliveryMethod: "pickup" };
assert.equal(createIdempotencyRequestHash(baseRequest), createIdempotencyRequestHash(baseRequest));
assert.notEqual(
  createIdempotencyRequestHash(baseRequest),
  createIdempotencyRequestHash({ ...baseRequest, subscriptionIntent: { intervalDays: 30 } }),
  "Subscription intent must participate in duplicate-request detection",
);

const checkoutSource = await readFile(path.join(root, "app/checkout/page.tsx"), "utf8");
const orderRouteSource = await readFile(path.join(root, "app/api/orders/route.ts"), "utf8");
const cartSource = await readFile(path.join(root, "components/commerce/CartProvider.tsx"), "utf8");

assert.match(checkoutSource, /subscriptionIntent/);
assert.match(checkoutSource, /intervalDays/);
assert.match(checkoutSource, /firstRenewalDate/);
assert.match(checkoutSource, /original price|原價/i);
assert.match(orderRouteSource, /memberId:\s*member\.id/);
assert.match(orderRouteSource, /subscriptionIntent/);
assert.match(orderRouteSource, /createIdempotencyRequestHash/);
assert.match(cartSource, /roastLevel/);
assert.match(cartSource, /preparationLabel/);

console.log("Order/cart/checkout regression PASS (20 assertions)");
