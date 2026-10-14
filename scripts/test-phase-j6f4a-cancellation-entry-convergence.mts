import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import inspector from "node:inspector";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as nodeModule from "node:module";
import { pathToFileURL } from "node:url";
type LoadResult = { format?: string | null; source?: string | ArrayBuffer | SharedArrayBuffer | Uint8Array; shortCircuit?: boolean };
type RegisterHooks = (hooks: { load: (url: string, context: object, nextLoad: (url: string, context: object) => LoadResult) => LoadResult }) => unknown;
const nodeHooks = nodeModule as typeof nodeModule & { registerHooks?: RegisterHooks };
if (process.argv.includes("--baseline-worker")) {
  if (!nodeHooks.registerHooks) throw new Error("Node registerHooks required");
  nodeHooks.registerHooks({ load(url, context, nextLoad) {
    for (const file of ["lib/fulfillment.ts", "lib/orderCancellation.ts"]) {
      if (url === pathToFileURL(path.join(process.cwd(), file)).href) return {
        format: "module-typescript", source: execFileSync("git", ["show", "5e9cf0178c7033c96c70af8944749787e79e02d3:" + file],
          { cwd: process.cwd(), encoding: "utf8", windowsHide: true }), shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  } });
}

async function baselineWorker() {
for (const key of ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_INTERNAL_CHANNEL_ACCESS_TOKEN", "LINE_ORDER_RECIPIENT_ID", "LINE_INTERNAL_RECIPIENT_ID"]) delete process.env[key];
const root = process.argv[3] ?? await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6f4a-baseline-"));
process.env.KD_DATA_DIR = root;
const now = () => new Date("2026-10-13T03:00:00.000Z");
const identity = await import("../lib/memberIdentity");
const rules = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");
const fulfillment = await import("../lib/fulfillment");
const admin = await import("../lib/adminOrders");
await fs.mkdir(path.join(root, "store"), { recursive: true }); await fs.mkdir(path.join(root, "orders"), { recursive: true });
const website = path.join(root, "store/website-data.json");
await fs.writeFile(website, JSON.stringify({ version: 1, menu: { products: [{ id: "coffee", slug: "coffee", stock: 7,
  purchase: [], skus: [{ id: "coffee-sku", stock: 7, enabled: true, kind: "beans", price: 500 }] }] } }));
await rules.saveMembershipBusinessRules({ expectedRevision: 0, rules: structuredClone(rules.DEFAULT_MEMBERSHIP_RULES), now: now() });
const member = (await identity.provisionCanonicalMember({ provider: "email", subject: "j6f4a@example.test", persistMember: async () => undefined })).member;
const orderNumber = "KD20261013-4401";
await commerce.adjustMemberCreditByAdmin({ memberId: member.memberId, direction: "grant", amount: 100, reason: "isolated fixture",
  idempotencyKey: "j6f4a-credit-grant", now: now() });
const reservation = await commerce.reserveCredit({ memberId: member.memberId, orderId: orderNumber, requestedAmount: 100,
  merchandiseSubtotal: 1000, shipping: 0, idempotencyKey: "j6f4a-credit-reserve", now: now() });
await fs.writeFile(path.join(root, "orders", orderNumber + ".json"), JSON.stringify({
  orderNumber, createdAt: now().toISOString(), orderMode: "studio_pickup", status: "waiting_studio_pickup_confirmation",
  member: { memberId: member.memberId }, customer: { name: "Fixture" },
  items: [{ name: "Coffee", slug: "coffee", quantity: 2, unitPrice: 500, lineTotal: 1000 }],
  subtotal: 1000, shipping: 0, total: 900, credit: { reservationId: reservation.reservationId, appliedAmount: 100, status: "reserved" },
  inventoryTransaction: { state: "inventory_committed", changes: [{ skuId: "coffee-sku", productSlug: "coffee", productName: "Coffee", demand: 2 }] },
}));
const result = await fulfillment.recordAdminFulfillmentEvent({ orderId: orderNumber, state: "cancelled", expectedRevision: 0,
  confirmed: true, note: "Baseline cancellation reproduction", now: now() });
const order = await admin.readOrder(orderNumber); assert.ok(order);
const state = await commerce.readMembershipCommerceState();
const coffee = JSON.parse(await fs.readFile(website, "utf8"));
const evidence = { fulfillmentState: result.record.currentState, summaryState: order.fulfillmentSummary?.state,
  orderStatus: order.status, coffeeStock: coffee.menu.products[0].skus[0].stock,
  creditStatus: state.creditReservations[reservation.reservationId].status };
assert.deepEqual(evidence, { fulfillmentState: "cancelled", summaryState: "cancelled",
  orderStatus: "waiting_studio_pickup_confirmation", coffeeStock: 7, creditStatus: "reserved" });
console.log("BASELINE_SPLIT_PROOF " + JSON.stringify(evidence));
}

type CoverageResult = { result: Array<{ url: string; functions: Array<{ functionName: string; ranges: Array<{ count: number }> }> }> };
async function suite() {
  let checks = 0;
  function check(name: string, condition: unknown) {
    assert.ok(condition, name); console.log(`PASS ${++checks} ${name}`);
  }
  const targetedProjection = process.argv.includes("--targeted-projection");
  if (!targetedProjection) {
    const baseline = execFileSync(process.execPath, [...process.execArgv, process.argv[1], "--baseline-worker"],
      { cwd: process.cwd(), encoding: "utf8", windowsHide: true, timeout: 60_000 });
    console.log(baseline.trim());
    check("preserved pre-fix commit baseline proves active order / cancelled fulfillment / stock unchanged / reserved credit", baseline.includes("BASELINE_SPLIT_PROOF"));
  }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6f4a-convergence-"));
  console.log("ISOLATED_FIXTURE " + root);
  process.env.KD_DATA_DIR = root;
  process.env.AUTH_SESSION_SECRET = "j6f4a-test-only-secret-longer-than-thirty-two-characters";
  for (const key of ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_INTERNAL_CHANNEL_ACCESS_TOKEN", "LINE_ORDER_RECIPIENT_ID", "LINE_INTERNAL_RECIPIENT_ID"]) delete process.env[key];
  const now = () => new Date("2026-10-13T03:00:00.000Z");
  const identity = await import("../lib/memberIdentity");
  const rules = await import("../lib/membershipBusinessRules");
  const commerce = await import("../lib/membershipCommerce");
  const fulfillment = await import("../lib/fulfillment");
  const cancellation = await import("../lib/orderCancellation");
  const projection = await import("../lib/fulfillmentCancellationProjection");
  const admin = await import("../lib/adminOrders");
  const auth = await import("../lib/adminAuth");
  (globalThis as typeof globalThis & { __creditTestAdminCookie?: string }).__creditTestAdminCookie = auth.createAdminSessionValue();
  const adminRoute = await import("../app/api/admin/orders/[orderNumber]/route");
  const fulfillmentRoute = await import("../app/api/admin/fulfillment/orders/[orderNumber]/route");
  const member = (await identity.provisionCanonicalMember({ provider: "email", subject: "j6f4a-current@example.test", persistMember: async () => undefined })).member.memberId;
  const referredMember = (await identity.provisionCanonicalMember({ provider: "email", subject: "j6f4a-referred@example.test", persistMember: async () => undefined })).member.memberId;
  await fs.mkdir(path.join(root, "orders"), { recursive: true });
  await fs.mkdir(path.join(root, "store"), { recursive: true });
  await rules.saveMembershipBusinessRules({ expectedRevision: 0, rules: structuredClone(rules.DEFAULT_MEMBERSHIP_RULES), now: now() });
  const website = path.join(root, "store", "website-data.json");
  const storeFile = path.join(root, "store-domain", "catalog.json");
  const fulfillmentFile = path.join(root, "fulfillment", "state.json");
  await fs.mkdir(path.dirname(storeFile), { recursive: true });
  await fs.writeFile(storeFile, JSON.stringify({ fixture: "Store inventory must never mutate", products: [{ id: "store-item", stock: 9 }] }));
  const stock = async () => JSON.parse(await fs.readFile(website, "utf8")).menu.products[0].skus[0].stock as number;
  const writeOrder = async (order: Record<string, unknown>) => fs.writeFile(path.join(root, "orders", String(order.orderNumber) + ".json"), JSON.stringify(order));
  const readOrder = async (id: string) => { const value = await admin.readOrder(id); assert.ok(value); return value; };
  let sequence = 4500;
  async function seed(extra: Record<string, unknown> = {}) {
    const id = "KD20261013-" + (++sequence);
    // Legacy committed fixture: original stock 7, committed quantity 2, current stock 5.
    await fs.writeFile(website, JSON.stringify({ version: 1, menu: { products: [{ id: "coffee", slug: "coffee", stock: 5,
      skus: [{ id: "coffee-sku", stock: 5, enabled: true, kind: "beans", price: 500 }] }] } }));
    await commerce.adjustMemberCreditByAdmin({ memberId: member, direction: "grant", amount: 100, reason: "isolated fixture",
      idempotencyKey: "j6f4a-grant:" + id, now: now() });
    const credit = await commerce.reserveCredit({ memberId: member, orderId: id, requestedAmount: 100, merchandiseSubtotal: 1000,
      shipping: 0, idempotencyKey: "j6f4a-reserve:" + id, now: now() });
    const order = { orderNumber: id, createdAt: now().toISOString(), orderMode: "studio_pickup",
      status: "waiting_studio_pickup_confirmation", member: { memberId: member }, customer: { name: "Fixture" },
      items: [{ name: "Coffee", slug: "coffee", quantity: 2, unitPrice: 500, lineTotal: 1000 }],
      subtotal: 1000, shipping: 0, total: 900, credit: { reservationId: credit.reservationId, appliedAmount: 100, status: "reserved" },
      inventoryTransaction: { state: "inventory_committed", changes: [{ skuId: "coffee-sku", productSlug: "coffee", productName: "Coffee", demand: 2 }] },
      ...extra };
    await writeOrder(order);
    return { id, reservationId: credit.reservationId };
  }
  const creditStatus = async (reservationId: string) => (await commerce.readMembershipCommerceState()).creditReservations[reservationId].status;
  const core = (id: string, extra: Record<string, unknown> = {}) => cancellation.cancelOrderCanonically({
    orderNumber: id, cancelledBy: "admin", cancellationReason: "isolated cancellation",
    idempotencyKey: "j6f4a-cancel:" + id, now, sendNotification: async () => ({ sent: false }), ...extra });
  const fulfill = (id: string, extra: Record<string, unknown> = {}) => fulfillment.recordAdminFulfillmentEvent({
    orderId: id, state: "cancelled", expectedRevision: 0, confirmed: true, note: "isolated cancellation", now: now(), ...extra });
  async function routeCall(route: { PATCH: (request: Request, context: { params: Promise<{ orderNumber: string }> }) => Promise<Response> }, id: string, body: Record<string, unknown>) {
    return route.PATCH(new Request("http://localhost/api/admin/fulfillment/orders/" + id, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ orderNumber: id }) });
  }
  const session = new inspector.Session(); session.connect();
  const post = (method: string, params: object = {}) => new Promise<unknown>((resolve, reject) =>
    session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
  await post("Profiler.enable");
  await post("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
  async function calls() {
    const result = await post("Profiler.takePreciseCoverage") as CoverageResult;
    const names = ["cancelOrderCanonically", "returnCommittedInventoryForCancellation", "settleCreditReservationForOrder",
      "settleCreditReservation", "handleReferralQualificationOrderOutcome", "cancelSubscriptionCycleForOrder",
      "cancelOrReverseRetailPromotionRewards", "runConsequence"];
    return Object.fromEntries(names.map(name => [name, result.result.filter(script => /\/(lib)\/(orderCancellation|orderInventoryReturn|membershipCommerce|fulfillment)\.ts$/.test(script.url.replaceAll("\\", "/")))
      .flatMap(script => script.functions).filter(fn => fn.functionName === name).reduce((sum, fn) => sum + (fn.ranges[0]?.count ?? 0), 0)]));
  }
  function once(name: string, counts: Record<string, number>, memberOrder = true) {
    console.log("CALL_COUNTS " + name + " " + JSON.stringify(counts));
    for (const fn of ["returnCommittedInventoryForCancellation", "settleCreditReservationForOrder", "settleCreditReservation", "cancelSubscriptionCycleForOrder"]) {
      check(name + " " + fn + " exactly once", counts[fn] === 1);
    }
    check(name + " qualification " + (memberOrder ? "once" : "absent for guest"), counts.handleReferralQualificationOrderOutcome === (memberOrder ? 1 : 0));
    check(name + " projection never dispatches runConsequence", counts.runConsequence === 0);
  }
  function noBusiness(name: string, counts: Record<string, number>) {
    for (const fn of ["returnCommittedInventoryForCancellation", "settleCreditReservationForOrder", "settleCreditReservation",
      "handleReferralQualificationOrderOutcome", "cancelSubscriptionCycleForOrder", "cancelOrReverseRetailPromotionRewards", "runConsequence"]) {
      check(name + " no " + fn, counts[fn] === 0);
    }
  }
  async function coherent(name: string, fixture: { id: string; reservationId: string }) {
    const order = await readOrder(fixture.id);
    const record = (await fulfillment.readFulfillmentStore()).records[fixture.id];
    check(name + " main order cancelled", order.status === "cancelled");
    check(name + " original stock restored to 7", await stock() === 7);
    check(name + " credit reservation released", await creditStatus(fixture.reservationId) === "released");
    check(name + " summary cancelled", order.fulfillmentSummary?.state === "cancelled");
    check(name + " record cancelled", record?.currentState === "cancelled");
    check(name + " exactly one cancellation event", record?.events.filter(event => event.state === "cancelled").length === 1);
    check(name + " durable canonical effects completion", order.canonicalCancellation?.state === "completed");
    check(name + " stable canonical operation key", order.canonicalCancellation?.operationId === "order-cancel:" + fixture.id);
  }
  async function unchanged(name: string, fixture: { id: string; reservationId: string }, action: () => Promise<unknown>) {
    const before = await fs.readFile(path.join(root, "orders", fixture.id + ".json"), "utf8");
    const coffeeBefore = await fs.readFile(website, "utf8");
    const storeBefore = await fs.readFile(storeFile, "utf8");
    const fulfillmentBefore = await fs.readFile(fulfillmentFile, "utf8").catch(error => { if (error.code === "ENOENT") return null; throw error; });
    await calls();
    await action();
    check(name + " order JSON byte-for-byte unchanged", await fs.readFile(path.join(root, "orders", fixture.id + ".json"), "utf8") === before);
    check(name + " Coffee inventory unchanged", await fs.readFile(website, "utf8") === coffeeBefore);
    check(name + " Store inventory unchanged", await fs.readFile(storeFile, "utf8") === storeBefore);
    check(name + " reserved credit unchanged", await creditStatus(fixture.reservationId) === "reserved");
    check(name + " fulfillment unchanged", await fs.readFile(fulfillmentFile, "utf8").catch(error => { if (error.code === "ENOENT") return null; throw error; }) === fulfillmentBefore);
    noBusiness(name, await calls());
  }
  async function snapshot(folder: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    async function visit(dir: string) {
      for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(error => { if (error.code === "ENOENT") return []; throw error; })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) await visit(file);
        else if (entry.isFile()) result[file] = createHash("sha256").update(await fs.readFile(file)).digest("hex");
      }
    }
    await visit(folder); return result;
  }
  const runtimeBefore = await snapshot("F:\\KD_Coffee_LOCAL_RUNTIME");
  if (targetedProjection) {
    const fixture = await seed();
    const blocker = path.join(root, "projection-blocker");
    const blockedPath = path.join(blocker, "fulfillment", "state.json");
    await fs.writeFile(blocker, "owned isolated fixture blocker");
    await calls();
    await assert.rejects(() => core(fixture.id, { fulfillmentFilePath: blockedPath }));
    once("targeted initial projection failure", await calls());
    check("targeted blocker file remains untouched", (await fs.stat(blocker)).isFile() &&
      await fs.readFile(blocker, "utf8") === "owned isolated fixture blocker");
    const cancelled = await readOrder(fixture.id);
    check("targeted initial order cancelled", cancelled.status === "cancelled");
    check("targeted initial effects completed", cancelled.canonicalCancellation?.state === "completed");
    check("targeted initial Coffee restored once", await stock() === 7);
    check("targeted initial credit released", await creditStatus(fixture.reservationId) === "released");
    check("targeted initial Store stock unchanged", JSON.parse(await fs.readFile(storeFile, "utf8")).products[0].stock === 9);
    const returned = JSON.stringify(cancelled.inventoryReturn), marker = JSON.stringify(cancelled.canonicalCancellation);
    const coffeeBytes = await fs.readFile(website, "utf8"), storeBytes = await fs.readFile(storeFile, "utf8");
    const creditFile = path.join(root, "membership-commerce", "commerce-state.json");
    const creditBytes = await fs.readFile(creditFile, "utf8");
    await calls();
    await assert.rejects(() => fulfill(fixture.id, { filePath: blockedPath }), fulfillment.FulfillmentError);
    noBusiness("targeted blocker retry", await calls());
    check("targeted production does not delete blocker", await fs.readFile(blocker, "utf8") === "owned isolated fixture blocker");
    await fs.unlink(blocker); // Remove only the known fixture file; production must prepare the missing directory.
    check("targeted missing fulfillment parent not created by test", await fs.access(path.dirname(blockedPath))
      .then(() => false, error => { if (error.code !== "ENOENT") throw error; return true; }));
    await calls();
    const repaired = await fulfill(fixture.id, { filePath: blockedPath });
    const repairCalls = await calls();
    noBusiness("targeted projection-only repair", repairCalls);
    check("targeted repaired cancelled record", repaired.record.currentState === "cancelled");
    check("targeted production prepared parent", (await fs.stat(path.dirname(blockedPath))).isDirectory());
    check("targeted projection file created", (await fulfillment.readFulfillmentStore(blockedPath)).records[fixture.id]?.currentState === "cancelled");
    const order = await readOrder(fixture.id);
    check("targeted order and summary cancelled", order.status === "cancelled" && order.fulfillmentSummary?.state === "cancelled");
    check("targeted original inventoryReturn preserved", JSON.stringify(order.inventoryReturn) === returned);
    check("targeted original effects marker preserved", JSON.stringify(order.canonicalCancellation) === marker);
    check("targeted Coffee inventory bytes unchanged", await fs.readFile(website, "utf8") === coffeeBytes);
    check("targeted Store inventory bytes unchanged", await fs.readFile(storeFile, "utf8") === storeBytes);
    check("targeted credit bytes unchanged", await fs.readFile(creditFile, "utf8") === creditBytes);
    check("targeted credit remains released", await creditStatus(fixture.reservationId) === "released");
    check("targeted one projection event", repaired.record.events.length === 1);
    const projectionBytes = await fs.readFile(blockedPath, "utf8");
    await calls(); await fulfill(fixture.id, { filePath: blockedPath });
    const replayCalls = await calls(); noBusiness("targeted repaired replay", replayCalls);
    check("targeted replay projection bytes unchanged", await fs.readFile(blockedPath, "utf8") === projectionBytes);
    check("targeted replay Coffee and credit unchanged", await fs.readFile(website, "utf8") === coffeeBytes &&
      await fs.readFile(creditFile, "utf8") === creditBytes);
    check("targeted LOCAL_RUNTIME unchanged", JSON.stringify(await snapshot("F:\\KD_Coffee_LOCAL_RUNTIME")) === JSON.stringify(runtimeBefore));
    console.log("TARGETED_PROJECTION_EVIDENCE " + JSON.stringify({root, orderNumber:fixture.id, blockedPath,
      coffeeAfterInitial:7, coffeeAfterRepair:await stock(), storeAfterRepair:9, creditAfterRepair:await creditStatus(fixture.reservationId),
      repairCalls, replayCalls, fulfillment:repaired.record.currentState}));
    await post("Profiler.stopPreciseCoverage"); session.disconnect();
    console.log(`J.6F.4A TARGETED PROJECTION PASS ${checks}/${checks}`); return;
  }
  for (const actor of ["member", "admin-order", "admin-fulfillment"] as const) {
    const fixture = await seed();
    await calls();
    if (actor === "member") {
      const response = await cancellation.requestMemberOrderCancellation({ orderNumber: fixture.id, memberId: member,
        cancellationReason: "member fixture cancellation", idempotencyKey: "member-cancel:" + fixture.id, now,
        sendNotification: async () => ({ sent: false }) });
      check("Member accepted pre-shipment", response.result === "cancelled");
    } else if (actor === "admin-order") {
      const response = await routeCall(adminRoute, fixture.id, { status: "cancelled", cancellationReason: "admin fixture cancellation" });
      check("Admin order PATCH success", response.status === 200);
    } else {
      const response = await routeCall(fulfillmentRoute, fixture.id, { state: "cancelled", expectedRevision: 0, confirmed: true, note: "fulfillment fixture cancellation" });
      check("Admin fulfillment PATCH success", response.status === 200);
      const payload = await response.json() as { record?: { currentState: string } };
      check("Admin fulfillment preserves {record} response", payload.record?.currentState === "cancelled");
    }
    once(actor, await calls()); await coherent(actor, fixture);
    await calls(); await fulfill(fixture.id); await core(fixture.id);
    noBusiness(actor + " replay", await calls()); await coherent(actor + " replay", fixture);
  }
  const race = await seed();
  await calls();
  const raced = await Promise.all([core(race.id), fulfill(race.id)]);
  check("real concurrent Admin core vs fulfillment succeeds", raced.every(result => !("ok" in result) || result.ok));
  once("race", await calls()); await coherent("race", race);

  const shipment = await seed({ status: "shipment_created", orderMode: "711_cod",
    fulfillmentSummary: { state: "preparing", externalOrderId: "CM12345678", externalShipmentId: "E1234567" } });
  await unchanged("shipment ordinary Admin", shipment, async () => assert.rejects(() => core(shipment.id), admin.OrderStatusTransitionError));
  await unchanged("shipment fulfillment state alone", shipment, async () => {
    const response = await routeCall(fulfillmentRoute, shipment.id, { state: "cancelled", expectedRevision: 0, confirmed: true });
    check("shipment fulfillment fails closed 409", response.status === 409);
  });
  await unchanged("shipment explicit confirmation without Member request", shipment, async () => assert.rejects(
    () => core(shipment.id, { confirmedExternalShipmentVoid: true }), admin.OrderStatusTransitionError));
  const voidRequest = await cancellation.requestMemberOrderCancellation({ orderNumber: shipment.id, memberId: member,
    cancellationReason: "please void shipment", idempotencyKey: "void-request:" + shipment.id, now });
  check("Member shipment request remains manual-void request", voidRequest.result === "requires_manual_shipment_void");
  check("request alone leaves order shipment_created", (await readOrder(shipment.id)).status === "shipment_created");
  check("request alone leaves committed stock 5", await stock() === 5);
  check("request alone leaves credit reserved", await creditStatus(shipment.reservationId) === "reserved");
  check("request alone has no cancelled fulfillment", !(await fulfillment.readFulfillmentStore()).records[shipment.id]?.events.some(event => event.state === "cancelled"));
  await unchanged("Member request without Admin explicit void", shipment, async () => assert.rejects(() => core(shipment.id), admin.OrderStatusTransitionError));
  await unchanged("fulfillment confirmed does not mean external void", shipment, async () => assert.rejects(() => fulfill(shipment.id), fulfillment.FulfillmentError));
  await calls();
  check("existing explicit Admin void confirmation succeeds", (await core(shipment.id, { confirmedExternalShipmentVoid: true })).ok);
  once("manual void", await calls()); await coherent("manual void", shipment);
  check("existing Member void request completed", (await readOrder(shipment.id)).memberCancellationRequest?.state === "completed");

  const completedAt = "2026-10-12T06:37:00.000Z", returnDeadline = "2026-10-26T15:59:59.999Z";
  const completed = await seed({ status: "completed", completedAt, returnDeadline,
    completion: { schemaVersion: 1, eventId: "completed-fixture", completedAt, timeZone: "Asia/Taipei",
      returnProtectionDaysSnapshot: 14, rulesVersion: 1, returnDeadline } });
  await unchanged("completed Member", completed, async () => {
    const result = await cancellation.requestMemberOrderCancellation({ orderNumber: completed.id, memberId: member,
      cancellationReason: "completed cancellation", idempotencyKey: "completed-member:" + completed.id, now });
    check("Member completed uses existing customer-service response", result.result === "customer_service_required");
  });
  await unchanged("completed Admin order", completed, async () => {
    const response = await routeCall(adminRoute, completed.id, { status: "cancelled", cancellationReason: "completed cancellation" });
    check("Admin order completed rejects 409", response.status === 409);
  });
  await unchanged("completed Admin fulfillment", completed, async () => {
    const response = await routeCall(fulfillmentRoute, completed.id, { state: "cancelled", expectedRevision: 0, confirmed: true });
    check("Admin fulfillment completed rejects 409", response.status === 409);
  });
  const terminal = await readOrder(completed.id);
  check("completedAt immutable", terminal.completedAt === completedAt);
  check("returnDeadline immutable", terminal.returnDeadline === returnDeadline && terminal.completion.returnDeadline === returnDeadline);
  await assert.rejects(() => projection.appendFulfillmentCancellationProjection({ orderNumber: completed.id }), admin.OrderStatusTransitionError);
  check("projection itself cannot bypass completed terminal", (await readOrder(completed.id)).status === "completed");

  for (const lines of [[{ domain: "store" }], [{ domain: "coffee" }, { domain: "store" }], [{ domain: "unknown" }], [{ domain: null }]]) {
    const fixture = await seed({ items: lines, inventoryTransaction: { protocolVersion: 1, state: "inventory_committed",
      transactionId: "commerce-order:fixture:" + sequence, intentHash: "a".repeat(64),
      participantReceipts: lines.filter(line => line.domain === "coffee" || line.domain === "store").map(line => ({
        domain: line.domain, operationId: "fixture-apply:" + sequence + ":" + line.domain, receiptHash: "b".repeat(64),
      })) } });
    const label = lines.map(line => String(line.domain)).join("+");
    await unchanged(label + " Admin core guard", fixture, async () => {
      if (label === "store" || label === "coffee+store") {
        const { CommerceOrderCancellationError } = await import("../lib/commerceOrderCancellation");
        await assert.rejects(() => core(fixture.id), (error: unknown) =>
          error instanceof CommerceOrderCancellationError && error.message === "REVIEW_REQUIRED" && error.status === 500);
      } else await assert.rejects(() => core(fixture.id), cancellation.UnsupportedOrderCancellationError);
    });
    await unchanged(label + " fulfillment guard", fixture, async () => {
      const response = await routeCall(fulfillmentRoute, fixture.id, { state: "cancelled", expectedRevision: 0, confirmed: true });
      if (label === "store" || label === "coffee+store") {
        check(label + " fulfillment returns deterministic 500", response.status === 500);
        check(label + " typed REVIEW_REQUIRED error", (await response.json() as { error?: string }).error === "REVIEW_REQUIRED");
      } else {
        check(label + " fulfillment returns deterministic 409", response.status === 409);
        check(label + " typed unsupported error", String((await response.json() as { error?: string }).error).includes(lines.some(line => line.domain === "store") ? "MIXED_CANCELLATION_NOT_SUPPORTED" : "INVALID_CANCELLATION_DOMAIN"));
      }
    });
    await unchanged(label + " Member guard", fixture, async () => {
      const operation = () => cancellation.requestMemberOrderCancellation({ orderNumber: fixture.id, memberId: member,
        cancellationReason: "domain guard", idempotencyKey: "member-guard:" + fixture.id, now });
      if (label === "store" || label === "coffee+store") {
        const { CommerceOrderCancellationError } = await import("../lib/commerceOrderCancellation");
        await assert.rejects(operation, (error: unknown) =>
          error instanceof CommerceOrderCancellationError && error.message === "REVIEW_REQUIRED" && error.status === 500);
      } else await assert.rejects(operation, cancellation.UnsupportedOrderCancellationError);
    });
  }
  const explicitCoffee = await seed({ items: [{ domain: "coffee", quantity: 2 }] });
  await calls(); await fulfill(explicitCoffee.id);
  once("explicit Coffee", await calls()); await coherent("explicit Coffee", explicitCoffee);

  const malformed = await seed({ inventoryTransaction: { state: "inventory_committed", changes: [{ skuId: "coffee-sku", demand: 0 }] } });
  const failureResponse = await routeCall(fulfillmentRoute, malformed.id, { state: "cancelled", expectedRevision: 0, confirmed: true });
  check("canonical inventory failure returns failure 500", failureResponse.status === 500);
  check("canonical failure never appends cancelled projection", !(await fulfillment.readFulfillmentStore()).records[malformed.id]);
  check("canonical failure never mirrors cancelled fulfillment", (await readOrder(malformed.id)).fulfillmentSummary?.state !== "cancelled");
  check("canonical failure leaves stock untouched", await stock() === 5);
  check("canonical failure leaves credit reserved", await creditStatus(malformed.reservationId) === "reserved");

  const stale = await seed();
  await unchanged("stale fulfillment revision", stale, async () => assert.rejects(() => fulfill(stale.id, { expectedRevision: 12 }), fulfillment.FulfillmentError));
  await unchanged("missing confirmation", stale, async () => assert.rejects(() => fulfill(stale.id, { confirmed: false }), fulfillment.FulfillmentError));

  const brokenProjection = await seed();
  const blocker = path.join(root, "projection-blocker");
  const blockedPath = path.join(blocker, "fulfillment", "state.json");
  await fs.writeFile(blocker, "owned isolated fixture blocker");
  await calls();
  await assert.rejects(() => core(brokenProjection.id, { fulfillmentFilePath: blockedPath }));
  once("projection persistence failure", await calls());
  check("projection failure preserves authoritative cancelled order", (await readOrder(brokenProjection.id)).status === "cancelled");
  check("projection failure preserves stock restored once", await stock() === 7);
  check("projection failure preserves released credit", await creditStatus(brokenProjection.reservationId) === "released");
  check("projection failure retains durable completed effects marker", (await readOrder(brokenProjection.id)).canonicalCancellation?.state === "completed");
  await fs.unlink(blocker); // One known file created by this fixture; no directory cleanup.
  await calls(); const repaired = await fulfill(brokenProjection.id, { filePath: blockedPath });
  noBusiness("projection-only repair", await calls());
  check("projection repair returns cancelled record", repaired.record.currentState === "cancelled");
  check("projection repair mirrors cancelled summary", (await readOrder(brokenProjection.id)).fulfillmentSummary?.state === "cancelled");
  check("projection repair produces one event", repaired.record.events.length === 1);
  await calls(); await fulfill(brokenProjection.id, { filePath: blockedPath });
  noBusiness("projection repair replay", await calls());

  const historical = await seed({ status: "cancelled", inventoryReturn: { state: "returned", startedAt: now().toISOString(), changes: [] } });
  const historicBytes = await fs.readFile(path.join(root, "orders", historical.id + ".json"), "utf8");
  await admin.readOrder(historical.id);
  fulfillment.fulfillmentRecordForOrder(await fulfillment.readFulfillmentStore(), await readOrder(historical.id));
  check("legacy read never rewrites historical JSON", await fs.readFile(path.join(root, "orders", historical.id + ".json"), "utf8") === historicBytes);
  await calls(); await fulfill(historical.id);
  noBusiness("historical cancelled projection-only repair", await calls());
  check("historical repair does not restore again", await stock() === 5);
  check("historical repair leaves credit unchanged", await creditStatus(historical.reservationId) === "reserved");
  check("historical repair adds only coherent summary", (await readOrder(historical.id)).fulfillmentSummary?.state === "cancelled");

  const subscriptionFixture = await seed();
  const item = { itemId: "coffee-half", packageWeight: "half-pound" as const, quantity: 1, roast: "淺中焙",
    unitPrice: 1000, components: [{ productId: "coffee", weightHalfPounds: 1 as const }] };
  const subscription = await commerce.createSubscription({ memberId: member, startedFromOrderId: "KD20261001-999001",
    anchorDate: "2026-10-20", intervalDays: 30, shippingMethod: "711_cod",
    storeSelection: { storeId: "123456", storeName: "測試門市" }, defaultItems: [item], idempotencyKey: "j6f4a-create-sub", now: now() });
  const active = await commerce.activateSubscriptionFromPickup({ subscriptionId: subscription.subscriptionId,
    orderId: subscription.startedFromOrderId, idempotencyKey: "j6f4a-activate-sub", now: now() });
  const cycle = await commerce.generateSubscriptionCycle({ subscriptionId: active.subscriptionId, sequence: 1,
    plannedDate: "2026-10-20", kind: "manual_replenishment", idempotencyKey: "j6f4a-cycle", now: now() });
  await commerce.lockSubscriptionCycle({ cycleId: cycle.cycleId, shipping: 0, idempotencyKey: "j6f4a-cycle-lock", now: now() });
  await commerce.createOrderFromCycle({ cycleId: cycle.cycleId, orderId: subscriptionFixture.id, idempotencyKey: "j6f4a-cycle-order", now: now() });
  await commerce.assignReferralRelationship({ referrerMemberId: member, referredMemberId: referredMember,
    idempotencyKey: "j6f4a-referral", now: now() }, { assertMember: async () => undefined });
  const rewards = await commerce.createReferralRewardsFromFulfillment({ sourceMemberId: referredMember, orderId: "KD20261012-999002",
    rewardType: "subscription", paidAmountBasis: 1000, basePV: 100, effectivePV: 100, discountRatio: 1,
    idempotencyKey: "j6f4a-reward-source", now: now() });
  const reward = rewards.find(entry => entry.beneficiaryMemberId === member); assert.ok(reward);
  const stateFile = path.join(root, "membership-commerce", "commerce-state.json");
  const legacyState = JSON.parse(await fs.readFile(stateFile, "utf8"));
  legacyState.referralRewards[reward.rewardId].qualificationAuthority = "legacy_order";
  await fs.writeFile(stateFile, JSON.stringify(legacyState));
  await commerce.registerReferralQualificationOrder({ memberId: member, orderId: subscriptionFixture.id,
    orderCreatedAt: now().toISOString(), orderType: "subscription", idempotencyKey: "j6f4a-qualification", now: now() });
  await calls(); await fulfill(subscriptionFixture.id);
  once("real subscription and qualification", await calls()); await coherent("real subscription and qualification", subscriptionFixture);
  const finalized = await commerce.readMembershipCommerceState();
  check("real subscription cycle cancelled", finalized.cycles[cycle.cycleId].status === "cancelled");
  check("real referral qualification attempt cancelled", finalized.referralRewards[reward.rewardId].qualificationAttempts?.some(
    attempt => attempt.orderNumber === subscriptionFixture.id && attempt.finalState === "cancelled"));
  await calls(); await Promise.all([core(subscriptionFixture.id), fulfill(subscriptionFixture.id)]);
  noBusiness("subscription/qualification replay", await calls());

  await post("Profiler.stopPreciseCoverage"); session.disconnect();
  check("LOCAL_RUNTIME entire file set and hashes unchanged", JSON.stringify(await snapshot("F:\\KD_Coffee_LOCAL_RUNTIME")) === JSON.stringify(runtimeBefore));
  const createRoute = execFileSync("git", ["show", "1e39676df206a1670d7e449069b2932dc8b3257a:app/api/orders/route.ts"], { encoding: "utf8", windowsHide: true });
  const baselineCreate = execFileSync("git", ["show", "8fe325c52d167e9c9216a767d102d94b8da1e21f:app/api/orders/route.ts"], { encoding: "utf8", windowsHide: true });
  check("live order-create committed F4A baseline unchanged", createRoute.replaceAll("\r\n", "\n") === baselineCreate.replaceAll("\r\n", "\n"));
  // commerceOrderTransaction.ts is excluded from the J.6F.4A HEAD source freeze:
  // later checkout-coverage phases extend order context; cancellation convergence is tested above.
  for (const file of ["lib/commerceOrderResolver.ts", "lib/commerceOrderPricing.ts", "lib/orderRewardBasis.ts"]) {
    const actual = await fs.readFile(path.join(process.cwd(), file), "utf8");
    const baselineSource = execFileSync("git", ["show", "HEAD:" + file], { encoding: "utf8", windowsHide: true });
    check(file + " protected semantics unchanged", actual.replaceAll("\r\n", "\n") === baselineSource.replaceAll("\r\n", "\n"));
  }
  console.log(`J.6F.4A PASS ${checks}/${checks}`);
}
if (process.argv.includes("--baseline-worker")) await baselineWorker();
else await suite();
