import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as nodeModule from "node:module";
// Node 24 runtime API; the repository intentionally keeps Node 20 declaration types.
type ResolveContext = { parentURL?: string };
type ResolveResult = { url: string; shortCircuit?: boolean };
type NextResolve = (specifier: string, context: ResolveContext) => ResolveResult;
const registerHooks = (nodeModule as typeof nodeModule & {
  registerHooks: (hooks: { resolve: (specifier: string, context: ResolveContext, next: NextResolve) => ResolveResult }) => unknown;
}).registerHooks;

type Counts = { factories: number; metadata: number; normalization: number };
const globals = globalThis as typeof globalThis & { __returnCookies?: Record<string, string>; __returnParserSentinel: Counts };
globals.__returnParserSentinel = { factories: 0, metadata: 0, normalization: 0 };
// Only sharp is replaced. Authentication, ownership, domain eligibility, encrypted
// confirmation tokens, locks, persistence and refund allocation are real.
const sentinel = "data:text/javascript," + encodeURIComponent(`export default function sharp(){const c=globalThis.__returnParserSentinel;c.factories++;const pipeline={metadata:async()=>{c.metadata++;return {format:'png',width:8,height:8};},rotate(){return pipeline;},resize(){return pipeline;},webp(){return pipeline;},async toBuffer(){c.normalization++;return {data:Buffer.from('harmless-sentinel-output'),info:{width:8,height:8}};}};return pipeline;}`);
registerHooks({ resolve(specifier, context, next) { return specifier === "sharp" ? { url: sentinel, shortCircuit: true } : next(specifier, context); } });
const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-return-preauth-"));
process.env.KD_DATA_DIR = root;
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.AUTH_SESSION_SECRET = "isolated-parser-auth-secret-never-production-20261031";
process.env.ADMIN_SESSION_SECRET = "isolated-parser-admin-secret-never-production-20261031";
process.env.MEMBER_IDENTITY_SECRET = "isolated-parser-identity-secret-never-production-20261031";
for (const key of Object.keys(process.env)) if (/^(LINE_|GMAIL_|GOOGLE_|SMTP_|RESEND_)/u.test(key)) delete process.env[key];
const auth = await import("../lib/memberAuth");
const admin = await import("../lib/adminAuth");
const memberRoute = await import("../app/api/member/orders/[orderNumber]/returns/route");
const adminRoute = await import("../app/api/admin/returns/[orderNumber]/route");
const workflow = await import("../lib/returnWorkflow");
const { prepareOrderCompletionWrite } = await import("../lib/orderCompletion");
const { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules } = await import("../lib/membershipBusinessRules");
const { DEFAULT_RETURN_REFUND_SETTINGS } = await import("../lib/returnRefundSettings");
const member = await auth.registerEmailMember("parser-owner@example.test", "Isolated-Parser-Password-2026");
const other = await auth.registerEmailMember("parser-other@example.test", "Isolated-Parser-Password-2026");
assert.ok(member && other);
const rules = structuredClone(DEFAULT_MEMBERSHIP_RULES);
rules.returnRefund = structuredClone(DEFAULT_RETURN_REFUND_SETTINGS);
rules.returnRefund.destinations.courier = { ...rules.returnRefund.destinations.courier, enabled: true, address: "Isolated QA address", recipient: "QA", phone: "0000000000" };
await saveMembershipBusinessRules({ expectedRevision: 0, rules });
await fs.mkdir(path.join(root, "orders"), { recursive: true });
let sequence = 0;
const now = new Date();
async function fixture(expired = false) {
  const orderNumber = `KD20261031-${91000 + ++sequence}`;
  const completedAt = new Date(now.getTime() - (expired ? 60 * 24 : 1) * 60 * 60 * 1000).toISOString();
  const before = { orderNumber, createdAt: completedAt, status: "ready_for_pickup", member: { memberId: member!.id }, customer: { name: "Isolated QA" }, orderMode: "home_delivery", payment: "cash_on_delivery", paymentDetails: { method: "cash_on_delivery", status: "paid" }, items: [{ slug: "qa-coffee", optionId: "qa-sku", name: "QA", quantity: 2, unitPrice: 500, lineTotal: 1000 }], subtotal: 1000, shipping: 40, codServiceFee: 25, totalBeforeCredit: 1065, total: 1065, credit: { appliedAmount: 0, rulesVersion: 2 } };
  const order = await prepareOrderCompletionWrite(before, { ...before, status: "completed", fulfillmentEvents: [{ eventId: "done-" + orderNumber, state: "completed", occurredAt: completedAt }] });
  await fs.writeFile(path.join(root, "orders", orderNumber + ".json"), JSON.stringify(order));
  const completion = order.completion as import("../lib/orderCompletion").OrderCompletionSnapshot;
  assert.equal(completion.returnLines?.status, "resolved");
  const ref = completion.returnLines!.status === "resolved" ? completion.returnLines!.lines[0].returnLineRef : "";
  const values = { action: "create", idempotencyKey: "create-" + orderNumber, reason: "商品破損／瑕疵", lines: [{ returnLineRef: ref, quantity: 1 }], conditionAcknowledgement: { itemsComplete: true, unopenedUnusedWhereApplicable: true }, quantityAcknowledged: true, finalConfirmation: true, refundHandoff: "courier", refundBank: { bank: "822｜中國信託商業銀行", holder: "QA", account: "12345678901234", branch: "" } };
  return { orderNumber, values };
}
const photo = () => new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "harmless.png", { type: "image/png" });
function request(values: Record<string, unknown>, photos = [photo()]) { const form = new FormData(); form.set("payload", JSON.stringify(values)); for (const file of photos) form.append("photos", file); return new Request("https://qa.example.test/api/returns", { method: "POST", headers: { Origin: "https://qa.example.test" }, body: form }); }
const context = (orderNumber: string) => ({ params: Promise.resolve({ orderNumber }) });
const ownerCookie = () => ({ [auth.MEMBER_SESSION_COOKIE]: auth.createSessionToken(member!.id) });
const adminCookie = () => ({ [admin.adminCookieName]: admin.createAdminSessionValue() });
async function preview(f: Awaited<ReturnType<typeof fixture>>, at = now) { const result = await workflow.memberReturnAction(f.orderNumber, member!.id, { ...f.values, action: "preview" }, { now: at }); assert.ok("confirmationToken" in result); return result.confirmationToken; }
const results: Array<{ name: string; status: number; counts: Counts }> = [];
async function test(name: string, run: () => Promise<Response>, expected: number, decode = false) { globals.__returnParserSentinel = { factories: 0, metadata: 0, normalization: 0 }; const response = await run(); assert.equal(response.status, expected, name + ": " + await response.clone().text()); const counts = { ...globals.__returnParserSentinel }; if (decode) { assert.equal(counts.factories, 1, name); assert.equal(counts.metadata, 1, name); assert.equal(counts.normalization, 1, name); } else assert.deepEqual(counts, { factories: 0, metadata: 0, normalization: 0 }, name); results.push({ name, status: response.status, counts }); console.log(`PASS ${results.length} ${name}: sharp factories=${counts.factories}, metadata=${counts.metadata}, normalization=${counts.normalization}`); return response; }
try {
  const f = await fixture(), token = await preview(f);
  globals.__returnCookies = {};
  await test("unauthenticated Member rejected before sharp", () => memberRoute.POST(request({ ...f.values, confirmationToken: token }), context(f.orderNumber)), 401);
  globals.__returnCookies = { [auth.MEMBER_SESSION_COOKIE]: auth.createSessionToken(other.id) };
  await test("wrong Member/order owner rejected before sharp", () => memberRoute.POST(request({ ...f.values, confirmationToken: token }), context(f.orderNumber)), 404);
  globals.__returnCookies = ownerCookie();
  await test("invalid confirmation token rejected before sharp", () => memberRoute.POST(request({ ...f.values, confirmationToken: "invalid-token" }), context(f.orderNumber)), 409);
  const oldToken = await preview(f, new Date(now.getTime() - 11 * 60 * 1000));
  await test("expired confirmation token rejected before sharp", () => memberRoute.POST(request({ ...f.values, confirmationToken: oldToken }), context(f.orderNumber)), 409);
  const expired = await fixture(true);
  await test("ineligible return deadline rejected before sharp", () => memberRoute.POST(request({ ...expired.values, confirmationToken: token }), context(expired.orderNumber)), 409);
  globals.__returnCookies = {};
  const proofValues = { action: "refund_confirm", returnRequestId: "not-approved", manuallyPaid: true };
  await test("unauthenticated Admin proof rejected before sharp", () => adminRoute.POST(request(proofValues), context(f.orderNumber)), 401);
  globals.__returnCookies = adminCookie();
  await test("Admin unapproved exact return path rejected before sharp", () => adminRoute.POST(request(proofValues), context(f.orderNumber)), 409);
  globals.__returnCookies = ownerCookie();
  const created = await test("valid Member photo runs one metadata/normalization pipeline", () => memberRoute.POST(request({ ...f.values, confirmationToken: token }), context(f.orderNumber)), 200, true);
  const createdBody = await created.json() as { returnRequestId: string };
  await test("Member retry reuses original attachment without decoding", () => memberRoute.POST(request({ ...f.values, confirmationToken: token }), context(f.orderNumber)), 200);
  const approval = await workflow.adminReturnAction(f.orderNumber, "verified-qa-admin", { action: "approve", returnRequestId: createdBody.returnRequestId, reason: "Isolated approval", idempotencyKey: "approve-" + f.orderNumber }, { now: new Date() });
  assert.equal(approval.returnRequestId, createdBody.returnRequestId);
  globals.__returnCookies = adminCookie();
  const second = await fixture();
  await test("Admin cross-order refund proof rejected before sharp", () => adminRoute.POST(request({ ...proofValues, returnRequestId: createdBody.returnRequestId }), context(second.orderNumber)), 409);
  await test("Admin request-level note limit precedes decoding", () => adminRoute.POST(request({ ...proofValues, returnRequestId: createdBody.returnRequestId, note: "x".repeat(201) }), context(f.orderNumber)), 400);
  await test("valid Admin proof runs one metadata/normalization pipeline", () => adminRoute.POST(request({ ...proofValues, returnRequestId: createdBody.returnRequestId }), context(f.orderNumber)), 200, true);
  await test("Admin refund retry never decodes or refunds again", () => adminRoute.POST(request({ ...proofValues, returnRequestId: createdBody.returnRequestId }), context(f.orderNumber)), 200);
  console.log(`RETURN IMAGE PREAUTH ${results.length}/${results.length} PASS; native sentinel only; real auth/token/locks/refund domain; isolated storage; no external network.`);
} finally { delete globals.__returnCookies; assert.ok(root.startsWith(path.join(os.tmpdir(), "kd-return-preauth-"))); await fs.rm(root, { recursive: true, force: true }); }
