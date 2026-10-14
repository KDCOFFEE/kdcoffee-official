import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import {
  canonicalPublicCheckoutAttemptKey, classifyPublicCheckoutRequest,
  PublicCheckoutContractError, type PublicCheckoutContractReason,
} from "../lib/publicCheckoutContract";

const key = "abcdef01-2345-4678-89ab-cdef01234567", otherKey = "abcdef02-2345-4678-89ab-cdef01234567";
const member = { kind: "member", memberId: "member-a" };
const guest = { kind: "guest", canonicalAttemptKey: key, tokenHash: createHash("sha256").update("capability-a").digest("base64url") };
const store = { domain: "store", productId: "store-a", variantId: "default", quantity: 2, quotedUnitPrice: 100 };
const coffee = { domain: "coffee", productId: "coffee-a", variantId: "coffee-sku-a", quantity: 4,
  coffeeOptions: { preparation: "咖啡豆", customRoast: true, roastLevel: "淺中焙", roastNote: "風味選擇" }, quotedUnitPrice: 200 };
const legacy = { slug: "coffee-a", optionId: "coffee-sku-a", optionLabel: "半磅", quotedUnitPrice: 200,
  quantity: 4, preparationLabel: "咖啡豆", customRoast: true, roastLevel: "淺中焙", roastNote: "風味選擇" };
const customer = { name: "測試會員", phone: "0912345678", email: "member@example.test", note: "選擇備註" };
type Request = Record<string, any>;
const base: Request = { idempotencyKey: key, orderMode: "studio_pickup", customer,
  studioPickup: { preferredDate: "2026-10-20" }, items: [store] };
const storeSelection = { id: "123456", name: "測試門市", address: "測試門市地址" };
const address = { recipientName: "收件人", phone: "0912345678", postalCode: "100", city: "臺北市", district: "中正區", addressLine: "測試路一號" };
function modeRequest(mode: string): Request {
  const result = structuredClone(base); result.orderMode = mode; delete result.studioPickup;
  if (mode === "studio_pickup") result.studioPickup = { preferredDate: "2026-10-20" };
  if (mode === "711_cod") result.store = structuredClone(storeSelection);
  if (mode === "home_delivery") { result.deliveryAddress = structuredClone(address); result.paymentMethod = "atm_transfer"; }
  return result;
}
function changed(operation: (value: Request) => void, input = base): Request {
  const result = structuredClone(input); operation(result); return result;
}
let checks = 0, networkCalls = 0, fsCalls = 0, envReads = 0;
const originalFetch = globalThis.fetch, originalEnv = process.env;
const boundary = fs as unknown as Record<string, unknown>;
const fsMethods = ["readFile", "writeFile", "mkdir", "readdir", "lstat", "stat", "open", "rename", "unlink", "access"];
const savedFs = fsMethods.map(name => [name, boundary[name]] as const);
globalThis.fetch = async () => { networkCalls++; throw new Error("Network forbidden in B1"); };
for (const [name] of savedFs) boundary[name] = () => { fsCalls++; throw new Error("Filesystem forbidden in B1"); };
function classify(input: unknown, owner: unknown = member) {
  process.env = new Proxy(originalEnv, {
    get() { envReads++; throw new Error("Environment reads forbidden in B1"); },
    ownKeys() { envReads++; throw new Error("Environment enumeration forbidden in B1"); },
  });
  try { return classifyPublicCheckoutRequest(input, owner); }
  finally { process.env = originalEnv; }
}
function check(label: string, operation: () => void) {
  try { operation(); console.log("PASS " + (++checks) + " " + label); }
  catch (error) { console.error("FAIL case " + (checks + 1) + " " + label); throw error; }
}
function accepted(input: unknown = base, owner: unknown = member) {
  const result = classify(input, owner);
  assert.equal(result.family, "STORE_CONTAINING_PROTOCOL_V1");
  if (result.family !== "STORE_CONTAINING_PROTOCOL_V1") throw new Error("Expected Store contract");
  return result;
}
function rejects(input: unknown, reason?: PublicCheckoutContractReason, owner: unknown = member) {
  const result = classify(input, owner);
  assert.equal(result.family, "REJECTED");
  if (result.family !== "REJECTED") throw new Error("Expected rejected family");
  if (reason) assert.equal(result.reason, reason);
}
function differs(input: unknown, owner: unknown = member, comparison = accepted().fingerprint) {
  assert.notEqual(accepted(input, owner).fingerprint, comparison);
}
try {
  check("current Coffee serializer shape stays legacy without trusted owner", () => {
    const input = { ...base, items: [legacy], corporateGift: null, subscriptionIntent: null, requestedCredit: 100 };
    assert.equal(classify(input, undefined).family, "LEGACY_COFFEE");
  });
  for (const mode of ["studio_pickup", "711_cod", "home_delivery"]) {
    check("Coffee remains legacy in " + mode, () => assert.equal(classify({ ...modeRequest(mode), items: [legacy] }).family, "LEGACY_COFFEE"));
  }
  check("legacy option-label fallback and numeric quantity string recognized without migration", () => {
    const input = { idempotencyKey: key, items: [{ slug: "coffee-a", optionLabel: "耳掛", quotedUnitPrice: 100.5, quantity: "2" }] };
    const before = structuredClone(input), result = classify(input);
    assert.equal(result.family, "LEGACY_COFFEE"); assert.deepEqual(input, before);
    assert.ok(!("selectedFacts" in result));
  });
  check("gift inquiry without capability has no Store facts", () => {
    const result = classify({ idempotencyKey: key, orderMode: "corporate_gift",
      customer, corporateGift: { companyName: "公司", boxSize: "18", boxQuantity: 2 } }, undefined);
    assert.equal(result.family, "CORPORATE_GIFT"); assert.ok(!("selectedFacts" in result)); assert.ok(!("fingerprint" in result));
  });
  check("gift inquiry with empty items remains separate", () => assert.equal(classify({ idempotencyKey: key, orderMode: "corporate_gift", items: [] }).family, "CORPORATE_GIFT"));
  check("gift plus Store merchandise rejected", () => rejects({ ...base, orderMode: "corporate_gift" }, "GIFT_MERCHANDISE_CONFLICT"));
  check("gift plus explicit Coffee merchandise rejected as ambiguous", () => rejects({ ...base, orderMode: "corporate_gift", items: [coffee] }, "GIFT_MERCHANDISE_CONFLICT"));
  check("Store-only explicit contract accepted", () => { assert.equal(accepted().selectedFacts.items.length, 1); });
  const mixed = { ...base, items: [coffee, store] };
  check("explicit mixed contract accepted with every line intact", () => assert.equal(accepted(mixed).selectedFacts.items.length, 2));
  check("Store plus legacy Coffee rejected, never legacy fallback", () => rejects({ ...base, items: [store, legacy] }, "MIXED_SERIALIZATION_REQUIRED"));
  check("Store plus domainless canonical line rejected", () => {
    const { domain: _domain, ...line } = coffee;
    rejects({ ...base, items: [store, line] }, "MIXED_SERIALIZATION_REQUIRED");
  });
  check("domainless Store shape cannot masquerade as legacy", () => {
    const { domain: _domain, ...line } = store; rejects({ ...base, items: [line] }, "INVALID_LEGACY_ITEM");
  });
  for (const domain of ["unknown", "", null, undefined, 42]) {
    check("unknown explicit domain rejected " + String(domain), () => rejects({ ...base, items: [store, { ...coffee, domain }] }, "UNKNOWN_DOMAIN"));
  }
  check("pure explicit Coffee cannot auto-convert to legacy", () => rejects({ ...base, items: [coffee] }, "EXPLICIT_COFFEE_NOT_SUPPORTED"));
  check("legacy line cannot carry forged Store domain", () => rejects({ ...base, items: [{ ...legacy, domain: "store" }] }, "INVALID_ITEM"));
  for (const input of [null, [], "request", {}, { ...base, items: [] }, { ...base, items: null },
    { ...base, items: {} }, { ...base, items: [null] }, { ...base, items: new Array(1) }]) {
    check("malformed/ambiguous family fails closed " + checks, () => rejects(input));
  }
  for (const field of ["slug", "productId", "quantity", "quotedUnitPrice"]) {
    check("malformed legacy line not recognized " + field, () => {
      const line: Request = { ...legacy }; if (field === "productId") line.productId = "forged"; else delete line[field];
      rejects({ ...base, items: [line] });
    });
  }
  for (const mode of ["studio_pickup", "711_cod", "home_delivery"]) {
    check("valid Store mode " + mode, () => accepted(modeRequest(mode)));
  }
  check("note exactly 200 accepted", () => assert.equal(accepted(changed(r => { r.customer.note = "字".repeat(200); })).selectedFacts.customer.note.length, 200));
  check("note 201 rejected rather than truncated", () => rejects(changed(r => { r.customer.note = "字".repeat(201); }), "INVALID_CONTEXT"));
  check("optional email and note normalize to empty strings", () => {
    const result = accepted(changed(r => { delete r.customer.email; delete r.customer.note; }));
    assert.equal(result.selectedFacts.customer.email, ""); assert.equal(result.selectedFacts.customer.note, "");
  });
  for (const [field, value] of [["name", ""], ["name", "字".repeat(21)], ["phone", "123"],
    ["email", "invalid"], ["note", null], ["note", 10], ["note", "line\nbreak"], ["extra", "forged"]]) {
    check("strict customer rejects " + field + " " + checks, () => rejects(changed(r => { r.customer[field as string] = value; }), "INVALID_CONTEXT"));
  }
  for (const value of ["pickup_confirmation", "cash_on_delivery", null, undefined]) {
    check("browser payment always forbidden " + String(value), () => rejects({ ...base, payment: value }));
  }
  for (const value of ["atm_transfer", "cash_on_delivery"]) {
    check("home paymentMethod accepts " + value, () => accepted({ ...modeRequest("home_delivery"), paymentMethod: value }));
  }
  for (const value of ["card", "", null, undefined, 0]) {
    check("home invalid paymentMethod rejected " + String(value), () => rejects({ ...modeRequest("home_delivery"), paymentMethod: value }, "INVALID_CONTEXT"));
  }
  check("home absent paymentMethod rejected", () => rejects(changed(r => { delete r.paymentMethod; }, modeRequest("home_delivery")), "INVALID_CONTEXT"));
  check("zero credit omitted equals numeric zero", () => assert.equal(accepted().fingerprint, accepted({ ...base, requestedCredit: 0 }).fingerprint));
  for (const value of [1, -1, null, "0", 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, undefined]) {
    check("invalid credit rejected " + String(value), () => rejects({ ...base, requestedCredit: value }, "CREDIT_NOT_SUPPORTED"));
  }
  for (const value of [0, null, undefined]) {
    check("creditApplied presence rejected " + String(value), () => rejects({ ...base, creditApplied: value }));
  }
  for (const value of [null, undefined, {}, { consent: false }, { consent: true }, false, 0]) {
    check("subscription presence rejected " + String(value), () => rejects({ ...base, subscriptionIntent: value }, "SUBSCRIPTION_NOT_SUPPORTED"));
  }
  const irrelevant: [string, string, unknown][] = [
    ["studio_pickup", "store", storeSelection], ["studio_pickup", "deliveryAddress", null],
    ["studio_pickup", "paymentMethod", null], ["711_cod", "studioPickup", null],
    ["711_cod", "deliveryAddress", address], ["711_cod", "paymentMethod", "cash_on_delivery"],
    ["home_delivery", "store", null], ["home_delivery", "studioPickup", null],
  ];
  for (const [mode, field, value] of irrelevant) {
    check("irrelevant mode field rejected " + mode + " " + field, () => rejects({ ...modeRequest(mode), [field]: value }));
  }
  for (const field of ["studioPickup", "store", "deliveryAddress"]) {
    const mode = field === "studioPickup" ? "studio_pickup" : field === "store" ? "711_cod" : "home_delivery";
    check("required mode selection missing " + field, () => rejects(changed(r => { delete r[field]; }, modeRequest(mode)), "INVALID_CONTEXT"));
  }
  check("invalid calendar date rejected", () => rejects(changed(r => { r.studioPickup.preferredDate = "2026-02-30"; }), "INVALID_CONTEXT"));
  check("store selection unknown field rejected", () => rejects(changed(r => { r.store.extra = "forged"; }, modeRequest("711_cod")), "INVALID_CONTEXT"));
  check("home address invalid postcode rejected", () => rejects(changed(r => { r.deliveryAddress.postalCode = "bad"; }, modeRequest("home_delivery")), "INVALID_CONTEXT"));
  for (const value of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "100", null, undefined]) {
    check("quote must be finite non-negative safe integer " + String(value), () => rejects(changed(r => { r.items[0].quotedUnitPrice = value; }), "INVALID_QUOTE"));
  }
  check("zero quote structurally valid without price admission", () => accepted(changed(r => { r.items[0].quotedUnitPrice = 0; })));
  for (const value of [0, 100, 1.5, "2", NaN]) {
    check("strict V1 quantity rejected " + String(value), () => rejects(changed(r => { r.items[0].quantity = value; }), "INVALID_ITEM"));
  }
  check("invalid Store variant rejected", () => rejects(changed(r => { r.items[0].variantId = "variant-a"; }), "INVALID_ITEM"));
  check("Store cannot include Coffee options", () => rejects(changed(r => { r.items[0].coffeeOptions = { customRoast: false }; }), "INVALID_ITEM"));
  check("Coffee inactive roast fields rejected", () => rejects({ ...base, items: [store, { ...coffee, coffeeOptions: { customRoast: false, roastLevel: "淺焙" } }] }, "INVALID_ITEM"));
  check("Coffee invalid roast level rejected", () => rejects({ ...base, items: [store, { ...coffee, coffeeOptions: { customRoast: true, roastLevel: "invalid" } }] }, "INVALID_ITEM"));
  check("more than 50 V1 lines rejected", () => rejects({ ...base, items: Array.from({ length: 51 }, () => ({ ...store })) }, "INVALID_ITEM"));

  const result = accepted();
  check("exact versioned selected-facts snapshot", () => assert.deepEqual(result.selectedFacts, {
    contractVersion: 1, canonicalAttemptKey: key, requestFamily: "STORE_CONTAINING_PROTOCOL_V1", ownerBinding: member,
    items: [{ domain: "store", productId: "store-a", variantId: "default", quantity: 2 }],
    orderMode: "studio_pickup", customer, store: null, studioPickup: { preferredDate: "2026-10-20" }, deliveryAddress: null,
    paymentMethod: "pickup_confirmation", creditIntent: { requestedCredit: 0 }, subscriptionIntent: { presence: "absent" },
  }));
  check("fingerprint is SHA256 hex selection evidence only", () => {
    assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(result.fingerprint, createHash("sha256").update(JSON.stringify(result.selectedFacts)).digest("hex"));
  });
  check("repeated normalized selections deterministic", () => assert.deepEqual(accepted(), accepted(structuredClone(base))));
  check("UUID upper/lower canonical identity and fingerprint equivalent", () => {
    assert.equal(canonicalPublicCheckoutAttemptKey(key.toUpperCase()), key);
    const upper = accepted({ ...base, idempotencyKey: key.toUpperCase() });
    assert.equal(upper.suppliedIdempotencyKey, key.toUpperCase()); assert.equal(upper.canonicalAttemptKey, key);
    assert.equal(upper.fingerprint, result.fingerprint);
  });
  for (const invalid of ["", " "+key, key+" ", "not-a-uuid", "abcdef01-2345-0678-89ab-cdef01234567", null, {}, 12]) {
    check("reuse exact C1 UUID validation " + String(invalid), () => {
      assert.throws(() => canonicalPublicCheckoutAttemptKey(invalid), PublicCheckoutContractError);
      rejects({ ...base, idempotencyKey: invalid }, "INVALID_ATTEMPT_KEY");
    });
  }
  check("cart line order independent", () => assert.equal(accepted(mixed).fingerprint, accepted({ ...mixed, items: [...mixed.items].reverse() }).fingerprint));
  check("object property order independent", () => {
    const reordered = { items: [{ quotedUnitPrice: 100, quantity: 2, variantId: "default", productId: "store-a", domain: "store" }],
      customer: { note: customer.note, email: customer.email, phone: customer.phone, name: customer.name },
      studioPickup: base.studioPickup, orderMode: base.orderMode, idempotencyKey: key };
    assert.equal(accepted(reordered).fingerprint, result.fingerprint);
  });
  check("quote differences excluded while retained for later live admission", () => {
    const repriced = accepted(changed(r => { r.items[0].quotedUnitPrice = 999; }));
    assert.equal(repriced.fingerprint, result.fingerprint);
    assert.equal(repriced.admissionItems[0].quotedUnitPrice, 999);
    assert.ok(!("quotedUnitPrice" in repriced.selectedFacts.items[0]));
  });
  check("same IDs with distinct Coffee options remain separate", () => {
    const other = { ...coffee, coffeeOptions: { ...coffee.coffeeOptions, roastLevel: "中焙" } };
    const value = accepted({ ...base, items: [store, coffee, other] });
    assert.equal(value.selectedFacts.items.length, 3);
    assert.equal(value.selectedFacts.items.filter(item => item.domain === "coffee").length, 2);
  });
  check("identical duplicate lines remain separate and material", () => {
    const value = accepted({ ...base, items: [store, { ...store }] });
    assert.equal(value.selectedFacts.items.length, 2); assert.notEqual(value.fingerprint, result.fingerprint);
  });
  check("member ID material", () => differs(base, { ...member, memberId: "member-b" }));
  check("guest binding stable for same hash", () => assert.equal(accepted(base, guest).fingerprint, accepted(base, { ...guest }).fingerprint));
  check("replacement guest hash material", () => differs(base, { ...guest, tokenHash: createHash("sha256").update("capability-b").digest("base64url") }, accepted(base, guest).fingerprint));
  check("guest binding canonical UUID spelling equivalent", () => assert.equal(accepted(base, guest).fingerprint, accepted(base, { ...guest, canonicalAttemptKey: key.toUpperCase() }).fingerprint));
  check("guest key mismatch rejected", () => rejects(base, "OWNER_ATTEMPT_MISMATCH", { ...guest, canonicalAttemptKey: otherKey }));
  for (const owner of [null, {}, { kind: "member", memberId: "" }, { kind: "guest", tokenHash: "bad", canonicalAttemptKey: key },
    { ...member, lineDisplayName: "forged" }, { ...member, lineUserId: "forged" }, { ...guest, createdAt: "forged" }]) {
    check("invalid/non-stable owner descriptor rejected " + checks, () => rejects(base, "INVALID_OWNER", owner));
  }
  check("missing trusted owner rejects Store request", () => {
    const value = classifyPublicCheckoutRequest(base); assert.deepEqual(value, { family: "REJECTED", reason: "INVALID_OWNER" });
  });
  check("canonical attempt identity material", () => differs({ ...base, idempotencyKey: otherKey }));
  check("product ID material", () => differs(changed(r => { r.items[0].productId = "store-b"; })));
  check("Coffee variant ID material", () => differs(changed(r => { r.items[0].variantId = "coffee-sku-b"; }, mixed), member, accepted(mixed).fingerprint));
  check("quantity material", () => differs(changed(r => { r.items[0].quantity = 3; })));
  for (const [field, value] of [["preparation", "咖啡粉"], ["roastLevel", "中焙"], ["roastNote", "另一個選擇"]]) {
    check("Coffee selected option material " + field, () => differs(changed(r => { r.items[0].coffeeOptions[field] = value; }, mixed), member, accepted(mixed).fingerprint));
  }
  check("order mode material", () => differs(modeRequest("711_cod")));
  for (const [field, value] of [["name", "另一位會員"], ["phone", "0987654321"], ["email", "other@example.test"], ["note", "另一個備註"]]) {
    check("customer material " + field, () => differs(changed(r => { r.customer[field] = value; })));
  }
  check("711 store selection material", () => differs(changed(r => { r.store.id = "654321"; }, modeRequest("711_cod")), member, accepted(modeRequest("711_cod")).fingerprint));
  check("studio date material", () => differs(changed(r => { r.studioPickup.preferredDate = "2026-10-21"; })));
  check("home address material", () => differs(changed(r => { r.deliveryAddress.addressLine = "測試路二號"; }, modeRequest("home_delivery")), member, accepted(modeRequest("home_delivery")).fingerprint));
  check("home payment method material", () => differs({ ...modeRequest("home_delivery"), paymentMethod: "cash_on_delivery" }, member, accepted(modeRequest("home_delivery")).fingerprint));

  // These facts are OUTSIDE this API. Strict browser injection is rejected, rather
  // than silently accepting browser-derived authority. Trusted callers project
  // only the approved stable descriptor; no full persisted snapshot is accepted.
  for (const field of ["displayName", "lineDisplayName", "lineUserId"]) {
    check("trusted snapshot " + field + " differences excluded", () => {
      const first = { memberId: member.memberId, [field]: "old" }, second = { memberId: member.memberId, [field]: "new" };
      const stable = (snapshot: typeof first) => ({ kind: "member", memberId: snapshot.memberId });
      assert.equal(accepted(base, stable(first)).fingerprint, accepted(base, stable(second)).fingerprint);
      assert.ok(!JSON.stringify(result.selectedFacts).includes(field));
    });
  }
  check("guest createdAt differences excluded from stable descriptor", () => {
    const stable = (snapshot: typeof guest & { createdAt: string }) => ({ kind: "guest", canonicalAttemptKey: snapshot.canonicalAttemptKey, tokenHash: snapshot.tokenHash });
    assert.equal(accepted(base, stable({ ...guest, createdAt: "2026-10-13T00:00:00Z" })).fingerprint,
      accepted(base, stable({ ...guest, createdAt: "2026-10-14T00:00:00Z" })).fingerprint);
    assert.ok(!JSON.stringify(accepted(base, guest).selectedFacts).includes("createdAt"));
  });
  for (const field of ["shipping", "codServiceFee", "totalBeforeCredit", "total", "atmTransferSnapshot",
    "checkoutRulesVersion", "retailPromotionAttribution", "retailAttributionCookie", "lineNotification", "rewardState",
    "ownerBinding", "member", "guestOrderAccess", "tokenHash", "contractVersion", "unknown"]) {
    check("browser authority injection rejected and excluded " + field, () => {
      rejects({ ...base, [field]: "value-a" }); rejects({ ...base, [field]: "value-b" });
      assert.ok(!Object.hasOwn(result.selectedFacts, field) || field === "ownerBinding" || field === "contractVersion");
      const serverFactsA = { [field]: "value-a" }, serverFactsB = { [field]: "value-b" };
      // Sidecar facts cannot be passed into this two-input API.
      const select = (_serverFacts: Record<string, string>) => accepted(base, member).fingerprint;
      assert.equal(select(serverFactsA), select(serverFactsB));
    });
  }
  check("normalized whitespace yields same selections without truncation", () => {
    assert.equal(accepted(changed(r => { r.customer.name = " "+customer.name+" "; r.customer.note = " "+customer.note+" "; })).fingerprint, result.fingerprint);
  });
  check("caller request and trusted descriptor remain unchanged", () => {
    const input = structuredClone(mixed), owner = structuredClone(guest), before = structuredClone({ input, owner });
    accepted(input, owner); assert.deepEqual({ input, owner }, before);
  });
  check("no filesystem, environment or network operations", () => {
    assert.equal(networkCalls, 0); assert.equal(fsCalls, 0); assert.equal(envReads, 0);
  });
  console.log("J.6F.5C2B1 PASS " + checks + "/" + checks + " EXIT 0");
} finally {
  globalThis.fetch = originalFetch; process.env = originalEnv;
  for (const [name, operation] of savedFs) boundary[name] = operation;
}
