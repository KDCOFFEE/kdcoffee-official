import AttachmentLightbox from "../components/shared/AttachmentLightbox";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { mock } from "node:test";
import sharp from "sharp";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prepareOrderCompletionWrite, type OrderCompletionSnapshot } from "../lib/orderCompletion";
import { readMembershipCommerceState, recordValidConsumptionFromCompletedOrder, validateMembershipCommerceState, percentageRewardPayout, projectPendingReturnRewardEntitlement } from "../lib/membershipCommerce";
import { projectReturnRewardUnits } from "../lib/returnRewardUnits";
import { readPointDisplayName } from "../lib/pointDisplayNameStore";
import { calculateSelfPurchaseTierReward } from "../lib/selfPurchaseRewardTiers";
import { registerEmailMember, createSessionToken, MEMBER_SESSION_COOKIE } from "../lib/memberAuth";
import { getReturnWorkflow, memberReturnAction, adminReturnAction } from "../lib/returnWorkflow";
import { notifyReturnRequest } from "../lib/returnRequestNotification";
import { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules, getActiveMembershipRules, readMembershipRulesStore } from "../lib/membershipBusinessRules";
import { validOrderPhotoSelection, MAX_ORDER_NOTIFICATION_PHOTO_BYTES, ORDER_PHOTO_ACCEPT } from "../lib/orderPhotoPolicy";
import { readMemberCenterCopy, saveMemberCenterCopy } from "../lib/memberCenterCopyStore";
import { MEMBER_CENTER_COPY_CATALOG } from "../lib/memberCenterCopy";
import { POST } from "../app/api/member/orders/[orderNumber]/returns/route";
import MemberReturnWorkflow from "../components/member/MemberReturnWorkflow";
import { ReturnCreditEvidence, ReturnRequestEvidence, ReturnRewardEvidence } from "../components/member/ReturnEvidence";
import ReasonFields from "../components/member/ReturnReasonFields";
import { AdminReturnDetail } from "../components/admin/AdminReturnWorkflow";
import Provider from "../components/member/MemberCenterCopyProvider";
import { MemberCopyText } from "../components/member/MemberCenterCopyProvider";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6f1f-ux-")), previousRoot = process.env.KD_DATA_DIR;
process.env.KD_DATA_DIR = root;
process.env.AUTH_SESSION_SECRET = "isolated-return-ux-auth-secret-longer-than-32-characters";
process.env.MEMBER_IDENTITY_SECRET = "isolated-return-ux-identity-secret-longer-than-32-characters";
process.env.RETURN_REQUEST_LINE_NOTIFICATION_ENABLED = "false";
const now = new Date("2026-10-29T03:00:00Z"), original = "2026-10-25T02:00:00Z", completed = "2026-10-28T02:00:00Z";
mock.timers.enable({ apis: ["Date"], now });
const statePath = path.join(root, "membership-commerce", "commerce-state.json"), rulesPath = path.join(root, "membership-commerce", "business-rules.json");
let sequence = 30000, passes = 0;
const test = async (name: string, verify: () => unknown | Promise<unknown>) => { await verify(); console.log(`PASS ${++passes} ${name}`); };
const state = () => readMembershipCommerceState(statePath);
const writeState = (value: unknown) => fs.writeFile(statePath, JSON.stringify(value));
// eslint-disable-next-line react/no-children-prop -- Non-JSX Provider overload requires its children prop.
const render = (element: ReactElement, overrides = {}, pointDisplayName?: string) => renderToStaticMarkup(createElement(Provider, { initialOverrides: overrides, initialPointDisplayName: pointDisplayName, children: element }));
type Hooks = { useState: (value: unknown) => unknown; useRef: (value: unknown) => unknown; useEffect: () => void; useContext: (context: { _currentValue: unknown }) => unknown };
const globals = globalThis as typeof globalThis & { __returnCookies?: Record<string, string>; __returnHooks?: Hooks };
const protectedFiles = ["data/fulfillment/state.json", "data/member-identity/registry.json", "data/membership-commerce/commerce-state.json", "data/membership-commerce/business-rules.json", "public/data/assets.json", "public/data/homepage.json", "public/data/pages.json", "public/data/website-data.json"];
const bytes = (file: string) => fs.readFile(file).then(value => value.toString("base64"), () => null);
const before = await Promise.all(protectedFiles.map(bytes));
let memberId: string;
async function fixture(options: { points?: boolean; conversion?: number; tier?: boolean } = {}) {
  const orderNumber = `KD20261028-${++sequence}`, reservationId = `original-${sequence}`;
  const base = { orderNumber, createdAt: original, orderMode: "studio_pickup", status: "ready_for_pickup", member: { memberId }, customer: { name: "退貨測試會員" },
    items: [{ slug: "coffee", optionId: "half-pound", name: "原訂單咖啡", optionLabel: "半磅", quantity: 20, unitPrice: 10, lineTotal: 200, ...(options.points ? { basePV: 10, effectivePV: 10 } : {}) }],
    subtotal: 200, shipping: 0, totalBeforeCredit: 200, total: 100, credit: { appliedAmount: 100, reservationId, rulesVersion: 2 }, paymentDetails: { status: "paid" } };
  const order = await prepareOrderCompletionWrite(base, { ...base, status: "completed", fulfillmentEvents: [{ eventId: `complete-${sequence}`, state: "completed", occurredAt: completed }] });
  const orderPath = path.join(root, "orders", orderNumber + ".json"); await fs.mkdir(path.dirname(orderPath), { recursive: true }); await fs.writeFile(orderPath, JSON.stringify(order));
  const saved = await state();
  for (const [suffix, expiry] of [["A", "2026-10-28T00:00:00+08:00"], ["B", "2027-01-01T00:00:00+08:00"]]) {
    const creditEntryId = `${sequence}-${suffix}`;
    saved.creditEntries[creditEntryId] = { creditEntryId, memberId, sourceType: "manual", sourceReference: creditEntryId, amount: 50, remainingAmount: 0, issuedAt: original, expiresAt: expiry, createdAt: original, status: "consumed", metadata: {} };
  }
  saved.creditReservations[reservationId] = { reservationId, orderId: orderNumber, memberId, amount: 100, requestedAmount: 100, status: "consumed", createdAt: original, updatedAt: original,
    allocations: [{ creditEntryId: `${sequence}-A`, amount: 50 }, { creditEntryId: `${sequence}-B`, amount: 50 }] };
  const rewardId = `self-${sequence}`;
  const payout = percentageRewardPayout({ calculationBasis: options.points ? "pv" : "paid_amount", calculationBaseValue: options.points ? 200 : 100,
    rewardRate: options.points ? 5 : 10, pvRewardMoneyValue: options.conversion ?? 2.5, roundingMode: "round-half-up" });
  saved.referralRewards[rewardId] = { rewardId, sourceOrderNumber: orderNumber, sourceMemberId: memberId, beneficiaryMemberId: memberId, referralLevel: 0, rewardType: "self_purchase", qualificationAuthority: "self_purchase_direct", qualificationStatus: "qualified",
    calculationMode: options.points ? "pv" : "paid_amount", paidAmountBasis: 100, basePV: options.points ? 200 : 0, effectivePV: options.points ? 200 : 0, discountRatio: 1, rewardRate: options.points ? 5 : 10,
    rewardPV: payout.rewardPV, pvRewardMoneyValue: options.conversion ?? 2.5, calculatedCreditAmount: payout.calculatedCreditAmount, projectedCreditAmount: payout.calculatedCreditAmount,
    ruleVersion: 2, ancestrySnapshot: [], monthlyCapAmountSnapshot: 0, baseWaitingDaysSnapshot: 0, returnProtectionDaysSnapshot: 7, totalWaitingDaysSnapshot: 7, successfulPickupBusinessDate: "2026-10-28", releaseEligibleBusinessDate: "2026-11-04",
    sourceOrderFinalState: "completed", createdAt: completed, eligibleAt: completed, scheduledReleaseAt: "2026-11-04T00:00:00+08:00", releasedAt: null, status: "scheduled", rewardCreditEntryId: null, reversalCreditEntryId: null,
    reversalPolicySnapshot: "cancel-pending-and-reverse-released", idempotencyKey: rewardId };
  await writeState(saved);
  await recordValidConsumptionFromCompletedOrder({ memberId, orderId: orderNumber, idempotencyKey: `consume-${sequence}`, now: new Date(completed) });
  if (options.tier) {
    const current = await state(), consumption = Object.values(current.validConsumptionEvents).find(value => value.sourceOrderId === orderNumber)!;
    const tiers = [{ threshold: 0, rewardRate: 5 }], result = calculateSelfPurchaseTierReward({ priorAmount: 0, currentAmount: 200, calculationMethod: "whole_order", tiers });
    const evidence = [{ validConsumptionEventId: consumption.eventId, sourceOrderId: orderNumber, finalizedAt: completed, thresholdAmount: 200, role: "current" as const }];
    current.referralRewards[rewardId].selfPurchaseTierSnapshot = { featureEnabled: true, rules: { thresholdBasis: "pv", accumulationBasis: "single_order", calculationMethod: "whole_order", rollingWindowDays: 30, tiers },
      payout: { calculationMode: "pv", pvRewardMoneyValue: options.conversion ?? 2.5, moneyRoundingMode: "round-half-up" }, windowStartedAt: original, windowEndedAt: completed,
      initialEvidence: evidence, latestEvidence: evidence, initialResult: result, latestResult: result };
    await writeState(current);
  }
  const completion = order.completion as OrderCompletionSnapshot; assert.ok(completion.returnLines?.status === "resolved");
  return { orderNumber, ref: completion.returnLines.lines[0].returnLineRef, orderPath, order, rewardId };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const values = (f: Fixture, quantity = 12) => ({ lines: [{ returnLineRef: f.ref, quantity }], reason: "商品破損／瑕疵：外包裝有損傷", conditionAcknowledgement: { itemsComplete: true, unopenedUnusedWhereApplicable: true }, quantityAcknowledged: true });
const preview = async (f: Fixture, quantity = 12) => { const result = await memberReturnAction(f.orderNumber, memberId, { ...values(f, quantity), action: "preview" }); assert.ok(result.preview && result.confirmationToken); return { preview: result.preview, confirmationToken: result.confirmationToken }; };
async function image(format: "jpeg" | "png" | "webp" = "png", color = "#998877") {
  const data = await sharp({ create: { width: 16, height: 12, channels: 3, background: color } }).toFormat(format).toBuffer();
  return new File([new Uint8Array(data)], `damage.${format === "jpeg" ? "jpg" : format}`, { type: `image/${format}` });
}
async function submit(f: Fixture, payload: Record<string, unknown>, photos: File[] = []) {
  const form = new FormData(); form.append("payload", JSON.stringify(payload)); photos.forEach(photo => form.append("photos", photo));
  return POST(new Request(`http://localhost:3161/api/member/orders/${f.orderNumber}/returns`, { method: "POST", headers: { Origin: "http://localhost:3161" }, body: form }), { params: Promise.resolve({ orderNumber: f.orderNumber }) });
}
const creation = (f: Fixture, confirmationToken: string, key = "photo-request") => ({ ...values(f), action: "create", finalConfirmation: true, confirmationToken, idempotencyKey: key });
function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<Record<string, unknown>>; return [element, ...nodes(element.props.children as ReactNode)];
}
try {
  const rules = structuredClone(DEFAULT_MEMBERSHIP_RULES); rules.money.roundingMode = "round-half-up";
  await saveMembershipBusinessRules({ expectedRevision: 0, rules, now: new Date("2026-10-01T00:00:00Z") }, rulesPath);
  const member = await registerEmailMember("return-ux@example.test", "Return-UX-Isolated-2026"); assert.ok(member); memberId = member.id;
  globals.__returnCookies = { [MEMBER_SESSION_COOKIE]: createSessionToken(memberId) };
  const f = await fixture(), p = await preview(f), images = await Promise.all([image("jpeg"), image("png"), image("webp")]);
  await test("selection shares authoritative JPEG/PNG/WebP rules", () => { assert.equal(ORDER_PHOTO_ACCEPT, "image/jpeg,image/png,image/webp"); assert.ok(images.every(validOrderPhotoSelection)); });
  await test("selection rejects oversized images using shared 5MB constant", () => assert.equal(validOrderPhotoSelection({ name: "damage.png", type: "image/png", size: MAX_ORDER_NOTIFICATION_PHOTO_BYTES + 1 }), false));
  await test("selection rejects mismatched extension and unsupported MIME", () => { assert.equal(validOrderPhotoSelection({ name: "bad.exe", type: "image/png", size: 10 }), false); assert.equal(validOrderPhotoSelection({ name: "bad.svg", type: "image/svg+xml", size: 10 }), false); });
  const compact = render(createElement(ReturnCreditEvidence, { preview: p.preview, warning: true }));
  await test("main confirmation contains exactly the three amount labels", () => { for (const label of ["本次退貨涉及：", "預計可返還：", "已到期無法返還："]) assert.ok(compact.includes(label)); });
  await test("expiry rows are inside a closed native details disclosure", () => { assert.match(compact, /<details[^>]*><summary[^>]*>查看明細／查看說明/); assert.doesNotMatch(compact, /<details[^>]*\bopen/); assert.ok(!compact.replace(/<details[\s\S]*?<\/details>/gu, "").includes("2026/10/27")); });
  await test("expired main notice has friendly editable title/body", () => { assert.ok(compact.includes("抵用金到期提醒")); assert.ok(compact.includes("該部分將無法返還")); });
  const noExpired = await preview(f, 6);
  await test("normal confirmation omits expired warning", () => assert.ok(!render(createElement(ReturnCreditEvidence, { preview: noExpired.preview, warning: true })).includes("抵用金到期提醒")));
  await test("all requested customer copy categories are catalogued", () => { for (const name of ["confirmTitle", "confirmBody", "expiredTitle", "expiredBody", "creditTotal", "creditRestorable", "creditExpired", "creditDetails", "settlementNotice", "approvedNotice", "rejectedNotice", "withdrawnNotice", "rewardHeld", "rewardRestored", "rewardAdjusted"]) assert.ok(MEMBER_CENTER_COPY_CATALOG.some(item => item.key === `member.returns.${name}`)); });
  await test("summary and detail toggle are configurable without changing credit amounts", () => { const html = render(createElement(ReturnCreditEvidence, { preview: p.preview, warning: true }), { "member.returns.creditTotal": "退貨折抵合計", "member.returns.creditDetails": "展開原折抵明細", "member.returns.expiredTitle": "您的額度提醒" }); assert.ok(html.includes("退貨折抵合計")); assert.ok(html.includes("展開原折抵明細")); assert.ok(html.includes("您的額度提醒")); assert.ok(html.includes("60 抵用金")); });
  await test("member reasons follow select plus optional custom pattern", () => { const html = render(createElement(ReasonFields, {})); assert.ok(html.includes("<select")); for (const reason of ["商品破損／瑕疵", "收到的商品不符", "商品不符需求", "其他"]) assert.ok(html.includes(reason)); });
  await test("Admin review reasons provide presets plus custom path", () => { const html = render(createElement(ReasonFields, { admin: true })); assert.ok(html.includes("商品狀況已確認")); assert.ok(html.includes("不符合退貨條件")); assert.ok(html.includes("其他")); });
  globals.__returnCookies = {};
  await test("anonymous multipart submission is denied", async () => assert.equal((await submit(f, creation(f, p.confirmationToken), images)).status, 401));
  globals.__returnCookies = { [MEMBER_SESSION_COOKIE]: createSessionToken(memberId) };
  await test("attachments cannot create a request at preview step", async () => assert.equal((await submit(f, { ...values(f), action: "preview" }, images)).status, 400));
  await test("bounded photo count rejects excess without creating return", async () => { assert.equal((await submit(f, creation(f, p.confirmationToken), [...images, images[0]])).status, 400); assert.equal((await state()).returnEvents?.length, 0); });
  await test("byte/MIME mismatch is rejected by existing image decoder", async () => { const fake = new File(["not an image"], "damage.png", { type: "image/png" }); assert.equal((await submit(f, creation(f, p.confirmationToken), [fake])).status, 400); assert.equal((await state()).returnEvents?.length, 0); });
  const other = await registerEmailMember("other-return-ux@example.test", "Other-Isolated-UX-2026"); assert.ok(other);
  globals.__returnCookies = { [MEMBER_SESSION_COOKIE]: createSessionToken(other.id) };
  await test("foreign member cannot upload against another order", async () => assert.equal((await submit(f, creation(f, p.confirmationToken), images)).status, 404));
  globals.__returnCookies = { [MEMBER_SESSION_COOKIE]: createSessionToken(memberId) };
  const result = await submit(f, creation(f, p.confirmationToken), images), created = await result.json();
  await test("successful final confirmation persists all three photos", async () => { assert.equal(result.status, 200); const view = await getReturnWorkflow(f.orderNumber, memberId); assert.equal(view.requests[0].photos.length, 3); });
  const request = (await getReturnWorkflow(f.orderNumber, memberId)).requests[0];
  await test("photos reuse existing WebP storage and stable safe UUID URLs", async () => { for (const photo of request.photos) { assert.match(photo.url, /^\/uploads\/order-notifications\/[0-9a-f-]{36}\.webp$/u); assert.equal(photo.mimeType, "image/webp"); const stored = await fs.readFile(path.join(root, photo.url.slice(1))); assert.equal((await sharp(stored).metadata()).format, "webp"); } });
  await test("exact request retry preserves same photo references", async () => { const retry = await submit(f, creation(f, p.confirmationToken), images); assert.equal((await retry.json()).replayed, true); assert.deepEqual((await getReturnWorkflow(f.orderNumber, memberId)).requests[0].photos, request.photos); assert.equal((await state()).returnEvents?.length, 1); });
  await test("retry with changed photos conflicts without rewriting request", async () => { assert.equal((await submit(f, creation(f, p.confirmationToken), [await image("png", "#112233")])).status, 409); assert.deepEqual((await getReturnWorkflow(f.orderNumber, memberId)).requests[0].photos, request.photos); });
  await test("Admin detail previews submitted attachments inline", async () => { const html = render(createElement(AdminReturnDetail, { initial: await getReturnWorkflow(f.orderNumber) })); for (const photo of request.photos) { assert.ok(html.includes(`src="${photo.url}"`)); assert.ok(!html.includes(`<a href="${photo.url}"`)); } assert.ok(!html.includes('target="_blank"'));assert.ok(html.includes('aria-haspopup="dialog"')); });
  await test("member presentation hides internal request IDs and engine labels", async () => { const view = await getReturnWorkflow(f.orderNumber, memberId), html = render(createElement(ReturnRequestEvidence, { request: view.requests[0], view })); assert.ok(!html.includes(created.returnRequestId)); assert.doesNotMatch(html, /manual_review_required|confirmationFingerprint|確認證據|return_request_/u); });
  await test("self-purchase label derives actual reward type", async () => assert.equal((await getReturnWorkflow(f.orderNumber, memberId)).rewards[0].programCopyKey, "member.returns.rewardSelf"));
  await test("pending HOLD uses friendly configurable reason key", async () => assert.equal((await getReturnWorkflow(f.orderNumber, memberId)).rewards[0].reasonCopyKey, "member.returns.rewardHeld"));
  await adminReturnAction(f.orderNumber, "owner", { action: "lock", returnRequestId: created.returnRequestId, reason: "等待補充資料", idempotencyKey: "lock" });
  const processing = await getReturnWorkflow(f.orderNumber, memberId);
  await test("processing request precedes separate remaining-quantity action", () => { const html = render(createElement(MemberReturnWorkflow, { initial: processing })); assert.ok(html.indexOf("正在為您處理") < html.indexOf("再申請退貨")); assert.ok(html.includes("尚可申請 8 件")); assert.ok(!html.includes("<form")); });
  await test("processing request cannot be withdrawn", () => assert.equal(processing.requests[0].withdrawable, false));
  await adminReturnAction(f.orderNumber, "owner", { action: "approve", returnRequestId: created.returnRequestId, reason: "商品狀況已確認", idempotencyKey: "approve" });
  const adjusted = await getReturnWorkflow(f.orderNumber, memberId);
  await test("Admin original/current/delta reflect D authority: 10/4/-6", () => { assert.equal(adjusted.rewards[0].originalPendingAmount, 10); assert.equal(adjusted.rewards[0].effectivePendingAmount, 4); assert.equal(adjusted.rewards[0].delta, -6); });
  await test("legacy paid-amount reward stays credit rather than invented points", () => { const html = render(createElement(ReturnRewardEvidence, { rewards: adjusted.rewards })); assert.ok(html.includes("自購回饋")); assert.ok(html.includes("−6 抵用金")); assert.equal(adjusted.rewards[0].display.unit, "credit"); assert.doesNotMatch(html, /零售推廣|追回|已扣回|負數扣款/u); });
  await test("photo references remain immutable after review", () => assert.deepEqual(adjusted.requests[0].photos, request.photos));
  await test("invalid stored photo path fails event validation", async () => { const saved = await state(), event = saved.returnEvents![0]; assert.ok(event.type === "RETURN_REQUESTED" && event.confirmation?.supportingPhotos); event.confirmation.supportingPhotos[0].url = "/uploads/../secret"; assert.throws(() => validateMembershipCommerceState(saved)); });
  let calls = 0, lineText = "", retryKey: string | undefined;
  const sender = async (text: string, options?: { retryKey?: string }) => { calls++; lineText = text; retryKey = options?.retryKey; return { sent: true }; };
  const lineCase=await fixture(),linePreview=await preview(lineCase);const lineCreated=await memberReturnAction(lineCase.orderNumber,memberId,creation(lineCase,linePreview.confirmationToken));
  const notice = { orderNumber: lineCase.orderNumber, returnRequestId: lineCreated.returnRequestId!, replayed: false };
  await test("central return Admin alert defaults enabled", async () => { assert.equal((await getActiveMembershipRules()).rules.notification.events.return_admin_request_received.enabled,true); });
  await test("enabled alert reuses existing sender with concise authoritative data", async () => { assert.equal((await notifyReturnRequest(notice, { sender })).status,"sent"); for(const text of [lineCase.orderNumber,"退貨測試會員","原訂單咖啡 × 12","商品破損／瑕疵"])assert.ok(lineText.includes(text));assert.ok(!lineText.includes("creditEntryId"));assert.match(retryKey!,/^[0-9a-f-]{36}$/u); });
  await test("persisted delivered notice prevents replay duplication", async () => {await notifyReturnRequest({...notice,replayed:true},{sender});assert.equal(calls,1);});
  await test("unknown request cannot fabricate LINE payload",async()=>assert.equal((await notifyReturnRequest({...notice,returnRequestId:"unknown"},{sender})).status,"skipped"));
  const next = await fixture(), nextPreview = await preview(next);
  const previousFetch = globalThis.fetch;
  process.env.LINE_INTERNAL_CHANNEL_ACCESS_TOKEN = "isolated-never-send"; process.env.LINE_INTERNAL_RECIPIENT_ID = "isolated-recipient";
  globalThis.fetch = async () => { calls++; return new Response("offline", { status: 503 }); };
  const notified = await submit(next, creation(next, nextPreview.confirmationToken), []);
  await test("real route succeeds even when configured LINE delivery fails", async () => { assert.equal(notified.status, 200); assert.equal((await getReturnWorkflow(next.orderNumber, memberId)).requests.length, 1); });
  const sentCount = calls; await submit(next, creation(next, nextPreview.confirmationToken), []);
  await test("real route replay does not retry a duplicate Owner notification", () => assert.equal(calls, sentCount));
  globalThis.fetch = previousFetch;
  const slots: unknown[] = []; let cursor = 0;
  globals.__returnHooks = { useState(value) { const index = cursor++; if (!(index in slots)) slots[index] = value; return [slots[index], (next: unknown) => { slots[index] = next; }]; }, useRef(value) { const index = cursor++; if (!(index in slots)) slots[index] = { current: value }; return slots[index]; }, useEffect() {}, useContext(context) { return context._currentValue; } };
  const draw = async () => { cursor = 0; return nodes(MemberReturnWorkflow({ initial: await getReturnWorkflow(next.orderNumber, memberId) })); };
  let ui = await draw(); (ui.find(node => node.props["data-action"] === "start-return")!.props.onClick as () => void)(); ui = await draw();
  const picker = ui.find(node => node.type === "input" && node.props.type === "file")!;
  (picker.props.onChange as (event: unknown) => void)({ target: { files: [images[0]], value: "photo" } }); ui = await draw();
  await test("member photo picker creates local preview before submission", () => assert.ok(ui.some(node => node.type === AttachmentLightbox && String(node.props.src).startsWith("blob:"))));
  const remove = ui.find(node => node.type === "button" && nodes(node).some(child => child.props.copyKey === "member.returns.removePhoto"))!;
  (remove.props.onClick as () => void)(); ui = await draw();
  await test("member can remove a selected photo before submission", () => assert.ok(!ui.some(node => node.type === AttachmentLightbox)));
  globals.__returnHooks = undefined;
  await saveMemberCenterCopy({ expectedRevision: 0, overrides: { "member.returns.errorInput": "請重新檢查您的退貨資料。" } });
  await test("member API validation messages use existing copy-management overrides", async () => { const response = await POST(new Request("http://localhost:3161/api/member/returns", { method: "POST", headers: { Origin: "http://localhost:3161", "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", reason: "", quantityAcknowledged: true }) }), { params: Promise.resolve({ orderNumber: next.orderNumber }) }); assert.equal((await response.json()).error, "請重新檢查您的退貨資料。"); });
  await test("source completed order/payment bytes remain unchanged", async () => assert.equal(await fs.readFile(f.orderPath, "utf8"), JSON.stringify(f.order)));
  const pointFixture = await fixture({ points: true }), pointPreview = await preview(pointFixture);
  const pointResponse = await submit(pointFixture, creation(pointFixture, pointPreview.confirmationToken), []), pointCreated = await pointResponse.json();
  const heldPoints = await getReturnWorkflow(pointFixture.orderNumber, memberId);
  await test("point reward uses preserved 200-point basis at 5 percent", () => { assert.equal(heldPoints.rewards[0].display.originalBasis, 200); assert.equal(heldPoints.rewards[0].display.rewardRate, 5); assert.equal(heldPoints.rewards[0].display.original, 10); });
  await test("HOLD point entitlement and credit equivalent remain separate", () => { assert.equal(heldPoints.rewards[0].display.unit, "points"); assert.equal(heldPoints.rewards[0].display.effective, 10); assert.equal(heldPoints.rewards[0].display.originalCredit, 25); assert.equal(heldPoints.rewards[0].display.conversionValue, 2.5); });
  await test("HOLD primary presentation uses configurable point unit, not NT$", () => { const html = render(createElement(ReturnRewardEvidence, { rewards: heldPoints.rewards })); assert.ok(html.includes("10 KD點")); assert.ok(!html.includes("NT$10")); });
  await adminReturnAction(pointFixture.orderNumber, "owner", { action: "approve", returnRequestId: pointCreated.returnRequestId, reason: "商品狀況已確認", idempotencyKey: "point-approve" });
  const pointAdjusted = await getReturnWorkflow(pointFixture.orderNumber, memberId);
  await test("D consequence preserves point entitlement 10 -> 4 and delta -6", () => { const unit = pointAdjusted.rewards[0].display; assert.equal(unit.original, 10); assert.equal(unit.effective, 4); assert.equal(unit.delta, -6); assert.equal(unit.pointEvidenceStatus, "resolved"); });
  await test("D credit entitlement separately remains 25 -> 10", () => { assert.equal(pointAdjusted.rewards[0].originalPendingAmount, 25); assert.equal(pointAdjusted.rewards[0].effectivePendingAmount, 10); assert.equal(pointAdjusted.rewards[0].delta, -15); });
  await test("Admin return presentation shows point primary and original conversion", () => { const html = render(createElement(AdminReturnDetail, { initial: pointAdjusted })); assert.ok(html.includes("10 KD點")); assert.ok(html.includes("4 KD點")); assert.ok(html.includes("−6 KD點")); assert.ok(html.includes("2.5 抵用金")); assert.ok(html.includes("原預估折抵 25 抵用金")); });
  await test("redeemed-credit preview uses shared credit name for 60/50/10", () => { const html = render(createElement(ReturnCreditEvidence, { preview: pointPreview.preview, warning: true })); for (const value of [60, 50, 10]) assert.ok(html.includes(`${value} 抵用金`)); assert.ok(!html.includes("NT$")); assert.ok(!html.includes("KD點")); });
  const persistedBeforeLabelChange = await fs.readFile(statePath, "utf8"), orderBeforeLabelChange = await fs.readFile(pointFixture.orderPath, "utf8");
  for (const name of ["KD幣", "幣", "枚"]) {
    const copyState = await readMemberCenterCopy();
    const savedCopy = await saveMemberCenterCopy({ expectedRevision: copyState.revision, overrides: { ...copyState.overrides, "member.rewards.storeCredit.title": name } });
    await test(`one saved credit name ${name} updates Member balance and Return summary/detail/warning`, () => {
      const balance = render(createElement("strong", null, "200 ", createElement(MemberCopyText, { copyKey: "member.rewards.storeCredit.title" })), savedCopy.overrides);
      assert.ok(balance.includes(`200 ${name}`));
      const html = render(createElement(ReturnCreditEvidence, { preview: pointPreview.preview, warning: true }), savedCopy.overrides);
      for (const value of [60, 50, 10]) assert.ok(html.includes(`${value} ${name}`));
      assert.ok(html.includes(`${name}返還預估`)); assert.ok(html.includes(`${name}到期提醒`));
      assert.ok(html.includes(`10 ${name} 已於`)); assert.ok(!html.includes("NT$"));
      if (name !== "抵用金") assert.ok(!html.includes("抵用金"));
    });
    await test(`saved credit name ${name} updates submitted member history and Admin`, () => {
      for (const child of [createElement(ReturnRequestEvidence, { request: pointAdjusted.requests[0], view: pointAdjusted }), createElement(AdminReturnDetail, { initial: pointAdjusted })]) {
        const html = render(child, savedCopy.overrides); for (const value of [60, 50, 10]) assert.ok(html.includes(`${value} ${name}`));
        assert.ok(html.includes("4 KD點" ) || !html.includes("相關回饋進度")); assert.ok(!html.includes("NT$"));
      }
    });
  }
  await test("credit-name changes never rewrite source order or commerce/return evidence", async () => { assert.equal(await fs.readFile(statePath, "utf8"), persistedBeforeLabelChange); assert.equal(await fs.readFile(pointFixture.orderPath, "utf8"), orderBeforeLabelChange); });
  const lastCopy = await readMemberCenterCopy();
  await saveMemberCenterCopy({ expectedRevision: lastCopy.revision, overrides: { "member.returns.errorInput": "請重新檢查您的退貨資料。" } });
  const originalPointSettings = await getActiveMembershipRules(now);
  const renamedRules = structuredClone(originalPointSettings.rules); renamedRules.referral.pointDisplayName = "CoffeePoint";
  await saveMembershipBusinessRules({ expectedRevision: (await readMembershipRulesStore()).revision, rules: renamedRules, now });
  await test("existing global point setting is the sole shared label authority", async () => assert.equal(await readPointDisplayName(), "CoffeePoint"));
  await test("member and Admin return rewards honor exact configured mixed-case name", async () => { const name = await readPointDisplayName(); for (const child of [createElement(ReturnRewardEvidence, { rewards: pointAdjusted.rewards }), createElement(AdminReturnDetail, { initial: pointAdjusted })]) { const html = render(child, {}, name); assert.ok(html.includes("10 CoffeePoint")); assert.ok(html.includes("4 CoffeePoint")); assert.ok(!html.includes("KD點")); assert.ok(!html.includes("COFFEEPOINT")); } });
  const currentVersion = await getActiveMembershipRules(now), conversionRules = structuredClone(currentVersion.rules);
  conversionRules.referral.pvRewardMoneyValue = 9;
  await saveMembershipBusinessRules({ expectedRevision: (await readMembershipRulesStore()).revision, rules: conversionRules, now });
  await test("current Admin conversion changes do not rewrite historical reward units", async () => { const view = await getReturnWorkflow(pointFixture.orderNumber, memberId); assert.equal(view.rewards[0].display.conversionValue, 2.5); assert.equal(view.rewards[0].display.effective, 4); assert.equal(view.rewards[0].display.effectiveCredit, 10); assert.equal((await getActiveMembershipRules(now)).rules.referral.pvRewardMoneyValue, 9); });
  const missingPoints = await state(); delete (missingPoints.referralRewards[pointFixture.rewardId] as Partial<typeof missingPoints.referralRewards[string]>).rewardPV;
  await test("missing point source is explicit review, never inferred from credit", () => { const unit = projectReturnRewardUnits(missingPoints, { program: "referral", id: pointFixture.rewardId }, projectPendingReturnRewardEntitlement(missingPoints, { program: "referral", id: pointFixture.rewardId })); assert.equal(unit.original, null); assert.equal(unit.effective, null); assert.equal(unit.pointEvidenceStatus, "manual_review_required"); });
  const lostCalculation = projectPendingReturnRewardEntitlement(await state(), { program: "referral", id: pointFixture.rewardId });
  lostCalculation.resolutions = lostCalculation.resolutions.map(value => ({ ...value, calculation: {} }));
  await test("missing point consequence evidence never divides rounded credit", async () => { const unit = projectReturnRewardUnits(await state(), { program: "referral", id: pointFixture.rewardId }, lostCalculation); assert.equal(unit.original, 10); assert.equal(unit.effective, null); });
  for (const conversion of [0, 0.01]) {
    const tiny = await fixture({ points: true, conversion }), tinyPreview = await preview(tiny), tinyResult = await submit(tiny, creation(tiny, tinyPreview.confirmationToken), []), tinyCreated = await tinyResult.json();
    await adminReturnAction(tiny.orderNumber, "owner", { action: "approve", returnRequestId: tinyCreated.returnRequestId, reason: "商品狀況已確認", idempotencyKey: "tiny-approve" });
    await test(`conversion ${conversion} does not turn positive points into zero`, async () => { const view = await getReturnWorkflow(tiny.orderNumber, memberId); assert.equal(view.rewards[0].display.original, 10); assert.equal(view.rewards[0].display.effective, 4); assert.equal(view.rewards[0].display.effectiveCredit, 0); assert.equal(view.rewards[0].reasonCopyKey, "member.returns.rewardAdjusted"); });
  }
  const tier = await fixture({ points: true, tier: true }), tierPreview = await preview(tier), tierResult = await submit(tier, creation(tier, tierPreview.confirmationToken), []), tierCreated = await tierResult.json();
  await adminReturnAction(tier.orderNumber, "owner", { action: "approve", returnRequestId: tierCreated.returnRequestId, reason: "商品狀況已確認", idempotencyKey: "tier-approve" });
  await test("preserved self-purchase tier payout also shows points 10 -> 4", async () => { const view = await getReturnWorkflow(tier.orderNumber, memberId); assert.equal(view.rewards[0].display.original, 10); assert.equal(view.rewards[0].display.effective, 4); assert.equal(view.rewards[0].display.effectiveCredit, 10); });
  const uploadHtml = render(createElement(MemberReturnWorkflow, { initial: pointAdjusted }));
  await test("return icon is original inline package/circular-arrow SVG", () => { assert.ok(uploadHtml.includes('viewBox="0 0 48 48"')); assert.ok(!uploadHtml.includes("↩")); assert.ok(!uploadHtml.includes("shutterstock")); });
  const iconSource = await fs.readFile("components/member/ReturnIcons.tsx", "utf8");
  await test("upload control provides original image icon without an external asset", () => { assert.ok(iconSource.includes("ReturnPhotoIcon")); assert.ok(iconSource.includes("<rect")); assert.ok(!iconSource.includes("http")); });
  await test("protected runtime files remain untouched", async () => assert.deepEqual(await Promise.all(protectedFiles.map(bytes)), before));
  console.log(`J.6F.1F return UX/integration: ${passes}/${passes} PASS; isolated fixtures, no external messages.`);
} finally {
  mock.timers.reset(); globals.__returnHooks = undefined; globals.__returnCookies = undefined;
  if (previousRoot === undefined) delete process.env.KD_DATA_DIR; else process.env.KD_DATA_DIR = previousRoot;
  const target = path.resolve(root); assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep)); await fs.rm(target, { recursive: true, force: true });
}
