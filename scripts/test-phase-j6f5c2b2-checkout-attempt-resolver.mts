import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { resolveCheckoutAttemptEvidence, CheckoutAttemptEvidenceInputError, type CheckoutAttemptEvidence } from "../lib/checkoutAttemptResolver";
import { commerceOrderTransactionId } from "../lib/commerceOrderTransaction";
import { createCommerceTransactionJournal } from "../lib/commerceTransactionJournal";
import { inventoryHash } from "../lib/inventoryReceipts";
import { PublicCheckoutContractError } from "../lib/publicCheckoutContract";

const key = "abcdef01-2345-4678-89ab-cdef01234567", otherKey = "abcdef02-2345-4678-89ab-cdef01234567";
const tx = commerceOrderTransactionId(key), requestHash = inventoryHash("historical-v1-request");
const number = "KD20261014-1001", otherNumber = "KD20261014-1002", receiptHash = inventoryHash("fixture-apply-receipt");
const tempParent = await fs.realpath(os.tmpdir());
const suite = await fs.mkdtemp(path.join(tempParent, "kd-j6f5c2b2-"));
assert.equal(path.dirname(await fs.realpath(suite)).toLowerCase(), tempParent.toLowerCase());
type Fixture = Record<string, any>;
let checks = 0, fixtureCount = 0, networkCalls = 0, writeCalls = 0, queryCount = 0;
const initialEnv = { ...process.env }, originalFetch = globalThis.fetch;
globalThis.fetch = async () => { networkCalls++; throw new Error("No network in B2"); };
const boundary = fs as unknown as Record<string, unknown>;
const writeMethods = ["writeFile", "appendFile", "mkdir", "mkdtemp", "rename", "unlink", "rm", "rmdir", "truncate", "copyFile", "cp", "link", "symlink", "chmod", "chown", "utimes"];
async function tree(root: string): Promise<string[]> {
  const rows: string[] = [];
  async function visit(full: string, relative: string) {
    const stat = await fs.lstat(full);
    if (stat.isSymbolicLink()) { rows.push("LINK " + relative + " " + await fs.readlink(full)); return; }
    if (stat.isDirectory()) {
      rows.push("DIR " + relative);
      for (const name of (await fs.readdir(full)).sort()) await visit(path.join(full, name), relative + "/" + name);
    } else if (stat.isFile()) {
      rows.push("FILE " + relative + " " + createHash("sha256").update(await fs.readFile(full)).digest("hex"));
    } else rows.push("OTHER " + relative);
  }
  await visit(root, "."); return rows;
}
async function query(orderDir: string, attempt: unknown = key): Promise<CheckoutAttemptEvidence> {
  const before = await tree(suite), saved = writeMethods.map(name => [name, boundary[name]] as const), open = fs.open;
  for (const [name] of saved) boundary[name] = () => { writeCalls++; throw new Error("Resolver write forbidden: " + name); };
  fs.open = async (...args: Parameters<typeof fs.open>) => {
    if (args[1] !== "r") { writeCalls++; throw new Error("Resolver may open read-only handles only"); }
    return open(...args);
  };
  let result: CheckoutAttemptEvidence;
  try { result = await resolveCheckoutAttemptEvidence({ orderDir, canonicalAttemptKey: attempt }); }
  finally {
    fs.open = open;
    for (const [name, operation] of saved) boundary[name] = operation;
  }
  assert.deepEqual(await tree(suite), before, "resolver must preserve every fixture path and byte");
  assert.deepEqual({ ...process.env }, initialEnv, "B2 must not mutate environment");
  queryCount++;
  return result;
}
async function fixture() {
  const dir = path.join(suite, "f" + String(++fixtureCount).padStart(3, "0"));
  await fs.mkdir(dir); return dir;
}
function intent(): Fixture {
  return { schemaVersion: 1, transactionId: tx, requestHash, orderNumber: number,
    participants: [{ domain: "store", registryRank: 10, demands: [{ identity: "store-a", quantity: 2 }] }],
    finalStatus: "waiting_studio_pickup_confirmation",
    order: { orderNumber: number, createdAt: "2026-10-14T00:00:00.000Z", orderMode: "studio_pickup",
      idempotencyKey: key, idempotencyRequestHash: requestHash,
      customer: { name: "SECRET CUSTOMER", phone: "SECRET PHONE", email: "SECRET EMAIL" },
      member: { memberId: "SECRET MEMBER" }, items: [], subtotal: 200, shipping: 0, total: 200 } };
}
function legacy(orderNumber = number, spelling = key): Fixture {
  return { orderNumber, orderMode: "711_cod", status: "waiting_merchant_create_cod_shipment",
    idempotencyKey: spelling, idempotencyRequestHash: inventoryHash("legacy-request"),
    customer: { name: "SECRET CUSTOMER", phone: "SECRET PHONE" } };
}
function v1(prepared: Fixture, state = "inventory_pending"): Fixture {
  return { ...prepared.order, orderNumber: prepared.orderNumber,
    status: state === "inventory_committed" ? prepared.finalStatus : "inventory_pending",
    inventoryTransaction: { protocolVersion: 1, transactionId: prepared.transactionId,
      intentHash: inventoryHash(prepared), state,
      ...(state === "inventory_committed" ? { participantReceipts: [{ domain: "store", operationId: "fixture-operation", receiptHash }] } : {}) } };
}
async function order(dir: string, value: Fixture, file = value.orderNumber + ".json") {
  await fs.writeFile(path.join(dir, file), JSON.stringify(value), "utf8");
}
/** Manual isolated fixture generation, exactly the existing envelope/hash chain.
 * No production append, lock, coordinator or transaction execution is used.
 */
async function journal(dir: string, events: unknown[]) {
  const location = createCommerceTransactionJournal(dir, tx).directory;
  await fs.mkdir(location, { recursive: true });
  let previousHash: string | null = null;
  for (const [sequence, event] of events.entries()) {
    const record = { schemaVersion: 1, sequence, previousHash, event }, hash = inventoryHash(record);
    await fs.writeFile(path.join(location, String(sequence).padStart(8, "0") + ".json"), JSON.stringify({ ...record, hash }), "utf8");
    previousHash = hash;
  }
  return location;
}
const preparedEvent = (value = intent()) => ({ type: "PREPARED", intent: value });
const applied = { type: "APPLIED", domain: "store", receiptHash };
async function check(label: string, operation: () => Promise<void>) {
  try { await operation(); console.log("PASS " + (++checks) + " " + label); }
  catch (error) { console.error("FAIL case " + (checks + 1) + " " + label); throw error; }
}
async function expect(dir: string, kind: CheckoutAttemptEvidence["kind"], reason?: string) {
  const result = await query(dir); assert.equal(result.kind, kind);
  if (reason) { assert.ok("reason" in result); if ("reason" in result) assert.equal(result.reason, reason); }
  assert.ok(!JSON.stringify(result).includes("SECRET"), "evidence metadata must not expose customer/member data");
  return result;
}
async function v1Fixture(events: unknown[], state?: string, prepared = intent()) {
  const dir = await fixture(); await journal(dir, events);
  if (state) await order(dir, v1(prepared, state)); return dir;
}
try {
  await check("missing order directory yields NONE without creating any directory", async () => {
    const missing = path.join(suite, "missing");
    assert.deepEqual(await query(missing), { kind: "NONE", canonicalAttemptKey: key });
    assert.equal(await fs.lstat(missing).then(() => true, () => false), false);
  });
  await check("empty source yields NONE and no lock/journal/order artifacts", async () => {
    const dir = await fixture(); await expect(dir, "NONE"); assert.deepEqual(await fs.readdir(dir), []);
  });
  await check("lowercase legacy evidence reference and historical requestHash", async () => {
    const dir = await fixture(), value = legacy(); await order(dir, value);
    assert.deepEqual(await query(dir), { kind: "LEGACY_ORDER", canonicalAttemptKey: key,
      orderNumber: number, persistedIdempotencyKey: key, requestHash: value.idempotencyRequestHash });
  });
  await check("uppercase historical key matched without rewriting persisted spelling", async () => {
    const dir = await fixture(); await order(dir, legacy(number, key.toUpperCase()));
    const result = await expect(dir, "LEGACY_ORDER");
    assert.ok(result.kind === "LEGACY_ORDER"); if (result.kind === "LEGACY_ORDER") assert.equal(result.persistedIdempotencyKey, key.toUpperCase());
    assert.equal(JSON.parse(await fs.readFile(path.join(dir, number + ".json"), "utf8")).idempotencyKey, key.toUpperCase());
    assert.deepEqual(await query(dir, key.toUpperCase()), result);
  });
  await check("legacy order without requestHash remains readable evidence", async () => {
    const dir = await fixture(), value = legacy(); delete value.idempotencyRequestHash; await order(dir, value);
    const result = await expect(dir, "LEGACY_ORDER"); assert.ok(!("requestHash" in result));
  });
  await check("duplicate legacy UUID case aliases require review, no winner", async () => {
    const dir = await fixture(); await order(dir, legacy()); await order(dir, legacy(otherNumber, key.toUpperCase()));
    await expect(dir, "REVIEW_REQUIRED", "DUPLICATE_CANONICAL_LEGACY_ORDERS");
  });
  await check("corporate gift owns key as legacy inquiry authority", async () => {
    const dir = await fixture(); await order(dir, { ...legacy(), orderMode: "corporate_gift", status: "corporate_gift_inquiry" });
    await expect(dir, "LEGACY_ORDER");
  });
  await check("unrelated orders and historical non-UUID scheduler keys are not matches", async () => {
    const dir = await fixture(); await order(dir, legacy(number, otherKey)); await order(dir, legacy(otherNumber, "subscription-cycle:historical"));
    await expect(dir, "NONE");
  });
  await check("old order with no idempotencyKey remains unrelated", async () => {
    const dir = await fixture(), value = legacy(); delete value.idempotencyKey; await order(dir, value); await expect(dir, "NONE");
  });
  await check("PREPARED only is durable authority without order", async () => {
    const dir = await v1Fixture([preparedEvent()]);
    assert.deepEqual(await query(dir), { kind: "PROTOCOL_V1_ATTEMPT", canonicalAttemptKey: key,
      transactionId: tx, orderNumber: number, requestHash, journalState: "PREPARED", orderState: "ABSENT", orderPresent: false });
  });
  await check("PREPARED and its pending order are ONE authority, not conflict", async () => {
    const dir = await v1Fixture([preparedEvent()], "inventory_pending"), result = await expect(dir, "PROTOCOL_V1_ATTEMPT");
    assert.ok(result.kind === "PROTOCOL_V1_ATTEMPT");
    if (result.kind === "PROTOCOL_V1_ATTEMPT") { assert.equal(result.orderState, "inventory_pending"); assert.equal(result.orderPresent, true); }
  });
  await check("committed order before FINALIZED remains one authority", async () => {
    const dir = await v1Fixture([preparedEvent()], "inventory_committed"), result = await expect(dir, "PROTOCOL_V1_ATTEMPT");
    assert.ok(result.kind === "PROTOCOL_V1_ATTEMPT");
    if (result.kind === "PROTOCOL_V1_ATTEMPT") { assert.equal(result.journalState, "PREPARED"); assert.equal(result.orderState, "inventory_committed"); }
  });
  await check("APPLIED and committed order without FINALIZED show pending journal", async () => {
    const dir = await v1Fixture([preparedEvent(), applied], "inventory_committed"), result = await expect(dir, "PROTOCOL_V1_ATTEMPT");
    assert.ok(result.kind === "PROTOCOL_V1_ATTEMPT"); if (result.kind === "PROTOCOL_V1_ATTEMPT") assert.equal(result.journalState, "PENDING");
  });
  await check("FINALIZED requires correlated committed order", async () => {
    const dir = await v1Fixture([preparedEvent(), applied, { type: "FINALIZED" }], "inventory_committed"), result = await expect(dir, "PROTOCOL_V1_ATTEMPT");
    assert.ok(result.kind === "PROTOCOL_V1_ATTEMPT"); if (result.kind === "PROTOCOL_V1_ATTEMPT") assert.equal(result.journalState, "FINALIZED");
  });
  await check("ABORTED journal still owns key even without order", async () => {
    const dir = await v1Fixture([preparedEvent(), { type: "ABORTED" }]), result = await expect(dir, "PROTOCOL_V1_ATTEMPT");
    assert.ok(result.kind === "PROTOCOL_V1_ATTEMPT"); if (result.kind === "PROTOCOL_V1_ATTEMPT") assert.equal(result.journalState, "ABORTED");
  });
  await check("REVIEW_REQUIRED event cannot downgrade to usable V1 evidence", async () => {
    const dir = await v1Fixture([preparedEvent(), { type: "REVIEW_REQUIRED", reason: "fixture review" }], "inventory_pending");
    await expect(dir, "REVIEW_REQUIRED", "JOURNAL_REVIEW_REQUIRED");
  });
  await check("legacy plus PREPARED-only is cross-protocol dual authority", async () => {
    const dir = await v1Fixture([preparedEvent()]); await order(dir, legacy(otherNumber));
    await expect(dir, "CONFLICT", "CROSS_PROTOCOL_DUAL_AUTHORITY");
  });
  await check("legacy plus correlated V1 journal/order still conflicts", async () => {
    const dir = await v1Fixture([preparedEvent()], "inventory_pending"); await order(dir, legacy(otherNumber));
    await expect(dir, "CONFLICT", "CROSS_PROTOCOL_DUAL_AUTHORITY");
  });
  await check("orphan protocol-v1 order cannot become legacy or NONE", async () => {
    const dir = await fixture(); await order(dir, v1(intent())); await expect(dir, "REVIEW_REQUIRED", "ORPHAN_V1_ORDER");
  });
  for (const [field, value] of [["transactionId", "wrong-transaction"], ["schemaVersion", 2], ["requestHash", "bad"],
    ["requestHash", "A".repeat(64)], ["orderNumber", "../outside"], ["participants", []], ["participants", [{}]], ["order", []]]) {
    await check("PREPARED identity/shape rejects " + field + " " + checks, async () => {
      const valueIntent = intent(); valueIntent[field as string] = value;
      await expect(await v1Fixture([preparedEvent(valueIntent)]), "REVIEW_REQUIRED", "INVALID_PREPARED_INTENT");
    });
  }
  await check("PREPARED embedded key mismatch requires review", async () => {
    const value = intent(); value.order.idempotencyKey = otherKey;
    await expect(await v1Fixture([preparedEvent(value)]), "REVIEW_REQUIRED", "INVALID_PREPARED_INTENT");
  });
  await check("PREPARED embedded order number mismatch requires review", async () => {
    const value = intent(); value.order.orderNumber = otherNumber;
    await expect(await v1Fixture([preparedEvent(value)]), "REVIEW_REQUIRED", "INVALID_PREPARED_INTENT");
  });
  await check("PREPARED embedded historical hash mismatch requires review", async () => {
    const value = intent(); value.order.idempotencyRequestHash = inventoryHash("different");
    await expect(await v1Fixture([preparedEvent(value)]), "REVIEW_REQUIRED", "INVALID_PREPARED_INTENT");
  });
  for (const [field, value] of [["intentHash", inventoryHash("wrong-intent")], ["transactionId", "wrong-transaction"],
    ["state", "unsupported"], ["protocolVersion", 2]]) {
    await check("V1 order metadata mismatch " + field, async () => {
      const dir = await v1Fixture([preparedEvent()]), valueOrder = v1(intent()); valueOrder.inventoryTransaction[field] = value;
      await order(dir, valueOrder); await expect(dir, "REVIEW_REQUIRED");
    });
  }
  for (const field of ["transactionId", "intentHash", "state"]) {
    await check("partial V1 metadata cannot be treated as legacy " + field, async () => {
      const dir = await fixture(), value = v1(intent()); delete value.inventoryTransaction[field]; await order(dir, value);
      await expect(dir, "REVIEW_REQUIRED", "MALFORMED_V1_ORDER_METADATA");
    });
  }
  await check("V1 markers without protocolVersion require review", async () => {
    const dir = await fixture(), value = v1(intent()); delete value.inventoryTransaction.protocolVersion; await order(dir, value);
    await expect(dir, "REVIEW_REQUIRED", "MALFORMED_V1_ORDER_METADATA");
  });
  await check("declared order with another UUID requires review", async () => {
    const dir = await v1Fixture([preparedEvent()]), value = v1(intent()); value.idempotencyKey = otherKey; await order(dir, value);
    await expect(dir, "REVIEW_REQUIRED", "V1_ORDER_CORRELATION_MISMATCH");
  });
  await check("FINALIZED missing order requires review", async () => {
    await expect(await v1Fixture([preparedEvent(), { type: "FINALIZED" }]), "REVIEW_REQUIRED", "FINALIZED_ORDER_MISSING_OR_UNCOMMITTED");
  });
  await check("FINALIZED pending order requires review", async () => {
    await expect(await v1Fixture([preparedEvent(), { type: "FINALIZED" }], "inventory_pending"), "REVIEW_REQUIRED", "FINALIZED_ORDER_MISSING_OR_UNCOMMITTED");
  });
  for (const progress of [applied, { type: "COMPENSATION_PENDING", domain: "store" }, { type: "COMPENSATED", domain: "store", receiptHash }]) {
    await check("execution progress without order requires review " + progress.type, async () => {
      await expect(await v1Fixture([preparedEvent(), progress]), "REVIEW_REQUIRED", "EXECUTION_PROGRESS_WITHOUT_ORDER");
    });
  }
  for (const progress of [applied, { type: "ABORT", reason: "apply rejected" },
    { type: "COMPENSATION_PENDING", domain: "store" }, { type: "COMPENSATED", domain: "store", receiptHash }]) {
    await check("non-terminal progress stays durable V1 PENDING " + progress.type, async () => {
      const result = await expect(await v1Fixture([preparedEvent(), progress], "inventory_pending"), "PROTOCOL_V1_ATTEMPT");
      assert.ok(result.kind === "PROTOCOL_V1_ATTEMPT"); if (result.kind === "PROTOCOL_V1_ATTEMPT") assert.equal(result.journalState, "PENDING");
    });
  }
  await check("journal plus extra orphan V1 order requires review", async () => {
    const dir = await v1Fixture([preparedEvent()], "inventory_pending");
    await order(dir, { ...v1(intent()), orderNumber: otherNumber });
    await expect(dir, "REVIEW_REQUIRED", "EXTRA_CANONICAL_V1_ORDER");
  });
  await check("metadata in another order number is not fuzzy-correlated", async () => {
    const dir = await v1Fixture([preparedEvent()]);
    await order(dir, { ...v1(intent()), orderNumber: otherNumber }); await expect(dir, "REVIEW_REQUIRED", "EXTRA_CANONICAL_V1_ORDER");
  });
  await check("file/order number mismatch requires review", async () => {
    const dir = await v1Fixture([preparedEvent()]); await order(dir, v1(intent()), otherNumber + ".json");
    await expect(dir, "REVIEW_REQUIRED", "MALFORMED_MATCHING_ORDER");
  });
  for (const events of [[{ type: "FINALIZED" }, { type: "ABORTED" }], [{ type: "ABORTED" }, { type: "FINALIZED" }],
    [{ type: "ABORT", reason: "abort" }, { type: "FINALIZED" }], [{ type: "FINALIZED" }, applied],
    [{ type: "RESTORED", domain: "store", receiptHash }]]) {
    await check("contradictory terminal/creation event sequence requires review " + checks, async () => {
      await expect(await v1Fixture([preparedEvent(), ...events], "inventory_committed"), "REVIEW_REQUIRED", "CONTRADICTORY_JOURNAL_STATE");
    });
  }
  await check("ABORTED with committed order requires review", async () => {
    await expect(await v1Fixture([preparedEvent(), { type: "ABORTED" }], "inventory_committed"), "REVIEW_REQUIRED", "ABORT_WITH_COMMITTED_ORDER");
  });
  await check("repeated ABORTED markers remain durable aborted authority", async () => {
    const result = await expect(await v1Fixture([preparedEvent(), { type: "ABORTED" }, { type: "ABORTED" }], "inventory_pending"), "PROTOCOL_V1_ATTEMPT");
    assert.ok(result.kind === "PROTOCOL_V1_ATTEMPT"); if (result.kind === "PROTOCOL_V1_ATTEMPT") assert.equal(result.journalState, "ABORTED");
  });
  await check("progress from unknown participant requires review", async () => {
    await expect(await v1Fixture([preparedEvent(), { ...applied, domain: "other" }], "inventory_pending"), "REVIEW_REQUIRED", "CONTRADICTORY_JOURNAL_STATE");
  });
  await check("journal hash corruption requires review", async () => {
    const dir = await fixture(), location = await journal(dir, [preparedEvent()]);
    const file = path.join(location, "00000000.json"), value = JSON.parse(await fs.readFile(file, "utf8")); value.hash = "0".repeat(64);
    await fs.writeFile(file, JSON.stringify(value)); await expect(dir, "REVIEW_REQUIRED", "CORRUPT_JOURNAL");
  });
  await check("journal sequence gap requires review", async () => {
    const dir = await fixture(), location = await journal(dir, [preparedEvent(), applied]); await fs.unlink(path.join(location, "00000000.json"));
    await expect(dir, "REVIEW_REQUIRED", "CORRUPT_JOURNAL");
  });
  await check("empty existing journal is not safe absence", async () => {
    const dir = await fixture(); await journal(dir, []); await expect(dir, "REVIEW_REQUIRED", "INVALID_PREPARED_INTENT");
  });
  await check("RESTORE_PREPARED cannot substitute creation PREPARED", async () => {
    await expect(await v1Fixture([{ type: "RESTORE_PREPARED", intent: intent() }]), "REVIEW_REQUIRED", "INVALID_PREPARED_INTENT");
  });
  await check("corrupt root JSON blocks safe absence even without known key", async () => {
    const dir = await fixture(); await fs.writeFile(path.join(dir, "unreadable.json"), "{");
    await expect(dir, "REVIEW_REQUIRED", "CORRUPT_ORDER_SOURCE");
  });
  await check("non-object order JSON blocks safe absence", async () => {
    const dir = await fixture(); await fs.writeFile(path.join(dir, "unreadable.json"), "[]");
    await expect(dir, "REVIEW_REQUIRED", "CORRUPT_ORDER_SOURCE");
  });
  await check("JSON-named directory is unsafe order entry", async () => {
    const dir = await fixture(); await fs.mkdir(path.join(dir, "unsafe.json")); await expect(dir, "REVIEW_REQUIRED", "UNSAFE_ORDER_SOURCE");
  });
  await check("matching unexpected object shape requires review", async () => {
    const dir = await fixture(); await order(dir, { ...legacy(), status: null }); await expect(dir, "REVIEW_REQUIRED", "MALFORMED_MATCHING_ORDER");
  });
  await check("oversized order bounded before parsing", async () => {
    const dir = await fixture(); await fs.writeFile(path.join(dir, number + ".json"), Buffer.alloc(2 * 1024 * 1024 + 1, 32));
    await expect(dir, "REVIEW_REQUIRED", "ORDER_READ_LIMIT");
  });
  await check("oversized journal bounded before generic chain reading", async () => {
    const dir = await fixture(), location = await journal(dir, [preparedEvent()]);
    await fs.writeFile(path.join(location, "00000000.json"), Buffer.alloc(2 * 1024 * 1024 + 1, 32));
    await expect(dir, "REVIEW_REQUIRED", "JOURNAL_READ_LIMIT");
  });
  await check("unrelated nested runtime/locks/transactions are not recursively scanned", async () => {
    const dir = await fixture();
    for (const name of ["runtime", ".idempotency", ".transactions"]) {
      await fs.mkdir(path.join(dir, name)); await fs.writeFile(path.join(dir, name, "unrelated-corrupt.json"), "{");
    }
    await expect(dir, "NONE");
  });
  await check("non-directory transactions parent fails closed", async () => {
    const dir = await fixture(); await fs.writeFile(path.join(dir, ".transactions"), "unsafe");
    await expect(dir, "REVIEW_REQUIRED", "UNSAFE_JOURNAL_SOURCE");
  });
  await check("explicit orderDir may not be defaulted to project storage", async () => {
    for (const orderDir of ["", "relative-orders", path.parse(suite).root]) {
      await assert.rejects(async () => resolveCheckoutAttemptEvidence({ orderDir, canonicalAttemptKey: key }), CheckoutAttemptEvidenceInputError);
    }
  });
  await check("invalid UUID rejected through B1 helper", async () => {
    await assert.rejects(async () => resolveCheckoutAttemptEvidence({ orderDir: suite, canonicalAttemptKey: "invalid" }), PublicCheckoutContractError);
  });
  await check("B2 scope: no writes/network/environment mutation; every query tree preserved", async () => {
    assert.equal(writeCalls, 0); assert.equal(networkCalls, 0); assert.deepEqual({ ...process.env }, initialEnv);
    assert.ok(queryCount >= 30);
  });
  console.log("J.6F.5C2B2 PASS " + checks + "/" + checks + "; immutable fixture queries=" + queryCount + "; writes=0 network=0");
} finally {
  globalThis.fetch = originalFetch;
  const realSuite = await fs.realpath(suite);
  if (path.dirname(realSuite).toLowerCase() !== tempParent.toLowerCase()) throw new Error("Refusing cleanup outside verified OS temp parent");
  await fs.rm(realSuite, { recursive: true, force: true });
}
