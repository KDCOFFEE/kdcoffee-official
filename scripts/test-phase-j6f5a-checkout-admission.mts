import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { admitCommerceCheckout, type TrustedCheckoutIdentity } from "../lib/commerceCheckoutAdmission";
import { createStoreRepository } from "../lib/storeRepository";
import { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules } from "../lib/membershipBusinessRules";

const timestamp = "2026-10-12T06:37:00.000Z", now = new Date(timestamp);
const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6f5a-admission-"));
const tempParent = await fs.realpath(os.tmpdir());
assert.equal(path.dirname(await fs.realpath(root)).toLowerCase(), tempParent.toLowerCase());
const savedEnv = Object.fromEntries(["KD_DATA_DIR", "RAILWAY_VOLUME_MOUNT_PATH", "STORE_COMMERCE_ENABLED"].map(key => [key, process.env[key]]));
process.env.KD_DATA_DIR = root;
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.STORE_COMMERCE_ENABLED = "true";
const originalFetch = globalThis.fetch;
let notificationCalls = 0;
globalThis.fetch = async () => { notificationCalls++; throw new Error("No external effects allowed"); };
const member: TrustedCheckoutIdentity = { member: { id: "trusted-member", lineUserId: "trusted-line", displayName: "Trusted Member" } };
const guest: TrustedCheckoutIdentity = { member: null, guestOrderAccess: {
  tokenHash: createHash("sha256").update("isolated-existing-guest-token").digest("base64url"), createdAt: timestamp } };
type Request = Record<string, unknown> & { items: Record<string, unknown>[]; studioPickup: { preferredDate: string } };
function request(mode: "coffee" | "store" | "mixed" = "mixed"): Request {
  const coffee = { domain: "coffee", productId: "coffee-product", variantId: "coffee-sku", quantity: 2,
    coffeeOptions: { preparation: "咖啡豆", customRoast: false }, quotedUnitPrice: 500 };
  const store = { domain: "store", productId: "store-product", variantId: "default", quantity: 2, quotedUnitPrice: 50 };
  return { idempotencyKey: randomUUID(), items: mode === "coffee" ? [coffee] : mode === "store" ? [store] : [coffee, store],
    orderMode: "studio_pickup", customer: { name: "Fixture", phone: "0912345678", email: "", note: "" },
    studioPickup: { preferredDate: "2026-10-16" }, payment: "pickup_confirmation", requestedCredit: 0, creditApplied: 0 };
}
const websiteFile = path.join(root, "store", "website-data.json");
const website = { version: 1, menu: { products: [{ id: "coffee-product", slug: "coffee-live", name: "Coffee",
  active: true, purchasable: true, purchase: [], skus: [{ id: "coffee-sku", label: "半磅咖啡豆", detail: "227g",
    kind: "beans", price: 500, stock: 20, enabled: true, pvEnabled: true, pvValue: 30 }] }] } };
const repo = createStoreRepository({ dataRoot: root, now: () => now });
let tests = 0;
async function snapshot() {
  const files: [string, string][] = [];
  async function visit(dir: string) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(file);
      else { assert.ok(entry.isFile()); files.push([path.relative(root, file), createHash("sha256").update(await fs.readFile(file)).digest("hex")]); }
    }
  }
  await visit(root);
  files.sort((a, b) => a[0].localeCompare(b[0]));
  return { files, orders: (await fs.readdir(path.join(root, "orders"))).filter(name => name.endsWith(".json")).length };
}
async function check(label: string, input: Request, kind: string, reason?: string,
  identity: TrustedCheckoutIdentity = member, at = now) {
  const before = await snapshot(), original = structuredClone(input), originalIdentity = structuredClone(identity);
  try {
    const result = await admitCommerceCheckout(input, identity, at);
    assert.equal(result.kind, kind, JSON.stringify(result));
    if (reason) { assert.ok("reason" in result); assert.equal(result.reason, reason); }
    if (result.kind === "PROTOCOL_V1_ELIGIBLE") {
      assert.equal(result.candidate.request.items.length, input.items.length);
      assert.deepEqual(result.candidate.request.items.map(item => item.domain), input.items.map(item => item.domain));
      assert.equal(result.candidate.request.orderContext.creditApplied, 0);
      assert.ok(!Object.hasOwn(result.candidate.request.orderContext, "subscriptionIntent"));
      assert.equal(result.candidate.merchandiseSubtotal, input.items.reduce((sum, item) => sum + Number(item.quotedUnitPrice) * Number(item.quantity), 0));
      assert.equal(result.candidate.ownership.kind, identity.member ? "member" : "guest");
      if (result.candidate.ownership.kind === "member") assert.deepEqual(result.candidate.ownership.member,
        { memberId: "trusted-member", lineUserId: "trusted-line", lineDisplayName: "Trusted Member" });
      else assert.deepEqual(result.candidate.ownership.guestOrderAccess, guest.guestOrderAccess);
      assert.equal(result.candidate.rulesVersion, label === "standard lead-time boundary uses Taipei date" ? 1 : 2);
      assert.ok(result.candidate.request.items.every(item => !Object.hasOwn(item, "quotedUnitPrice")));
      assert.ok(!JSON.stringify(result.candidate).includes("pvValue"));
    }
    assert.deepEqual(await snapshot(), before, "All order/inventory/ledger/fulfillment/reward/subscription/rule/receipt files must remain byte-identical");
    assert.equal(notificationCalls, 0);
    assert.deepEqual(input, original, "Do not strip lines, intent or mutate caller input");
    assert.deepEqual(identity, originalIdentity);
    tests++;
    console.log("PASS " + tests + " " + label + " [full-storage/order-count unchanged; notifications=0]");
  } catch (error) { console.error("FAIL " + label); throw error; }
}
try {
  await fs.mkdir(path.dirname(websiteFile), { recursive: true });
  await fs.mkdir(path.join(root, "orders"), { recursive: true });
  await fs.writeFile(websiteFile, JSON.stringify(website));
  await repo.createSection({ id: "section", name: "Equipment", slug: "equipment", published: true });
  await repo.createProduct({ id: "store-product", sectionId: "section", slug: "store-live", name: "Store",
    sku: "DISPLAY", price: 50, inventory: 20, pvValue: 999, published: true });
  const rules = structuredClone(DEFAULT_MEMBERSHIP_RULES);
  rules.pickup.preparationLeadDays = 2;
  rules.pickup.customRoastPreparationLeadDays = 5;
  rules.pickup.blockedDates = ["2026-10-20"];
  await saveMembershipBusinessRules({ expectedRevision: 0, rules, effectiveAt: timestamp, now }, path.join(root, "membership-commerce", "business-rules.json"));
  await fs.writeFile(path.join(root, "membership-commerce", "commerce-state.json"),
    JSON.stringify({ creditEntries: { fixture: { amount: 100 } }, creditReservations: {},
      referralRewards: { fixture: { status: "scheduled" } }, subscriptions: { fixture: { status: "active" } },
      subscriptionCycles: {}, notifications: {}, validConsumptionEvents: {} }));
  await fs.mkdir(path.join(root, "fulfillment"), { recursive: true });
  await fs.writeFile(path.join(root, "fulfillment", "state.json"), JSON.stringify({ revision: 1, records: {} }));

  for (const mode of ["coffee", "store", "mixed"] as const) await check(mode + " studio credit0 candidate", request(mode), "PROTOCOL_V1_ELIGIBLE");
  for (const mode of ["store", "mixed"] as const) {
    for (const flag of [undefined, "false", "TRUE", "1"]) {
      if (flag === undefined) delete process.env.STORE_COMMERCE_ENABLED; else process.env.STORE_COMMERCE_ENABLED = flag;
      await check(mode + " exact capability disabled (" + flag + ")", request(mode), "REJECTED", "STORE_COMMERCE_DISABLED");
    }
  }
  process.env.STORE_COMMERCE_ENABLED = "true";
  for (const mode of ["coffee", "store", "mixed"] as const) {
    for (const field of ["requestedCredit", "creditApplied"]) {
      const input = request(mode); input[field] = 1;
      await check(mode + " positive " + field, input, mode === "coffee" ? "LEGACY_COFFEE_REQUIRED" : "REJECTED",
        mode === "coffee" ? "COFFEE_CREDIT" : "STORE_CREDIT_NOT_SUPPORTED");
    }
    for (const intent of [{ consent: true, intervalDays: 30 }, null, undefined]) {
      const input = request(mode); input.subscriptionIntent = intent;
      await check(mode + " subscription field presence (" + String(intent) + ")", input,
        mode === "coffee" ? "LEGACY_COFFEE_REQUIRED" : "REJECTED",
        mode === "coffee" ? "COFFEE_SUBSCRIPTION" : "STORE_SUBSCRIPTION_NOT_SUPPORTED");
    }
    for (const delivery of ["711_cod", "home_delivery"]) {
      const input = request(mode); input.orderMode = delivery;
      await check(mode + " " + delivery, input, mode === "coffee" ? "LEGACY_COFFEE_REQUIRED" : "REJECTED",
        mode === "coffee" ? "COFFEE_DELIVERY_MODE" : "MODE_NOT_SUPPORTED");
    }
  }
  for (const date of ["invalid", "2026-02-30", "", "2026-13-01"]) {
    const input = request(); input.studioPickup.preferredDate = date;
    await check("invalid pickup " + date, input, "REJECTED", "INVALID_PICKUP_DATE");
  }
  for (const [date, reason] of [["2026-10-20", "PICKUP_DATE_BLOCKED"], ["2026-10-13", "PICKUP_TOO_EARLY"]]) {
    const input = request(); input.studioPickup.preferredDate = date;
    await check("canonical pickup policy " + date, input, "REJECTED", reason);
  }
  for (const date of ["2026-10-16", "2026-10-17"]) {
    const input = request(); input.items[0].quantity = 4;
    input.items[0].coffeeOptions = { preparation: "咖啡豆", customRoast: true, roastLevel: "中焙", roastNote: "" };
    input.studioPickup.preferredDate = date;
    await check("custom roast lead-time " + date, input, date === "2026-10-16" ? "REJECTED" : "PROTOCOL_V1_ELIGIBLE",
      date === "2026-10-16" ? "PICKUP_TOO_EARLY" : undefined);
  }
  for (const mode of ["coffee", "store", "mixed"] as const) {
    const input = request(mode); input.items.at(-1)!.quotedUnitPrice = 1;
    await check(mode + " stale quote rejects whole cart", input, "REJECTED", "PRICE_CHANGED");
  }
  for (const domain of ["cookie", "", undefined]) {
    const input = request(); input.items[1].domain = domain;
    await check("unknown/missing explicit domain " + domain, input, "REJECTED", "UNKNOWN_DOMAIN");
  }
  for (const bad of [0.5, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "0", null]) {
    for (const field of ["requestedCredit", "creditApplied"]) {
      const input = request(); input[field] = bad;
      await check("invalid money " + field + "=" + String(bad), input, "REJECTED", "INVALID_MONEY");
    }
    const input = request(); input.items[0].quotedUnitPrice = bad;
    await check("invalid quote money=" + String(bad), input, "REJECTED", "INVALID_MONEY");
  }
  const gift = request(); gift.orderMode = "corporate_gift";
  await check("corporate gift stays outside merchandise admission", gift, "REJECTED", "OUTSIDE_MERCHANDISE_ADMISSION");
  await check("trusted member ownership", request(), "PROTOCOL_V1_ELIGIBLE", undefined, member);
  await check("trusted guest persisted ownership", request(), "PROTOCOL_V1_ELIGIBLE", undefined, guest);
  for (const identity of [{}, { member: member.member, guestOrderAccess: guest.guestOrderAccess },
    { member: { id: "" } }, { guestOrderAccess: { tokenHash: "invalid", createdAt: timestamp } },
    { guestOrderAccess: { tokenHash: guest.guestOrderAccess!.tokenHash, createdAt: "invalid" } }]) {
    await check("invalid exclusive ownership " + JSON.stringify(identity), request(), "REJECTED", "INVALID_IDENTITY", identity);
  }
  for (const field of ["memberId", "member", "guestOrderAccess"]) {
    const input = request(); input[field] = field === "memberId" ? "forged-member" : { tokenHash: "forged", id: "forged-member" };
    await check("client cannot assert " + field, input, "REJECTED", "INVALID_REQUEST");
  }
  const unsupportedPayment = request(); unsupportedPayment.payment = "cash_on_delivery";
  await check("studio incompatible payment", unsupportedPayment, "REJECTED", "PAYMENT_NOT_SUPPORTED");
  const earlyBoundary = request(); earlyBoundary.studioPickup.preferredDate = "2026-10-14";
  await check("standard lead-time boundary uses Taipei date", earlyBoundary, "PROTOCOL_V1_ELIGIBLE", undefined, member, new Date("2026-10-11T16:01:00Z"));
  website.menu.products[0].skus[0].price = 500.5;
  await fs.writeFile(websiteFile, JSON.stringify(website));
  await check("fractional authoritative Coffee price", request("coffee"), "REJECTED", "PRICE_RESOLUTION_FAILED");
  website.menu.products[0].skus[0].price = 500;
  await fs.writeFile(websiteFile, JSON.stringify(website));
  const catalogFile = path.join(root, "store-domain", "catalog.json");
  const validCatalog = await fs.readFile(catalogFile, "utf8"), fractionalCatalog = JSON.parse(validCatalog);
  fractionalCatalog.products[0].price = 50.5;
  await fs.writeFile(catalogFile, JSON.stringify(fractionalCatalog));
  await check("fractional authoritative Store price", request("store"), "REJECTED", "PRICE_RESOLUTION_FAILED");
  await fs.writeFile(catalogFile, validCatalog);
  website.menu.products[0].skus[0].price = 0;
  await fs.writeFile(websiteFile, JSON.stringify(website));
  const zero = request("coffee"); zero.items[0].quotedUnitPrice = 0;
  await check("zero TWD is valid", zero, "PROTOCOL_V1_ELIGIBLE");
  website.menu.products[0].skus[0].price = 500;
  await fs.writeFile(websiteFile, JSON.stringify(website));
  const staleAfterUpdate = request("coffee");
  website.menu.products[0].skus[0].price = 600;
  await fs.writeFile(websiteFile, JSON.stringify(website));
  await check("fresh authoritative source detects server repricing", staleAfterUpdate, "REJECTED", "PRICE_CHANGED");
  website.menu.products[0].skus[0].price = 500;
  await fs.writeFile(websiteFile, JSON.stringify(website));
  website.menu.products[0].skus[0].stock = 0;
  await fs.writeFile(websiteFile, JSON.stringify(website));
  await check("Coffee stock unavailable rejects", request(), "REJECTED", "OUT_OF_STOCK");
  website.menu.products[0].skus[0].stock = 20;
  await fs.writeFile(websiteFile, JSON.stringify(website));
  for (const update of [{ published: false }, { published: false, active: false }, { published: true, active: true, inventory: 0 }]) {
    const revision = (await repo.read()).products.find(product => product.id === "store-product")!.revision;
    await repo.updateProduct("store-product", revision, update);
    await check("Store current lifecycle/stock " + JSON.stringify(update), request(), "REJECTED",
      "inventory" in update ? "OUT_OF_STOCK" : "PRODUCT_UNAVAILABLE");
  }
  console.log("J.6F.5A PASS " + tests + "/" + tests + "; every case checked all fixture file hashes, order counts and notificationCalls=0");
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  assert.equal(path.dirname(await fs.realpath(root)).toLowerCase(), tempParent.toLowerCase());
  await fs.rm(root, { recursive: true, force: true });
}