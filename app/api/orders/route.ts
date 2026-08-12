import { NextResponse } from "next/server";
import { getOrdersDir, getWebsiteDataFile } from "@/lib/storagePaths";
import { makeOrderNumber } from "@/lib/orders";
import { createOrderFile, OrderFileCreationError, updateOrderFile } from "@/lib/orderFiles";
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

function clean(value: unknown, max = 200) { return String(value ?? "").trim().slice(0, max); }
function validPhone(value: string) { return /^09\d{8}$/.test(value); }
function validEmail(value: string) { return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function validStoreId(value: string) { return /^[0-9A-Za-z]{4,10}$/.test(value); }
function addCalendarDays(dateText: string, days: number) {
  const [year, month, day] = dateText.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

async function sendLineNotification(text: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.LINE_ORDER_RECIPIENT_ID;
  if (!token || !to) return { sent: false, reason: "LINE environment variables are not configured" };
  let lastError = "LINE notification failed";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
        signal: AbortSignal.timeout(12000),
      });
      const responseText = await response.text();
      if (response.ok) return { sent: true, requestId: response.headers.get("x-line-request-id") || undefined };
      lastError = `LINE ${response.status}: ${responseText.slice(0, 300)}`;
    } catch (error) { lastError = error instanceof Error ? error.message : "LINE notification failed"; }
    if (attempt === 1) await new Promise(resolve => setTimeout(resolve, 800));
  }
  return { sent: false, reason: lastError };
}

const orderDir = () => getOrdersDir();
const websiteFile = () => getWebsiteDataFile();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const idempotencyKey = clean(body.idempotencyKey, 100);
    if (!isValidIdempotencyKey(idempotencyKey)) throw new Error("結帳識別碼無效，請重新整理結帳頁後再試。");
    const member = await getCurrentMember();
    const orderMode = clean(body.orderMode, 30) || "711_cod";
    if (!["711_cod", "studio_pickup", "corporate_gift"].includes(orderMode)) throw new Error("訂購方式不正確");
    const customer = { name: clean(body.customer?.name, 20), phone: clean(body.customer?.phone, 10), email: clean(body.customer?.email, 120), note: clean(body.customer?.note, 300) };
    if (!customer.name) throw new Error("請填寫姓名");
    if (!validPhone(customer.phone)) throw new Error("手機號碼格式不正確");
    if (!validEmail(customer.email)) throw new Error("Email 格式不正確");
    const memberInfo = member ? { memberId: member.id, lineUserId: member.lineUserId, lineDisplayName: member.displayName } : null;
    const requestHash = createIdempotencyRequestHash({
      orderMode,
      customer,
      store: body.store ?? null,
      studioPickup: body.studioPickup ?? null,
      corporateGift: body.corporateGift ?? null,
      items: body.items ?? null,
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
        order = { orderNumber, createdAt, status: "corporate_gift_inquiry", orderMode, customer, member: memberInfo, corporateGift: gift, startingPrice: 1200, idempotencyKey, idempotencyRequestHash: requestHash };
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
                order: { orderNumber: candidateOrderNumber, createdAt, status: "waiting_merchant_create_cod_shipment", orderMode, customer, member: memberInfo, store, payment: "cash_on_delivery", delivery: "7-ELEVEN 門市取貨付款", lineNotification: { sent: false, status: "pending" }, idempotencyKey, idempotencyRequestHash: requestHash, ...priced },
                lineText: `【KD Coffee 新訂單｜7-ELEVEN 取貨付款】\n\n訂單編號：${candidateOrderNumber}\n會員：${member ? `${member.displayName}（LINE 會員）` : "訪客"}\n姓名：${customer.name}\n手機：${customer.phone}\nEmail：${customer.email || "未提供"}\n\n門市店號：${store.id}\n門市名稱：${store.name}\n門市地址：${store.address}\n\n訂購內容：\n${itemLines}\n\n商品小計：NT$ ${priced.subtotal.toLocaleString("zh-TW")}\n運費：${priced.shipping ? `NT$ ${priced.shipping}` : "免運"}\n取貨付款總額：NT$ ${priced.total.toLocaleString("zh-TW")}\n\n備註：${customer.note || "無"}\n\n下一步：請核對門市資料後，建立 7-ELEVEN 取貨付款寄件單。`,
              };
            }
            const pickup = { preferredDate: clean(body.studioPickup?.preferredDate, 20), preferredTime: clean(body.studioPickup?.preferredTime, 20) };
            const taipeiToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
            const hasCustomRoast = priced.items.some(item => item.customRoast);
            const earliestPickupDate = addCalendarDays(taipeiToday, hasCustomRoast ? 3 : 0);
            const allowedPickupTimes = new Set(["14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00"]);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(pickup.preferredDate) || pickup.preferredDate < earliestPickupDate) throw new Error(hasCustomRoast ? `訂單含專屬烘焙，工作室自取最早為 ${earliestPickupDate}` : "工作室自取日期不可早於今天");
            if (!allowedPickupTimes.has(pickup.preferredTime)) throw new Error("工作室自取時間僅開放下午 2:00 至晚上 8:00");
            return {
              order: { orderNumber: candidateOrderNumber, createdAt, status: "waiting_studio_pickup_confirmation", orderMode, customer, member: memberInfo, studioPickup: pickup, payment: "pickup_confirmation", delivery: "KD Coffee 工作室自取", lineNotification: { sent: false, status: "pending" }, idempotencyKey, idempotencyRequestHash: requestHash, ...priced, shipping: 0, total: priced.subtotal },
              lineText: `【KD Coffee 新訂單｜工作室自取】\n\n訂單編號：${candidateOrderNumber}\n會員：${member ? `${member.displayName}（LINE 會員）` : "訪客"}\n姓名：${customer.name}\n手機：${customer.phone}\nEmail：${customer.email || "未提供"}\n\n希望取貨日期：${pickup.preferredDate || "未指定"}\n希望時段：${pickup.preferredTime || "由工作室聯絡確認"}\n\n訂購內容：\n${itemLines}\n\n訂單總額：NT$ ${priced.subtotal.toLocaleString("zh-TW")}\n備註：${customer.note || "無"}`,
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
      return NextResponse.json({
        orderNumber: core.order.orderNumber,
        orderMode: core.order.orderMode,
        saved: true,
        idempotentReplay: true,
        lineNotification: storedLineNotification,
        warning: core.warning,
      }, { status: core.status });
    }
    if (core.kind === "pending") {
      return NextResponse.json({
        orderNumber: core.orderNumber,
        orderMode: core.orderMode,
        saved: true,
        pending: true,
        lineNotification: { sent: false, reason: "inventory finalization pending" },
        warning: core.warning,
      }, { status: 202 });
    }

    const { orderNumber, order, lineText, favoriteStore } = core;

    const warnings: string[] = [];
    if (member) {
      try {
        await updateMemberProfile(member.id, { pickupName: customer.name, phone: customer.phone, email: customer.email || member.email, favoriteStore });
      } catch (error) {
        warnings.push("訂單已成立，但會員資料暫時無法更新。");
        console.error(`Order ${orderNumber} saved but member update failed:`, error);
      }
    }

    const lineResult = await sendLineNotification(lineText);
    if (!lineResult.sent) warnings.push("訂單已保存，但 LINE 群組通知暫時失敗，工作室可從訂單資料補查。");
    order.lineNotification = { ...lineResult, checkedAt: new Date().toISOString() };
    try {
      await updateOrderFile(orderDir(), orderNumber, order);
    } catch (error) {
      warnings.push("訂單已成立，但通知結果暫時無法寫回訂單檔案。");
      console.error(`Order ${orderNumber} saved but notification result update failed:`, error);
    }
    if (!lineResult.sent) console.error(`Order ${orderNumber} saved but LINE notification failed:`, lineResult.reason);

    return NextResponse.json({ orderNumber, orderMode, saved: true, lineNotification: lineResult, warning: warnings.length ? warnings.join(" ") : undefined });
  } catch (error) {
    const serverError = error instanceof OrderFileCreationError || error instanceof InventoryTransactionError || error instanceof FileLockTimeoutError || error instanceof OrderIdempotencyError;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "訂單送出失敗" },
      { status: error instanceof OrderPriceConflictError ? 409 : serverError ? 500 : 400 },
    );
  }
}
