import { NextResponse } from "next/server";
import { getOrdersDir, getWebsiteDataFile } from "@/lib/storagePaths";
import { makeOrderNumber } from "@/lib/orders";
import {
  createOrderFile,
  OrderFileCreationError,
  OrderFileNotFoundError,
  OrderFileValidationError,
} from "@/lib/orderFiles";
import { FileLockTimeoutError } from "@/lib/jsonFileStore";
import { InventoryTransactionError, runInventoryOrderTransaction } from "@/lib/orderInventoryTransaction";
import { OrderPriceConflictError } from "@/lib/orderPricing";
import {
  createIdempotencyRequestHash,
  isValidIdempotencyKey,
  OrderIdempotencyError,
  resolveExistingIdempotentOrder,
  withOrderIdempotencyLock,
} from "@/lib/orderIdempotency";
import { getCurrentMember, updateMemberProfile } from "@/lib/memberAuth";
import { updateStoredOrderSafely } from "@/lib/adminOrders";
import { createGuestOrderAccess } from "@/lib/orderConversation";
import { sendInternalLineNotification } from "@/lib/internalLineNotifications";
import { createSubscription, getCheckoutCreditQuote, registerReferralQualificationOrder, reserveCredit, settleCreditReservation } from "@/lib/membershipCommerce";
import { getActiveMembershipRules } from "@/lib/membershipBusinessRules";
import {
  getDateOnlyInTimeZone,
} from "@/lib/checkoutRules";
import { resolvePickupDateAvailability, resolveSubscriptionDateAvailability, resolveSubscriptionInterval } from "@/lib/membershipPolicies";

function clean(value: unknown, max = 200) { return String(value ?? "").trim().slice(0, max); }
function validPhone(value: string) { return /^09\d{8}$/.test(value); }
function validEmail(value: string) { return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function validStoreId(value: string) { return /^[0-9A-Za-z]{4,10}$/.test(value); }

const orderDir = () => getOrdersDir();
const websiteFile = () => getWebsiteDataFile();

async function applyCheckoutCredit(input: { memberId: string; orderNumber: string; order: Record<string, unknown>; requestedCredit: number; idempotencyKey: string }) {
  const storedCredit = input.order.credit && typeof input.order.credit === "object" ? input.order.credit as Record<string, unknown> : null;
  if (typeof storedCredit?.reservationId === "string") return { appliedAmount: Number(storedCredit.appliedAmount || 0), reservationId: storedCredit.reservationId, total: Number(input.order.total || 0) };
  const merchandiseSubtotal = Number(input.order.subtotal || 0);
  const shippingAmount = Number(input.order.shipping || 0);
  const quote = await getCheckoutCreditQuote({ memberId: input.memberId, merchandiseSubtotal, shipping: shippingAmount });
  const approvedCredit = Math.min(input.requestedCredit, quote.maximumUsable);
  if (approvedCredit <= 0) return { appliedAmount: 0, warning: "本次沒有可使用的抵用金，訂單仍以原應付金額成立。", total: Number(input.order.total || 0) };
  const reservation = await reserveCredit({ memberId: input.memberId, orderId: input.orderNumber, requestedAmount: approvedCredit, merchandiseSubtotal, shipping: shippingAmount, idempotencyKey: `checkout:${input.idempotencyKey}` });
  if (reservation.status !== "reserved") return { appliedAmount: 0, warning: "抵用金保留已結束，訂單仍以原應付金額成立。", total: Number(input.order.total || 0) };
  try {
    const updated = await updateStoredOrderSafely(input.orderNumber, (latestOrder) => {
      const latestCredit = latestOrder.credit && typeof latestOrder.credit === "object" ? latestOrder.credit as Record<string, unknown> : null;
      if (latestCredit?.reservationId === reservation.reservationId) return latestOrder;
      const totalBeforeCredit = Number(latestOrder.totalBeforeCredit ?? latestOrder.total ?? latestOrder.subtotal ?? 0);
      return {
        ...latestOrder,
        credit: { reservationId: reservation.reservationId, requestedAmount: input.requestedCredit, appliedAmount: reservation.amount, status: "reserved", rulesVersion: quote.rulesVersion },
        totalBeforeCredit,
        total: Math.max(0, totalBeforeCredit - reservation.amount),
      };
    });
    return { appliedAmount: reservation.amount, reservationId: reservation.reservationId, total: Number(updated.total || 0) };
  } catch (error) {
    await settleCreditReservation({ reservationId: reservation.reservationId, action: "release", idempotencyKey: `checkout-write-failed:${input.idempotencyKey}`, reason: "訂單折抵結果寫入失敗" });
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const idempotencyKey = clean(body.idempotencyKey, 100);
    if (!isValidIdempotencyKey(idempotencyKey)) throw new Error("結帳識別碼無效，請重新整理結帳頁後再試。");
    const member = await getCurrentMember();
    const guestAccess = member ? null : createGuestOrderAccess();
    const guestOrderAccess = guestAccess
      ? { tokenHash: guestAccess.tokenHash, createdAt: new Date().toISOString() }
      : undefined;
    const orderMode = clean(body.orderMode, 30) || "711_cod";
    if (!["711_cod", "studio_pickup", "corporate_gift"].includes(orderMode)) throw new Error("訂購方式不正確");
    const customer = { name: clean(body.customer?.name, 20), phone: clean(body.customer?.phone, 10), email: clean(body.customer?.email, 120), note: clean(body.customer?.note, 300) };
    if (!customer.name) throw new Error("請填寫姓名");
    if (!validPhone(customer.phone)) throw new Error("手機號碼格式不正確");
    if (!validEmail(customer.email)) throw new Error("Email 格式不正確");
    const memberInfo = member ? { memberId: member.id, lineUserId: member.lineUserId, lineDisplayName: member.displayName } : null;
    const rulesVersion = await getActiveMembershipRules();
    const requestedCredit = Number(body.requestedCredit ?? 0);
    if (!Number.isSafeInteger(requestedCredit) || requestedCredit < 0) throw new Error("抵用金金額不正確");
    if (requestedCredit > 0 && !member) throw new Error("請先登入會員才能使用抵用金");
    const subscriptionIntent = member && body.subscriptionIntent?.consent === true ? { consent: true, intervalDays: Number(body.subscriptionIntent.intervalDays), firstRenewalDate: clean(body.subscriptionIntent.firstRenewalDate, 10) } : null;
    if (subscriptionIntent) {
      if (!resolveSubscriptionInterval(subscriptionIntent.intervalDays, rulesVersion.rules).allowed || !/^\d{4}-\d{2}-\d{2}$/.test(subscriptionIntent.firstRenewalDate)) throw new Error("定期配送日期或週期不正確");
      const subscriptionAvailability = resolveSubscriptionDateAvailability({ requestedDate: subscriptionIntent.firstRenewalDate, today: getDateOnlyInTimeZone(new Date()), customRoast: false, rules: rulesVersion.rules });
      if (!subscriptionAvailability.allowed) throw new Error(`第一次續訂最早可選 ${subscriptionAvailability.earliestDate}`);
    }
    const requestHash = createIdempotencyRequestHash({
      orderMode,
      customer,
      store: body.store ?? null,
      studioPickup: body.studioPickup ?? null,
      corporateGift: body.corporateGift ?? null,
      items: body.items ?? null,
      ...(subscriptionIntent ? { subscriptionIntent } : {}),
      requestedCredit,
    });

    const core = await withOrderIdempotencyLock(orderDir(), idempotencyKey, async () => {
      const existing = await resolveExistingIdempotentOrder(orderDir(), websiteFile(), idempotencyKey, requestHash);
      if (existing.action === "replay") return { kind: "replay" as const, ...existing };

      let orderNumber = existing.action === "retry" ? existing.orderNumber : makeOrderNumber();
      const createdAt = existing.action === "retry" && typeof existing.order.createdAt === "string"
        ? existing.order.createdAt
        : new Date().toISOString();
      let order: Record<string, unknown>;
      let lineText = "";
      let favoriteStore: { id:string; name:string; address:string } | undefined;

      if (orderMode === "corporate_gift") {
        const gift = { companyName: clean(body.corporateGift?.companyName, 80), boxSize: clean(body.corporateGift?.boxSize, 20), boxQuantity: Number(body.corporateGift?.boxQuantity || 0), desiredDate: clean(body.corporateGift?.desiredDate, 20), invoiceTaxId: clean(body.corporateGift?.invoiceTaxId, 8), customization: clean(body.corporateGift?.customization, 600) };
        if (!gift.companyName || !["18", "24", "custom"].includes(gift.boxSize) || !Number.isInteger(gift.boxQuantity) || gift.boxQuantity < 1) throw new Error("企業送禮資料不完整");
        order = { orderNumber, createdAt, status: "corporate_gift_inquiry", orderMode, customer, member: memberInfo, guestOrderAccess, corporateGift: gift, startingPrice: 1200, idempotencyKey, idempotencyRequestHash: requestHash };
        const boxLabel = gift.boxSize === "custom" ? "其他客製數量" : `${gift.boxSize} 入耳掛禮盒`;
        lineText = `【KD Coffee 企業送禮需求】\n\n洽詢編號：${orderNumber}\n會員：${member ? `${member.displayName}（LINE 會員）` : "訪客"}\n公司／單位：${gift.companyName}\n聯絡人：${customer.name}\n手機：${customer.phone}\nEmail：${customer.email || "未提供"}\n\n希望盒型：${boxLabel}\n預估盒數：${gift.boxQuantity} 盒\n方案價格：NT$1,200 起／依需求正式報價\n希望交貨日：${gift.desiredDate || "未指定"}\n統一編號：${gift.invoiceTaxId || "未提供"}\n\n客製需求：${gift.customization || "未填寫"}\n其他備註：${customer.note || "無"}`;
        const created = await createOrderFile(orderDir(), orderNumber, order, makeOrderNumber);
        if (created.orderNumber !== orderNumber) lineText = lineText.replace(orderNumber, created.orderNumber);
        orderNumber = created.orderNumber;
        order = created.order;
      } else {
        const transaction = await runInventoryOrderTransaction({
          websiteFile: websiteFile(),
          orderDir: orderDir(),
          items: body.items,
          initialOrderNumber: orderNumber,
          reuseOrderNumber: existing.action === "retry" ? existing.orderNumber : undefined,
          generateOrderNumber: makeOrderNumber,
          buildOrder: (candidateOrderNumber, priced) => {
            const itemLines = priced.items.map(item => `${item.name}｜${item.optionLabel} ${item.optionDetail}${item.preparationLabel ? `｜${item.preparationLabel}` : ""} × ${item.quantity}${item.customRoast ? `｜專屬烘焙：${item.roastLevel}${item.roastNote ? `（${item.roastNote}）` : ""}` : ""}｜NT$ ${item.lineTotal.toLocaleString("zh-TW")}`).join("\n");
            if (orderMode === "711_cod") {
              const store = { id: clean(body.store?.id, 10), name: clean(body.store?.name, 30), address: clean(body.store?.address, 100) };
              if (!validStoreId(store.id) || !store.name || !store.address) throw new Error("請選擇正確且完整的 7-ELEVEN 門市");
              favoriteStore = store;
              return {
                order: { orderNumber: candidateOrderNumber, createdAt, status: "waiting_merchant_create_cod_shipment", orderMode, customer, member: memberInfo, guestOrderAccess, store, subscriptionIntent, payment: "cash_on_delivery", delivery: "7-ELEVEN 門市取貨付款", lineNotification: { sent: false, status: "pending" }, idempotencyKey, idempotencyRequestHash: requestHash, ...priced },
                lineText: `【KD Coffee 新訂單｜7-ELEVEN 取貨付款】\n\n訂單編號：${candidateOrderNumber}\n會員：${member ? `${member.displayName}（LINE 會員）` : "訪客"}\n姓名：${customer.name}\n手機：${customer.phone}\nEmail：${customer.email || "未提供"}\n\n門市店號：${store.id}\n門市名稱：${store.name}\n門市地址：${store.address}\n\n訂購內容：\n${itemLines}\n\n商品小計：NT$ ${priced.subtotal.toLocaleString("zh-TW")}\n運費：${priced.shipping ? `NT$ ${priced.shipping}` : "免運"}\n取貨付款總額：NT$ ${priced.total.toLocaleString("zh-TW")}\n\n備註：${customer.note || "無"}\n\n下一步：請核對門市資料後，建立 7-ELEVEN 取貨付款寄件單。`,
              };
            }
            const pickup = { preferredDate: clean(body.studioPickup?.preferredDate, 20) };
            const taipeiToday = getDateOnlyInTimeZone(new Date());
            const hasCustomRoast = priced.items.some(item => item.customRoast);
            const pickupAvailability = resolvePickupDateAvailability({ requestedDate: pickup.preferredDate, today: taipeiToday, customRoast: hasCustomRoast, rules: rulesVersion.rules });
            if (!pickupAvailability.allowed) throw new Error(pickupAvailability.reason === "blocked-date" ? "這一天工作室暫停自取，請選擇其他日期" : `工作室自取最早可選 ${pickupAvailability.earliestDate}`);
            return {
              order: { orderNumber: candidateOrderNumber, createdAt, status: "waiting_studio_pickup_confirmation", orderMode, customer, member: memberInfo, guestOrderAccess, studioPickup: pickup, subscriptionIntent, payment: "pickup_confirmation", delivery: "KD Coffee 工作室自取", lineNotification: { sent: false, status: "pending" }, idempotencyKey, idempotencyRequestHash: requestHash, ...priced, shipping: 0, total: priced.subtotal },
              lineText: `【KD Coffee 新訂單｜工作室自取】\n\n訂單編號：${candidateOrderNumber}\n會員：${member ? `${member.displayName}（LINE 會員）` : "訪客"}\n姓名：${customer.name}\n手機：${customer.phone}\nEmail：${customer.email || "未提供"}\n\n希望取貨日期：${pickup.preferredDate || "未指定"}\n取貨時間：由工作室確認後通知\n\n訂購內容：\n${itemLines}\n\n訂單總額：NT$ ${priced.subtotal.toLocaleString("zh-TW")}\n備註：${customer.note || "無"}`,
            };
          },
        });
        orderNumber = transaction.orderNumber;
        order = transaction.order;
        lineText = transaction.lineText;
        if (!transaction.finalized) {
          return { kind: "pending" as const, orderNumber, orderMode, warning: transaction.warning };
        }
      }
      return { kind: "created" as const, orderNumber, orderMode, order, lineText, favoriteStore };
    });

    if (core.kind === "replay") {
      const storedLineNotification = core.order.lineNotification && typeof core.order.lineNotification === "object"
        ? core.order.lineNotification
        : { sent: false, status: "pending" };
      let replayCredit = core.order.credit ?? { requestedAmount: requestedCredit, appliedAmount: 0 };
      let replayWarning = core.warning;
      if (member && requestedCredit > 0 && core.order.orderMode !== "corporate_gift" && !(core.order.credit && typeof core.order.credit === "object" && typeof (core.order.credit as Record<string, unknown>).reservationId === "string")) {
        try {
          const recovered = await applyCheckoutCredit({ memberId: member.id, orderNumber: String(core.order.orderNumber), order: core.order, requestedCredit, idempotencyKey });
          replayCredit = { requestedAmount: requestedCredit, appliedAmount: recovered.appliedAmount, reservationId: recovered.reservationId };
          if (recovered.warning) replayWarning = [replayWarning, recovered.warning].filter(Boolean).join(" ");
        } catch {
          replayWarning = [replayWarning, "訂單已成立，但抵用金暫時無法套用。"].filter(Boolean).join(" ");
        }
      }
      if (member && core.order.orderMode !== "corporate_gift") {
        try {
          await registerReferralQualificationOrder({ memberId: member.id, orderId: String(core.order.orderNumber), orderCreatedAt: String(core.order.createdAt), orderType: core.order.subscriptionIntent ? "subscription" : "normal", idempotencyKey: `checkout:${idempotencyKey}` });
        } catch {
          replayWarning = [replayWarning, "訂單已成立，但推薦獎勵資格狀態暫時無法同步。"].filter(Boolean).join(" ");
        }
      }
      return NextResponse.json({
        orderNumber: core.order.orderNumber,
        orderMode: core.order.orderMode,
        saved: true,
        idempotentReplay: true,
        lineNotification: storedLineNotification,
        credit: replayCredit,
        warning: replayWarning,
      }, { status: core.status });
    }
    if (core.kind === "pending") {
      return NextResponse.json({
        orderNumber: core.orderNumber,
        orderMode: core.orderMode,
        orderAccessToken: guestAccess?.token,
        saved: true,
        pending: true,
        lineNotification: { sent: false, reason: "inventory finalization pending" },
        warning: core.warning,
      }, { status: 202 });
    }

    const { orderNumber, favoriteStore } = core;
    let lineText = core.lineText;

    const warnings: string[] = [];
    if (member && orderMode !== "corporate_gift") {
      try {
        await registerReferralQualificationOrder({ memberId: member.id, orderId: orderNumber, orderCreatedAt: String(core.order.createdAt), orderType: subscriptionIntent ? "subscription" : "normal", idempotencyKey: `checkout:${idempotencyKey}` });
      } catch (error) {
        warnings.push("訂單已成立，但推薦獎勵資格狀態暫時無法同步。");
        console.error(`Order ${orderNumber} saved but referral qualification registration failed:`, error);
      }
    }
    let appliedCredit = 0;
    let creditReservationId: string | undefined;
    if (member && requestedCredit > 0 && orderMode !== "corporate_gift") {
      const creditResult = await applyCheckoutCredit({ memberId: member.id, orderNumber, order: core.order, requestedCredit, idempotencyKey });
      appliedCredit = creditResult.appliedAmount;
      creditReservationId = creditResult.reservationId;
      if (creditResult.warning) warnings.push(creditResult.warning);
      if (creditResult.appliedAmount > 0) lineText += `\n\n會員抵用金：-NT$ ${creditResult.appliedAmount.toLocaleString("zh-TW")}\n折抵後應付：NT$ ${creditResult.total.toLocaleString("zh-TW")}`;
    }
    if (member) {
      try {
        await updateMemberProfile(member.id, { pickupName: customer.name, phone: customer.phone, email: customer.email || member.email, favoriteStore });
      } catch (error) {
        warnings.push("訂單已成立，但會員資料暫時無法更新。");
        console.error(`Order ${orderNumber} saved but member update failed:`, error);
      }
      if (subscriptionIntent) {
        try {
          const storedItems = Array.isArray(core.order.items) ? core.order.items as Array<Record<string, unknown>> : [];
          await createSubscription({ memberId: member.id, startedFromOrderId: orderNumber, anchorDate: subscriptionIntent.firstRenewalDate, intervalDays: subscriptionIntent.intervalDays, shippingMethod: orderMode, storeSelection: favoriteStore ? { storeId: favoriteStore.id, storeName: favoriteStore.name } : undefined, defaultItems: storedItems.map((item, index) => { const label = String(item.optionLabel || ""); const onePound = /一磅|1\s*lb|1磅/i.test(label); const slug = String(item.slug || `item-${index}`); return { itemId: `${slug}:${String(item.optionId || label)}`, packageWeight: onePound ? "one-pound" as const : "half-pound" as const, quantity: Number(item.quantity), roast: String(item.roastLevel || item.preparationLabel || "工作室建議"), components: onePound ? [{ productId: slug, weightHalfPounds: 1 as const }, { productId: slug, weightHalfPounds: 1 as const }] : [{ productId: slug, weightHalfPounds: 1 as const }], unitPrice: Number(item.unitPrice) }; }), idempotencyKey: `checkout:${idempotencyKey}` });
        } catch (error) {
          warnings.push("訂單已成立；定期配送申請已保存在訂單中，工作室將協助完成確認。");
          console.error(`Order ${orderNumber} saved but subscription enrollment failed:`, error);
        }
      }
    }

    const lineResult = await sendInternalLineNotification(lineText);
    if (!lineResult.sent) warnings.push("訂單已保存，但 LINE 群組通知暫時失敗，工作室可從訂單資料補查。");
    try {
      await updateStoredOrderSafely(
        orderNumber,
        (latestOrder) => ({
          ...latestOrder,
          lineNotification: {
            ...lineResult,
            checkedAt: new Date().toISOString(),
          },
        }),
      );
    } catch (error) {
      warnings.push("訂單已成立，但通知結果暫時無法寫回訂單檔案。");
      console.error(`Order ${orderNumber} saved but notification result update failed:`, error);
    }
    if (!lineResult.sent) console.error(`Order ${orderNumber} saved but LINE notification failed:`, lineResult.reason);

    return NextResponse.json({ orderNumber, orderMode, saved: true, orderAccessToken: guestAccess?.token, lineNotification: lineResult, credit: { requestedAmount: requestedCredit, appliedAmount: appliedCredit, reservationId: creditReservationId }, warning: warnings.length ? warnings.join(" ") : undefined });
  } catch (error) {
    const serverError = error instanceof OrderFileCreationError || error instanceof OrderFileNotFoundError || error instanceof OrderFileValidationError || error instanceof InventoryTransactionError || error instanceof FileLockTimeoutError || error instanceof OrderIdempotencyError;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "訂單送出失敗" },
      { status: error instanceof OrderPriceConflictError ? 409 : serverError ? 500 : 400 },
    );
  }
}
