import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import {
  createCheckoutAttemptBindingSnapshot, validateCheckoutAttemptBindingSnapshot,
  compareStableCheckoutOwners, compareCheckoutAttemptBinding, compareHistoricalV1CheckoutAttempt,
  CheckoutAttemptBindingValidationError,
} from "../lib/checkoutAttemptBinding";
import { resolveTrustedCheckoutOwnership, type CheckoutOwnership } from "../lib/commerceCheckoutAdmission";
import { validateCommerceOrderInput, normalizeCommerceCheckoutContext } from "../lib/commerceOrderTypes";
import { commerceOrderTransactionId } from "../lib/commerceOrderTransaction";
import { createIdempotencyRequestHash } from "../lib/orderIdempotency";

const key = "abcdef01-2345-4678-89ab-cdef01234567", otherKey = "abcdef02-2345-4678-89ab-cdef01234567";
const hash = "a".repeat(64), otherHash = "b".repeat(64);
const tokenHash = createHash("sha256").update("original-capability").digest("base64url");
const replacementHash = createHash("sha256").update("replacement-capability").digest("base64url");
const member = { kind: "member", memberId: "member-a" };
const guest = { kind: "guest", canonicalAttemptKey: key, tokenHash };
type Fixture = Record<string, any>;
const historicalMember = resolveTrustedCheckoutOwnership({ member: { id: member.memberId, lineUserId: "LINE-ORIGINAL", displayName: "原始姓名" } });
const historicalGuest = resolveTrustedCheckoutOwnership({ guestOrderAccess: { tokenHash, createdAt: "2026-10-12T06:37:00.000Z" } });
const customer = { name: "測試", phone: "0912345678", email: "test@example.test", note: "原始選擇" };
const rawRequest: Fixture = { idempotencyKey: key,
  items: [{ domain: "store", productId: "store-a", variantId: "default", quantity: 2 },
    { domain: "coffee", productId: "coffee-a", variantId: "coffee-sku-a", quantity: 4,
      coffeeOptions: { preparation: "咖啡豆", customRoast: true, roastLevel: "淺中焙", roastNote: "原始選擇" } }],
  orderContext: { orderMode: "studio_pickup", customer, studioPickup: { preferredDate: "2026-10-20" } } };
function normalized(input: Fixture): Fixture {
  const items = validateCommerceOrderInput(input.items).sort((a, b) => {
    const left = JSON.stringify(a), right = JSON.stringify(b); return left < right ? -1 : left > right ? 1 : 0;
  });
  return { idempotencyKey: input.idempotencyKey.toLowerCase(), items, orderContext: normalizeCommerceCheckoutContext(input.orderContext) };
}
function modeRequest(mode: string): Fixture {
  const raw = structuredClone(rawRequest); raw.orderContext = { orderMode: mode, customer: structuredClone(customer) };
  if (mode === "studio_pickup") raw.orderContext.studioPickup = { preferredDate: "2026-10-20" };
  if (mode === "711_cod") raw.orderContext.store = { id: "123456", name: "測試門市", address: "原始門市地址" };
  if (mode === "home_delivery") {
    raw.orderContext.deliveryAddress = { recipientName: "收件人", phone: "0912345678", postalCode: "100", city: "臺北市", district: "中正區", addressLine: "原始地址" };
    raw.orderContext.paymentMethod = "atm_transfer";
  }
  return normalized(raw);
}
const request = normalized(rawRequest);
function intent(ownership: CheckoutOwnership | undefined, current = request): Fixture {
  return { schemaVersion: 1, transactionId: commerceOrderTransactionId(current.idempotencyKey),
    orderNumber: "KD20261014-2001",
    requestHash: createIdempotencyRequestHash({ items: current.items, orderContext: current.orderContext, ...(ownership ? { ownership } : {}) }),
    order: { orderNumber: "KD20261014-2001", idempotencyKey: current.idempotencyKey,
      ...(ownership?.kind === "member" ? { member: structuredClone(ownership.member) }
        : ownership?.kind === "guest" ? { member: null, guestOrderAccess: structuredClone(ownership.guestOrderAccess) } : {}),
      customer: { name: "SECRET CUSTOMER", email: "SECRET EMAIL", phone: "SECRET PHONE", note: "SECRET NOTE" },
      deliveryAddress: { addressLine: "SECRET ADDRESS" }, atmTransferSnapshot: { account: "SECRET BANK" } } };
}
const memberIntent = intent(historicalMember), guestIntent = intent(historicalGuest);
const require = createRequire(import.meta.url);
const fsModule = require("node:fs") as typeof fs;
const ts = require("typescript") as typeof import("typescript");
const productionSource = fsModule.readFileSync(new URL("../lib/checkoutAttemptBinding.ts", import.meta.url), "utf8");
const sourceFile = ts.createSourceFile("checkoutAttemptBinding.ts", productionSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const forbiddenModules = /^(?:(?:node:)?(?:fs(?:\/promises)?|https?|net|tls|dns|dgram)|(?:.*\/)?(?:commerceLocks|commerceLockProtocol|jsonFileStore|storagePaths|commerceTransactionJournal|orderFiles))$/;
const sourceViolations: string[] = [];
function scanSideEffects(node: import("typescript").Node): void {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
    && ts.isStringLiteral(node.moduleSpecifier) && forbiddenModules.test(node.moduleSpecifier.text)) {
    sourceViolations.push("forbidden module: " + node.moduleSpecifier.text);
  }
  if (ts.isCallExpression(node)) {
    const expression = node.expression;
    if ((ts.isIdentifier(expression) && expression.text === "fetch")
      || (ts.isPropertyAccessExpression(expression) && expression.name.text === "fetch")) sourceViolations.push("fetch call");
    if (((ts.isIdentifier(expression) && expression.text === "require") || expression.kind === ts.SyntaxKind.ImportKeyword)
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0])
      && forbiddenModules.test(node.arguments[0].text)) sourceViolations.push("dynamic forbidden module");
    if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)
      && ["fs", "fsModule", "fsPromises"].includes(expression.expression.text)) sourceViolations.push("filesystem API call");
  }
  if ((ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === "process" && node.name.text === "env")
    || (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === "process" && node.argumentExpression
      && ts.isStringLiteral(node.argumentExpression) && node.argumentExpression.text === "env")) sourceViolations.push("process.env access");
  ts.forEachChild(node, scanSideEffects);
}
scanSideEffects(sourceFile);
let checks = 0, fsCalls = 0, fsPromiseCalls = 0, fetchCalls = 0, envWrites = 0;
const originalEnv = { ...process.env };
/** Patch only writable/configurable own function values on CommonJS objects.
 * Accessors are never evaluated or replaced. Exact descriptors are restored
 * even if setup or the synchronous operation throws; process.env is untouched.
 */
function pure<T>(operation: () => T): T {
  const environmentBefore = { ...process.env };
  const surfaces = [{ target: fsModule as unknown as object, promises: false },
    { target: fsModule.promises as unknown as object, promises: true }];
  const saved: { target: object; key: PropertyKey; descriptor: PropertyDescriptor; promises: boolean }[] = [];
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  let fetchPatched = false;
  try {
    for (const { target, promises } of surfaces) {
      for (const key of Reflect.ownKeys(target)) {
        const descriptor = Object.getOwnPropertyDescriptor(target, key);
        if (!descriptor || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "function"
          || descriptor.writable !== true || descriptor.configurable !== true) continue;
        saved.push({ target, key, descriptor, promises });
        Object.defineProperty(target, key, { ...descriptor, value: () => {
          if (promises) fsPromiseCalls++; else fsCalls++;
          throw new Error("Filesystem forbidden in B3A");
        } });
      }
    }
    if (fetchDescriptor && Object.hasOwn(fetchDescriptor, "value") && typeof fetchDescriptor.value === "function"
      && fetchDescriptor.writable === true && fetchDescriptor.configurable === true) {
      Object.defineProperty(globalThis, "fetch", { ...fetchDescriptor, value: async () => {
        fetchCalls++; throw new Error("Network forbidden in B3A");
      } });
      fetchPatched = true;
    }
    return operation();
  } finally {
    if (fetchPatched) Object.defineProperty(globalThis, "fetch", fetchDescriptor!);
    for (const item of saved.reverse()) Object.defineProperty(item.target, item.key, item.descriptor);
    if (!isDeepStrictEqual({ ...process.env }, environmentBefore)) envWrites++;
    assert.deepEqual({ ...process.env }, environmentBefore, "B3A must not mutate environment");
  }
}
function check(label: string, operation: () => void) {
  try { operation(); console.log("PASS " + (++checks) + " " + label); }
  catch (error) { console.error("FAIL case " + (checks + 1) + " " + label); throw error; }
}
function create(ownerBinding: unknown = member, selectedFactsFingerprint: unknown = hash, canonicalAttemptKey: unknown = key) {
  return pure(() => createCheckoutAttemptBindingSnapshot({ canonicalAttemptKey, selectedFactsFingerprint, ownerBinding }));
}
const memberSnapshot = create(), guestSnapshot = create(guest);
function compare(overrides: Fixture = {}) {
  return pure(() => compareCheckoutAttemptBinding({ currentCanonicalAttemptKey: key,
    currentSelectedFactsFingerprint: hash, currentOwnerBinding: member, durableSnapshot: memberSnapshot, ...overrides }));
}
function historical(durable: unknown = memberIntent, currentRequest: unknown = request, currentOwnerBinding: unknown = member) {
  const result = pure(() => compareHistoricalV1CheckoutAttempt({ intent: durable, currentRequest, currentOwnerBinding }));
  const output = JSON.stringify(result);
  for (const sensitive of ["SECRET", "原始姓名", "LINE-ORIGINAL", tokenHash, member.memberId]) assert.ok(!output.includes(sensitive));
  return result;
}
function changed(value: Fixture, operation: (copy: Fixture) => void): Fixture {
  const copy = structuredClone(value); operation(copy); return copy;
}
try {
  check("static source side-effect guard excludes filesystem/network/environment/lock/storage authority", () => assert.deepEqual(sourceViolations, []));
  check("member snapshot exact strict versioned shape", () => assert.deepEqual(memberSnapshot, {
    schemaVersion: 1, contractVersion: 1, requestFamily: "STORE_CONTAINING_PROTOCOL_V1", canonicalAttemptKey: key,
    selectedFactsFingerprint: hash, ownerBinding: member,
  }));
  check("guest snapshot exact stable owner shape", () => assert.deepEqual(guestSnapshot.ownerBinding, guest));
  check("creation deterministic and JSON-safe", () => { assert.deepEqual(create(), create()); assert.deepEqual(JSON.parse(JSON.stringify(memberSnapshot)), memberSnapshot); });
  check("output and nested binding immutable without mutating input", () => {
    const input = { canonicalAttemptKey: key, selectedFactsFingerprint: hash, ownerBinding: structuredClone(member) }, before = structuredClone(input);
    const result = pure(() => createCheckoutAttemptBindingSnapshot(input));
    assert.deepEqual(input, before); assert.equal(Object.isFrozen(input), false);
    assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(result.ownerBinding), true);
    assert.throws(() => { (result as unknown as Fixture).contractVersion = 2; }, TypeError);
    assert.throws(() => { (result.ownerBinding as unknown as Fixture).memberId = "different"; }, TypeError);
  });
  check("creation canonicalizes current uppercase UUID", () => assert.deepEqual(create(member, hash, key.toUpperCase()), memberSnapshot));
  check("durable outer uppercase canonical key rejected without repair", () => assert.throws(() => pure(() => validateCheckoutAttemptBindingSnapshot({ ...memberSnapshot, canonicalAttemptKey: key.toUpperCase() })), CheckoutAttemptBindingValidationError));
  check("durable guest uppercase canonical key rejected without repair", () => assert.throws(() => pure(() => validateCheckoutAttemptBindingSnapshot({ ...guestSnapshot, ownerBinding: { ...guest, canonicalAttemptKey: key.toUpperCase() } })), CheckoutAttemptBindingValidationError));
  check("guest outer/inner mismatch rejected", () => assert.throws(() => create({ ...guest, canonicalAttemptKey: otherKey }), CheckoutAttemptBindingValidationError));
  for (const invalid of ["", "bad", "0".repeat(63), "A".repeat(64), null, 1]) {
    check("invalid fingerprint rejected " + String(invalid).slice(0, 10), () => assert.throws(() => create(member, invalid), CheckoutAttemptBindingValidationError));
  }
  for (const invalid of ["", "short", "a".repeat(44), "=".repeat(43), null, 10]) {
    check("malformed guest hash rejected " + String(invalid).slice(0, 10), () => assert.throws(() => create({ ...guest, tokenHash: invalid }), CheckoutAttemptBindingValidationError));
  }
  for (const invalid of ["", " ", null, 1, " member-a"]) {
    check("invalid member ID rejected " + String(invalid), () => assert.throws(() => create({ ...member, memberId: invalid }), CheckoutAttemptBindingValidationError));
  }
  const invalidCases = [["schemaVersion", 2], ["contractVersion", 2], ["requestFamily", "LEGACY_COFFEE"],
    ["canonicalAttemptKey", "invalid"], ["ownerBinding", {}], ["extra", "forged"]] as const satisfies readonly (readonly [string, unknown])[];
  for (const [field, value] of invalidCases) {
    check("strict durable snapshot rejects " + field, () => {
      const invalid = { ...memberSnapshot, [field]: value };
      assert.throws(() => pure(() => validateCheckoutAttemptBindingSnapshot(invalid)), CheckoutAttemptBindingValidationError);
      assert.equal(compare({ durableSnapshot: invalid }).kind, "REVIEW_REQUIRED");
    });
  }
  for (const invalid of [null, [], new Date(), Object.assign(Object.create({ inherited: true }), memberSnapshot)]) {
    check("non-record/prototype snapshot rejects " + checks, () => assert.throws(() => pure(() => validateCheckoutAttemptBindingSnapshot(invalid)), CheckoutAttemptBindingValidationError));
  }
  check("snapshot getter rejected without executing it", () => {
    const invalid = { ...memberSnapshot }; let getterCalls = 0;
    Object.defineProperty(invalid, "selectedFactsFingerprint", { enumerable: true, get() { getterCalls++; return hash; } });
    assert.throws(() => pure(() => validateCheckoutAttemptBindingSnapshot(invalid)), CheckoutAttemptBindingValidationError); assert.equal(getterCalls, 0);
  });
  check("strict creation rejects unknown input field", () => assert.throws(() => pure(() => createCheckoutAttemptBindingSnapshot({ canonicalAttemptKey: key, selectedFactsFingerprint: hash, ownerBinding: member, extra: 1 })), CheckoutAttemptBindingValidationError));
  check("same member ID matches", () => assert.deepEqual(pure(() => compareStableCheckoutOwners(member, { ...member })), { kind: "MATCH" }));
  check("different member ID mismatches", () => assert.deepEqual(pure(() => compareStableCheckoutOwners(member, { ...member, memberId: "member-b" })), { kind: "OWNER_MISMATCH" }));
  check("member vs guest mismatches both directions", () => {
    assert.equal(pure(() => compareStableCheckoutOwners(member, guest)).kind, "OWNER_MISMATCH");
    assert.equal(pure(() => compareStableCheckoutOwners(guest, member)).kind, "OWNER_MISMATCH");
  });
  check("same guest key/hash matches", () => assert.equal(pure(() => compareStableCheckoutOwners(guest, { ...guest })).kind, "MATCH"));
  check("replacement guest token mismatches", () => assert.equal(pure(() => compareStableCheckoutOwners(guest, { ...guest, tokenHash: replacementHash })).kind, "OWNER_MISMATCH"));
  check("same guest hash another UUID mismatches", () => assert.equal(pure(() => compareStableCheckoutOwners(guest, { ...guest, canonicalAttemptKey: otherKey })).kind, "OWNER_MISMATCH"));
  check("same new snapshot owner/key/fingerprint matches", () => assert.deepEqual(compare(), { kind: "MATCH" }));
  check("current UUID case alias matches new durable binding", () => assert.equal(compare({ currentCanonicalAttemptKey: key.toUpperCase() }).kind, "MATCH"));
  check("same owner different selection fingerprint conflicts", () => assert.deepEqual(compare({ currentSelectedFactsFingerprint: otherHash }), { kind: "SELECTION_CONFLICT" }));
  check("owner mismatch takes precedence over selection conflict and invalid current fingerprint", () => {
    for (const fingerprint of [otherHash, "bad"]) assert.deepEqual(compare({ currentOwnerBinding: { ...member, memberId: "member-b" }, currentSelectedFactsFingerprint: fingerprint }), { kind: "OWNER_MISMATCH" });
  });
  check("durable validation precedes current key/owner/fingerprint", () => assert.equal(compare({ durableSnapshot: { ...memberSnapshot, contractVersion: 2 }, currentCanonicalAttemptKey: otherKey, currentOwnerBinding: guest }).kind, "REVIEW_REQUIRED"));
  check("attempt identity mismatch fails closed before owner/selection", () => assert.deepEqual(compare({ currentCanonicalAttemptKey: otherKey, currentOwnerBinding: guest }), { kind: "REVIEW_REQUIRED", reason: "ATTEMPT_MISMATCH" }));
  check("new guest snapshot same stable owner matches", () => assert.equal(compare({ durableSnapshot: guestSnapshot, currentOwnerBinding: guest }).kind, "MATCH"));
  for (const field of ["lineDisplayName", "lineUserId", "createdAt", "shipping", "codServiceFee", "atmTransferSnapshot", "checkoutRulesVersion", "retailPromotionAttribution", "rewardState", "lineNotification"]) {
    check("excluded snapshot field cannot enter new durable contract " + field, () => {
      assert.throws(() => pure(() => validateCheckoutAttemptBindingSnapshot({ ...memberSnapshot, [field]: "forged" })), CheckoutAttemptBindingValidationError);
      assert.ok(!JSON.stringify(memberSnapshot).includes(field));
    });
  }
  for (const owner of [{ ...member, lineDisplayName: "name" }, { ...member, lineUserId: "line" }, { ...guest, createdAt: "date" }]) {
    check("display metadata not accepted into stable binding " + checks, () => assert.throws(() => create(owner), CheckoutAttemptBindingValidationError));
  }

  check("historical same member/request matches original full ownership hash", () => assert.deepEqual(historical(), { kind: "MATCH_LEGACY_V1" }));
  for (const [field, value] of [["displayName", "目前的新姓名"], ["lineUserId", "LINE-CURRENT"]]) {
    check("current member snapshot change irrelevant " + field, () => {
      const currentProfile = { id: member.memberId, lineUserId: "LINE-ORIGINAL", displayName: "原始姓名", [field]: value };
      const naiveOwner = resolveTrustedCheckoutOwnership({ member: currentProfile });
      assert.notEqual(createIdempotencyRequestHash({ items: request.items, orderContext: request.orderContext, ownership: naiveOwner }), memberIntent.requestHash);
      assert.deepEqual(historical(memberIntent, request, { kind: "member", memberId: currentProfile.id }), { kind: "MATCH_LEGACY_V1" });
    });
  }
  check("member ID change mismatches before material hash", () => assert.deepEqual(historical(memberIntent, changed(request, r => { r.items[0].quantity = 3; }), { ...member, memberId: "member-b" }), { kind: "OWNER_MISMATCH" }));
  check("historical member cannot transfer to guest and guest cannot transfer to member", () => {
    assert.equal(historical(memberIntent, request, guest).kind, "OWNER_MISMATCH");
    assert.equal(historical(guestIntent, request, member).kind, "OWNER_MISMATCH");
  });
  check("historical guest same token/key/request matches", () => assert.deepEqual(historical(guestIntent, request, guest), { kind: "MATCH_LEGACY_V1" }));
  check("current guest createdAt cannot substitute durable timestamp in old hash", () => {
    const currentGuest = resolveTrustedCheckoutOwnership({ guestOrderAccess: { tokenHash, createdAt: "2026-10-14T00:00:00.000Z" } });
    assert.notEqual(createIdempotencyRequestHash({ items: request.items, orderContext: request.orderContext, ownership: currentGuest }), guestIntent.requestHash);
    assert.deepEqual(historical(guestIntent, request, guest), { kind: "MATCH_LEGACY_V1" });
  });
  check("historical replacement guest capability hash mismatches", () => assert.deepEqual(historical(guestIntent, request, { ...guest, tokenHash: replacementHash }), { kind: "OWNER_MISMATCH" }));
  check("historical helper uses durable original member snapshot", () => {
    const changedDurable = changed(memberIntent, r => { r.order.member.lineDisplayName = "另外的持久姓名"; });
    assert.equal(historical(changedDurable).kind, "SELECTION_CONFLICT");
  });
  check("historical helper uses durable original guest createdAt", () => {
    const changedDurable = changed(guestIntent, r => { r.order.guestOrderAccess.createdAt = "2026-10-13T00:00:00.000Z"; });
    assert.equal(historical(changedDurable, request, guest).kind, "SELECTION_CONFLICT");
  });
  check("historical accepted non-ISO timestamp spelling preserved exactly", () => {
    const ownership = resolveTrustedCheckoutOwnership({ guestOrderAccess: { tokenHash, createdAt: "2026-10-12T14:37:00+08:00" } });
    assert.equal(historical(intent(ownership), request, guest).kind, "MATCH_LEGACY_V1");
  });
  check("historical member missing optional LINE snapshots still matches", () => {
    const ownership = resolveTrustedCheckoutOwnership({ member: { id: member.memberId } });
    assert.equal(historical(intent(ownership)).kind, "MATCH_LEGACY_V1");
  });
  check("historical empty persisted display name remains valid", () => {
    const ownership = resolveTrustedCheckoutOwnership({ member: { id: member.memberId, displayName: "" } });
    assert.equal(historical(intent(ownership)).kind, "MATCH_LEGACY_V1");
  });
  for (const [label, operation] of [
    ["quantity", (r: Fixture) => { r.items[0].quantity += 1; }],
    ["product", (r: Fixture) => { r.items[0].productId = "other"; }],
    ["variant", (r: Fixture) => { r.items[0].variantId = "other-sku"; }],
    ["Coffee option", (r: Fixture) => { r.items[0].coffeeOptions.roastLevel = "中焙"; }],
    ["customer", (r: Fixture) => { r.orderContext.customer.note = "新選擇"; }],
    ["pickup date", (r: Fixture) => { r.orderContext.studioPickup.preferredDate = "2026-10-21"; }],
  ] as const) {
    check("historical material change conflicts " + label, () => assert.equal(historical(memberIntent, changed(request, operation)).kind, "SELECTION_CONFLICT"));
  }
  check("historical order mode change conflicts", () => assert.equal(historical(memberIntent, modeRequest("711_cod")).kind, "SELECTION_CONFLICT"));
  check("historical store selection change conflicts", () => {
    const current = modeRequest("711_cod"), durable = intent(historicalMember, current);
    assert.equal(historical(durable, changed(current, r => { r.orderContext.store.id = "654321"; })).kind, "SELECTION_CONFLICT");
  });
  for (const [label, operation] of [
    ["address", (r: Fixture) => { r.orderContext.deliveryAddress.addressLine = "新地址"; }],
    ["payment", (r: Fixture) => { r.orderContext.paymentMethod = "cash_on_delivery"; }],
  ] as const) {
    check("historical home " + label + " change conflicts", () => {
      const current = modeRequest("home_delivery"), durable = intent(historicalMember, current);
      assert.equal(historical(durable, changed(current, operation)).kind, "SELECTION_CONFLICT");
    });
  }
  check("existing transaction item sorting remains exactly compatible", () => assert.equal(historical(memberIntent, { ...request, items: [...request.items].reverse() }).kind, "MATCH_LEGACY_V1"));
  check("no quote enters historical internal request hash", () => {
    const browserA = { ...request.items[0], quotedUnitPrice: 100 }, browserB = { ...request.items[0], quotedUnitPrice: 999 };
    const selected = (line: Fixture) => { const { quotedUnitPrice: _quote, ...selection } = line; return selection; };
    assert.equal(historical(memberIntent, { ...request, items: [selected(browserA), request.items[1]] }).kind, "MATCH_LEGACY_V1");
    assert.equal(historical(memberIntent, { ...request, items: [selected(browserB), request.items[1]] }).kind, "MATCH_LEGACY_V1");
    assert.equal(historical(memberIntent, { ...request, items: [browserA, request.items[1]] }).kind, "REVIEW_REQUIRED");
  });
  for (const operation of [
    (r: Fixture) => { r.order.member.memberId = ""; },
    (r: Fixture) => { r.order.member.lineUserId = null; },
    (r: Fixture) => { r.order.member.lineDisplayName = 1; },
    (r: Fixture) => { r.order.member.extra = "forged"; },
    (r: Fixture) => { r.order.member.memberId = " member-a"; },
    (r: Fixture) => { r.order.guestOrderAccess = { tokenHash, createdAt: "2026-10-12T06:37:00.000Z" }; },
  ]) {
    check("malformed/ambiguous durable member requires review " + checks, () => assert.equal(historical(changed(memberIntent, operation)).kind, "REVIEW_REQUIRED"));
  }
  for (const operation of [
    (r: Fixture) => { r.order.guestOrderAccess.tokenHash = "bad"; },
    (r: Fixture) => { r.order.guestOrderAccess.createdAt = "bad-date"; },
    (r: Fixture) => { r.order.guestOrderAccess.createdAt = " 2026-10-12T06:37:00.000Z"; },
    (r: Fixture) => { r.order.guestOrderAccess.extra = 1; },
    (r: Fixture) => { r.order.member = {}; },
  ]) {
    check("malformed/ambiguous durable guest requires review " + checks, () => assert.equal(historical(changed(guestIntent, operation), request, guest).kind, "REVIEW_REQUIRED"));
  }
  check("durable attempt key mismatch requires review", () => assert.equal(historical(changed(memberIntent, r => { r.order.idempotencyKey = otherKey; })).kind, "REVIEW_REQUIRED"));
  for (const invalid of ["bad", "A".repeat(64), null, 1]) {
    check("invalid historical requestHash requires review " + String(invalid).slice(0, 8), () => assert.equal(historical({ ...memberIntent, requestHash: invalid }).kind, "REVIEW_REQUIRED"));
  }
  check("unowned direct F3 intent is NOT_APPLICABLE without redefining F3", () => assert.deepEqual(historical(intent(undefined)), { kind: "NOT_APPLICABLE" }));
  check("legacy Coffee order is outside historical PREPARED compatibility", () => assert.equal(historical({ orderNumber: "KD20261014-2001", idempotencyKey: key, member: { memberId: member.memberId } }).kind, "REVIEW_REQUIRED"));
  for (const current of [
    { ...request, idempotencyKey: "invalid" }, { ...request, idempotencyKey: otherKey }, { ...request, items: [] },
    { ...request, items: [null] }, { ...request, items: new Array(1) }, { ...request, orderContext: {} },
    { ...request, orderContext: { ...request.orderContext, subscriptionIntent: null } },
    { ...request, orderContext: { ...request.orderContext, creditApplied: 1 } }, { ...request, extra: "forged" },
  ]) {
    check("invalid current internal request fails closed " + checks, () => assert.equal(historical(memberIntent, current).kind, "REVIEW_REQUIRED"));
  }
  check("comparison results expose only outcome/reason", () => {
    for (const result of [compare(), historical(), historical(guestIntent, request, guest), historical(memberIntent, request, guest)]) {
      assert.ok(Object.keys(result).every(field => field === "kind" || field === "reason"));
    }
  });
  check("durable intent/request/current stable inputs byte-equivalent after comparisons", () => {
    const input = { intent: structuredClone(memberIntent), currentRequest: structuredClone(request), currentOwnerBinding: structuredClone(member) };
    const before = JSON.stringify(input); pure(() => compareHistoricalV1CheckoutAttempt(input)); assert.equal(JSON.stringify(input), before);
  });
  check("pure boundaries: filesystem/fetch/environment access zero; environment unchanged", () => {
    assert.equal(fsCalls, 0); assert.equal(fsPromiseCalls, 0); assert.equal(fetchCalls, 0); assert.equal(envWrites, 0);
    assert.deepEqual(sourceViolations, []);
    assert.deepEqual({ ...process.env }, originalEnv);
  });
  console.log("SIDE_EFFECTS fs=" + fsCalls + " fs.promises=" + fsPromiseCalls + " network=" + fetchCalls + " envMutation=" + envWrites + " staticViolations=" + sourceViolations.length);
  console.log("J.6F.5C2B3A PASS " + checks + "/" + checks + "; pure in-memory binding/old-v1 fixtures only");
} finally { assert.deepEqual({ ...process.env }, originalEnv); }
