import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { StoredOrder } from "../lib/adminOrders";
import type { WebsiteData } from "../data/websiteData";

type Harness = { after: Array<() => Promise<void>>; member: null | { id: string; displayName: string; email: string; lineUserId: string }; profileUpdates: unknown[]; failScheduling: boolean; failFinalization: boolean };
const harness = (globalThis as unknown as { __orderEmailTest: Harness }).__orderEmailTest;
const root = await mkdtemp(path.join(os.tmpdir(), "kd-order-email-"));
process.env.KD_DATA_DIR = root;
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.AUTH_SESSION_SECRET = "synthetic-order-email-test-secret";
process.env.RESEND_API_KEY = "synthetic-resend-key-never-sent";
process.env.MEMBER_EMAIL_FROM = "KD Coffee <sender@example.test>";
process.env.MEMBER_SITE_URL = "https://member.example.test/base";
process.env.NEXT_PUBLIC_SITE_URL = "https://public.example.test";
delete process.env.CUSTOMER_SUPPORT_LINE_URL;
process.env.LINE_INTERNAL_CHANNEL_ACCESS_TOKEN = "synthetic-internal-token";
process.env.LINE_INTERNAL_RECIPIENT_ID = "synthetic-internal-group";
process.env.LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN = "synthetic-customer-token";
process.env.LINE_CHANNEL_ACCESS_TOKEN = "synthetic-legacy-token";
process.env.LINE_ORDER_RECIPIENT_ID = "synthetic-legacy-recipient";

const originalError = console.error;
const logs: string[] = [];
console.error = (...args: unknown[]) => { logs.push(args.map(value => typeof value === "string" ? value : JSON.stringify(value)).join(" ")); };
let checks = 0;
function check(label: string, condition: unknown) { assert.ok(condition, label); checks++; console.log(`PASS ${String(checks).padStart(2, "0")} ${label}`); }

try {
  const { POST } = await import("../app/api/orders/route");
  const { deliverOrderConfirmationEmail, createOrderConfirmationEmail, orderConfirmationRecipient } = await import("../lib/orderConfirmationEmail");
  const { updateOrderFile } = await import("../lib/orderFiles");
  const { resolvePickupDateAvailability } = await import("../lib/membershipPolicies");
  const { getDateOnlyInTimeZone } = await import("../lib/checkoutRules");
  const { getActiveMembershipRules } = await import("../lib/membershipBusinessRules");
  const { readMembershipCommerceState } = await import("../lib/membershipCommerce");
  const { readFulfillmentStore, readLogisticsSettings } = await import("../lib/fulfillment");
  const website = JSON.parse(await readFile("public/data/website-data.json", "utf8")) as WebsiteData;
  const product = website.menu.products.find(p => p.active !== false && p.purchasable !== false && p.status === "active" && p.skus?.some(s => s.enabled !== false));
  assert(product);
  const sku = product.skus!.find(s => s.enabled !== false)!;
  const rules = await getActiveMembershipRules();
  let preferredDate = "";
  for (let days = 3; days < 60; days++) {
    const candidate = getDateOnlyInTimeZone(new Date(Date.now() + days * 86_400_000));
    if (resolvePickupDateAvailability({ requestedDate: candidate, today: getDateOnlyInTimeZone(new Date()), customRoast: false, rules: rules.rules }).allowed) { preferredDate = candidate; break; }
  }
  assert(preferredDate);
  await mkdir(path.join(root, "store"), { recursive: true });
  const websiteFile = path.join(root, "store", "website-data.json");
  const orderDir = path.join(root, "orders");
  const orderPath = (number: string) => path.join(orderDir, `${number}.json`);
  const stored = async (number: string) => JSON.parse(await readFile(orderPath(number), "utf8")) as StoredOrder;
  const inventory = async () => JSON.parse(await readFile(websiteFile, "utf8")) as WebsiteData;
  async function resetStock() {
    const fixture = structuredClone(website);
    for (const p of fixture.menu.products) for (const s of p.skus?.length ? p.skus : p.purchase) s.stock = 10;
    fixture.menu.products.find(p => p.slug === product!.slug)!.skus!.find(s => s.id === sku.id)!.stock = 3;
    await writeFile(websiteFile, JSON.stringify(fixture));
  }
  const stock = async () => (await inventory()).menu.products.find(p => p.slug === product!.slug)!.skus!.find(s => s.id === sku.id)!.stock;
  const body = (email: string) => ({ idempotencyKey: randomUUID(), orderMode: "studio_pickup", customer: { name: "Synthetic customer", phone: "0912345678", email }, studioPickup: { preferredDate }, items: [{ slug: product!.slug, optionId: sku.id, quantity: 1, quotedUnitPrice: sku.price, customRoast: false }], requestedCredit: 0 });
  const submit = (payload: unknown) => POST(new Request("https://checkout.example.test/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
  const requests: Array<{ url: string; headers: Headers; payload: Record<string, unknown> }> = [];
  let emailMode: "success" | "reject" | "throw" = "success";
  let emailSideEffect: (() => Promise<void>) | undefined;
  globalThis.fetch = async (url, init) => {
    const address = String(url);
    assert.ok(["https://api.line.me/v2/bot/message/push", "https://api.resend.com/emails"].includes(address), "Only mocked provider endpoints are allowed");
    requests.push({ url: address, headers: new Headers(init?.headers), payload: JSON.parse(String(init?.body)) });
    if (address.includes("resend")) {
      if (emailSideEffect) await emailSideEffect();
      if (emailMode === "throw") throw new Error(process.env.RESEND_API_KEY);
      return new Response(JSON.stringify(emailMode === "reject" ? { message: process.env.RESEND_API_KEY } : { id: "synthetic-email-id" }), { status: emailMode === "reject" ? 503 : 200 });
    }
    return new Response(null, { status: 200, headers: { "x-line-request-id": "synthetic-internal-receipt" } });
  };
  const emails = () => requests.filter(r => r.url.includes("resend"));
  const lines = () => requests.filter(r => r.url.includes("line.me"));
  async function fresh(email: string) {
    await resetStock(); requests.length = 0; harness.after.length = 0; harness.member = null;
    harness.failScheduling = false; harness.failFinalization = false; emailMode = "success"; emailSideEffect = undefined;
    const payload = body(email); const response = await submit(payload); const result = await response.json();
    return { payload, response, result };
  }
  async function drain() { for (const callback of harness.after.splice(0)) await callback(); }

  const valid = await fresh("  Checkout@example.test  ");
  assert.equal(valid.response.status, 200, JSON.stringify(valid.result));
  check("A: valid-email checkout returns success before email delivery", valid.response.status === 200 && valid.result.saved && emails().length === 0);
  check("A: stock/canonical order committed before scheduled email", (await stored(valid.result.orderNumber)).inventoryTransaction.state === "inventory_committed" && await stock() === 2);
  check("A: existing internal LINE ran before email", lines().length === 1 && harness.after.length === 1);
  await drain();
  check("A: one email uses trimmed checkout snapshot", emails().length === 1 && JSON.stringify(emails()[0].payload.to) === JSON.stringify(["Checkout@example.test"]));
  check("A: Resend reuses sender and deterministic provider key", emails()[0].payload.from === process.env.MEMBER_EMAIL_FROM && emails()[0].headers.get("Idempotency-Key") === `order_confirmation_email/${valid.result.orderNumber}`);
  check("A: email-only notification history persists", (await stored(valid.result.orderNumber)).customerNotifications[0].eventType === "order_confirmation_email" && JSON.stringify((await stored(valid.result.orderNumber)).customerNotifications[0].channels) === '["email"]');

  const replay = await submit(valid.payload);
  check("E: API retry replays one order without scheduling or resending", replay.status === 200 && (await replay.json()).idempotentReplay && harness.after.length === 0 && emails().length === 1 && lines().length === 1 && await stock() === 2);
  const repeat = await deliverOrderConfirmationEmail(valid.result.orderNumber);
  check("E: repeated post-processing sees durable claim", repeat.status === "already_processed" && emails().length === 1);
  const child = execFileSync(process.execPath, ["--experimental-strip-types", "--import", "./scripts/order-confirmation-email-test-bootstrap.mjs", "--input-type=module", "-e", `const {deliverOrderConfirmationEmail}=await import('./lib/orderConfirmationEmail.ts');const r=await deliverOrderConfirmationEmail(${JSON.stringify(valid.result.orderNumber)});if(r.status!=='already_processed')throw Error('Persistent claim was lost');console.log('RESTART_PASS');`], { encoding: "utf8", env: process.env });
  check("E: fresh Node process cannot resend an already claimed order", child.includes("RESTART_PASS"));

  const absent = await fresh(""); const beforeAbsent = await readFile(orderPath(absent.result.orderNumber), "utf8"); await drain();
  check("B: no email keeps successful order and single stock deduction", absent.response.status === 200 && emails().length === 0 && await stock() === 2);
  check("B: skipped email writes no notification marker/history", await readFile(orderPath(absent.result.orderNumber), "utf8") === beforeAbsent);

  const invalid = await fresh("valid@example.test");
  await updateOrderFile(orderDir, invalid.result.orderNumber, o => ({ ...o, customer: { ...(o.customer as object), email: "invalid-address" } }));
  const beforeInvalid = await readFile(orderPath(invalid.result.orderNumber), "utf8"); await drain();
  check("C: invalid committed email snapshot skips safely without changing order or stock", invalid.response.status === 200 && emails().length === 0 && await stock() === 2 && await readFile(orderPath(invalid.result.orderNumber), "utf8") === beforeInvalid);
  const invalidInput = await submit(body("invalid-address"));
  check("C: pre-order checkout validation remains unchanged", invalidInput.status === 400);

  const failure = await fresh("failure@example.test"); emailMode = "reject"; await drain();
  const failedOrder = await stored(failure.result.orderNumber);
  check("D: provider failure cannot alter successful checkout/status/inventory", failure.response.status === 200 && failure.result.saved && failedOrder.status === "waiting_studio_pickup_confirmation" && failedOrder.inventoryTransaction.state === "inventory_committed" && await stock() === 2 && !failedOrder.inventoryReturn);
  check("D: safe failed result persisted; repeated processing cannot retry", failedOrder.customerNotifications[0].results.email.status === "failed" && (await deliverOrderConfirmationEmail(failure.result.orderNumber)).status === "already_processed" && emails().length === 1);
  const networkFailure = await fresh("network@example.test"); emailMode = "throw"; await drain();
  check("D: network exception also leaves order successful", networkFailure.response.status === 200 && await stock() === 2 && (await stored(networkFailure.result.orderNumber)).customerNotifications[0].results.email.status === "failed");
  check("D: provider errors never leak synthetic API key", !logs.join("\n").includes(process.env.RESEND_API_KEY!));

  const concurrent = await fresh("concurrent@example.test");
  const concurrentResults = await Promise.all(Array.from({ length: 4 }, () => deliverOrderConfirmationEmail(concurrent.result.orderNumber)));
  await drain();
  check("E: concurrent and scheduled processing cause one provider attempt", concurrentResults.filter(r => r.status === "sent").length === 1 && emails().length === 1 && (await stored(concurrent.result.orderNumber)).customerNotifications.length === 1);

  const resultWrite = await fresh("receipt@example.test");
  const moved = `${orderPath(resultWrite.result.orderNumber)}.fixture`;
  emailSideEffect = async () => { await rename(orderPath(resultWrite.result.orderNumber), moved); };
  await drain(); await rename(moved, orderPath(resultWrite.result.orderNumber)); emailSideEffect = undefined;
  check("E: failure saving receipt retains pre-send processing claim", (await stored(resultWrite.result.orderNumber)).customerNotificationActions[0].state === "processing");
  check("E: uncertain delivery is never automatically resent", (await deliverOrderConfirmationEmail(resultWrite.result.orderNumber)).status === "already_processed" && emails().length === 1);

  const missingConfig = await fresh("config@example.test"); const from = process.env.MEMBER_EMAIL_FROM; delete process.env.MEMBER_EMAIL_FROM; await drain(); process.env.MEMBER_EMAIL_FROM = from;
  check("D: missing provider config records state without affecting checkout", missingConfig.response.status === 200 && emails().length === 0 && (await stored(missingConfig.result.orderNumber)).customerNotifications[0].results.email.status === "not_configured");

  const latestUpdate = await fresh("latest@example.test");
  emailSideEffect = async () => {
    await updateOrderFile(orderDir, latestUpdate.result.orderNumber, order => ({
      ...order, status: "confirmed", trackingNumber: "synthetic-latest-tracking",
      customerNotifications: [{ ...failedOrder.customerNotifications[0], id: "existing-history", actionId: "existing-action" }],
    }));
  };
  await drain();
  const latestOrder = await stored(latestUpdate.result.orderNumber);
  check("Concurrency: receipt append preserves later status, tracking and existing notification history", latestOrder.status === "confirmed" && latestOrder.trackingNumber === "synthetic-latest-tracking" && latestOrder.customerNotifications.length === 2 && latestOrder.customerNotifications[0].id === "existing-history");

  const cancelled = await fresh("cancelled@example.test");
  await updateOrderFile(orderDir, cancelled.result.orderNumber, order => ({ ...order, status: "cancelled" }));
  const cancelledSnapshot = await readFile(orderPath(cancelled.result.orderNumber), "utf8");
  await drain();
  check("Timing: cancellation before processing skips email without order mutation", emails().length === 0 && await readFile(orderPath(cancelled.result.orderNumber), "utf8") === cancelledSnapshot);

  for (const mode of ["711_cod", "home_delivery"]) {
    await resetStock(); requests.length = 0; harness.after.length = 0;
    const response = await submit({
      ...body(`${mode}@example.test`), orderMode: mode, studioPickup: undefined,
      ...(mode === "711_cod" ? { store: { id: "TEST01", name: "Synthetic pickup store", address: "Synthetic store address" } } : {
        deliveryAddress: { recipientName: "Synthetic recipient", phone: "0912345678", postalCode: "100", city: "臺北市", district: "中正區", addressLine: "Synthetic address" }, paymentMethod: "cash_on_delivery",
      }),
    });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result)); await drain();
    const order = await stored(result.orderNumber);
    check(`Scope: ${mode} commits one order/stock deduction and sends one email after internal LINE`, response.status === 200 && await stock() === 2 && emails().length === 1 && lines().length === 1 && requests[0].url.includes("line.me"));
    check(`Template: ${mode} uses canonical payable total and delivery method`, String(emails()[0].payload.text).includes(`訂單總額：NT$ ${Number(order.total).toLocaleString("zh-TW")}`) && String(emails()[0].payload.text).includes(mode === "711_cod" ? "Synthetic pickup store" : "配送／取貨方式：宅配"));
  }

  const memberCase = await fresh("");
  harness.member = { id: "synthetic-member", displayName: "Fixture member", email: "account@example.test", lineUserId: "synthetic-line-id" };
  requests.length = 0; harness.after.length = 0; await resetStock();
  const memberResponse = await submit(body("checkout@example.test")); const memberResult = await memberResponse.json(); await drain();
  check("Recipient: differing member email never overrides checkout email", JSON.stringify(emails()[0].payload.to) === '["checkout@example.test"]');
  check("F: internal LINE retains intended internal token and recipient", lines().length === 1 && lines()[0].headers.get("Authorization") === "Bearer synthetic-internal-token" && lines()[0].payload.to === "synthetic-internal-group");
  check("G: no customer LINE order-created push exists", lines().every(r => r.headers.get("Authorization") !== "Bearer synthetic-customer-token") && memberResponse.status === 200);
  const state = await readMembershipCommerceState();
  check("H: no new subscription/reward/credit side effects", [state.subscriptions, state.cycles, state.referrals, state.referralRewards, state.retailPromotionRewards, state.creditEntries, state.creditReservations, state.notifications].every(v => Object.keys(v).length === 0));
  check("H: expected existing referral-qualification marker only", Object.keys(state.idempotency).length === 1 && Object.values(state.idempotency)[0].resultId === "none");
  check("H: fulfillment and Gmail stay untouched", Object.keys((await readFulfillmentStore()).records).length === 0 && (await readLogisticsSettings()).automaticTrackingEnabled === false);
  check("Recipient: valid account email is not used for absent/invalid checkout email", orderConfirmationRecipient({ ...(await stored(memberResult.orderNumber)), customer: { email: "" } }) === null && orderConfirmationRecipient({ ...(await stored(memberResult.orderNumber)), customer: { email: "bad" } }) === null);

  const sample = { ...(await stored(memberResult.orderNumber)), customer: { name: '<script>alert("fixture")</script>', email: "template@example.test" }, studioPickup: { preferredDate: "2026-10-03", preferredTime: "14:00" } } as StoredOrder;
  const template = createOrderConfirmationEmail(sample);
  check("Template: received-only subject and order summary", template.subject === `【KD Coffee】我們已收到您的訂單 ${sample.orderNumber}` && template.text.includes("我們已收到您的訂單") && template.text.includes(sku.label) && template.text.includes("× 1") && template.text.includes("14:00") && template.text.includes("台北時間"));
  check("Template: no misleading completion/payment/shipping assertions or internal IDs", !/訂單已完成|已出貨|可以取貨|付款已確認|synthetic-member|synthetic-line-id/.test(template.text));
  check("Template: escaped dynamic HTML and real existing order route", !template.html.includes("<script>") && template.html.includes("&lt;script&gt;") && template.html.includes(`https://member.example.test/orders/${sample.orderNumber}`));
  check("Template: unconfigured support URL safely omits contact button", !template.html.includes('href="https://line.me') && template.text.includes("官方 LINE @kdcoffee"));
  process.env.CUSTOMER_SUPPORT_LINE_URL = "https://lin.ee/owner-approved-fixture";
  check("Template: owner-configured contact URL is used", createOrderConfirmationEmail(sample).html.includes('href="https://lin.ee/owner-approved-fixture"'));
  for (const unsafe of ["javascript:alert(1)", "https://line.me.attacker.test/path", "http://line.me/path", "https://user:password@line.me/path"]) { process.env.CUSTOMER_SUPPORT_LINE_URL = unsafe; check("Template: invalid support URL omitted safely", !createOrderConfirmationEmail(sample).html.includes(unsafe)); }
  process.env.MEMBER_SITE_URL = "javascript:alert(1)";
  check("Template: invalid preferred origin falls back to configured public origin", createOrderConfirmationEmail(sample).text.includes(`https://public.example.test/orders/${sample.orderNumber}`));
  delete process.env.MEMBER_SITE_URL; delete process.env.NEXT_PUBLIC_SITE_URL;
  check("Template: no configured site URL does not invent an order link", !createOrderConfirmationEmail(sample).html.includes("查看訂單"));

  const scheduling = await fresh("schedule@example.test"); harness.failScheduling = true; await resetStock();
  const schedulingResponse = await submit(body("scheduling@example.test"));
  check("Failure isolation: scheduling exception still returns successful order", schedulingResponse.status === 200 && (await schedulingResponse.json()).saved && await stock() === 2); harness.failScheduling = false;

  await resetStock(); requests.length = 0; harness.after.length = 0; harness.member = null; harness.failFinalization = true;
  const pendingResponse = await submit(body("pending@example.test")); const pendingResult = await pendingResponse.json(); harness.failFinalization = false;
  check("Timing: unfinished canonical order never schedules email or LINE", pendingResponse.status === 202 && pendingResult.pending && harness.after.length === 0 && requests.length === 0 && await stock() === 2);
  const pendingEmail = await deliverOrderConfirmationEmail(pendingResult.orderNumber);
  check("Timing: direct processing rejects uncommitted finalization state", pendingEmail.status === "skipped" && requests.length === 0);

  const inquiryResponse = await submit({ ...body("inquiry@example.test"), orderMode: "corporate_gift", corporateGift: { companyName: "Synthetic company", boxSize: "18", boxQuantity: 1 }, items: [] });
  check("Scope: corporate gift inquiry gets no order confirmation email", inquiryResponse.status === 200 && harness.after.length === 0);
  const routeSource = await readFile("app/api/orders/route.ts", "utf8");
  check("Regression: customer LINE is absent from checkout route", !routeSource.includes("sendCustomerLineNotification"));
  check("Fixtures: canonical files are unique and all email calls mocked", (await readdir(orderDir)).filter(f => f.endsWith(".json")).length > 0 && requests.every(r => !r.headers.get("Authorization")?.includes("replace-with")));
  void memberCase; void scheduling;
  console.log(`Order confirmation email PASS (${checks} checks; no real network sends)`);
} finally {
  console.error = originalError;
  const resolved = path.resolve(root);
  assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith("kd-order-email-"));
  await rm(resolved, { recursive: true, force: true });
}
