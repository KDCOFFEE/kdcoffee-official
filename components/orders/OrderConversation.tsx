"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import OrderTimeline from "@/components/orders/OrderTimeline";
import AtmTransferInfoDialog from "@/components/orders/AtmTransferInfoDialog";
import type { OrderMessage } from "@/lib/orderConversation";
import type { OrderTimelineEntry } from "@/lib/orderTimeline";
import type { DeliveryAddress } from "@/lib/deliveryAddress";
import type { AtmTransferClaim, AtmTransferSnapshot, HomeDeliveryPaymentDetails } from "@/lib/homeDeliveryPayment";

type CustomerOrderSummary = {
  orderNumber: string;
  createdAt: string;
  status: string;
  orderMode: string;
  statusLabel: string;
  modeLabel: string;
  deliveryAddress: DeliveryAddress | null;
  paymentDetails: HomeDeliveryPaymentDetails | null;
  atmTransferSnapshot: AtmTransferSnapshot | null;
  atmTransferClaims: AtmTransferClaim[];
  cancellation: {
    reason: string | null;
    cancelledAt: string | null;
    cancelledBy: "admin" | "member" | null;
  } | null;
  financialBreakdown: {
    subtotal: number;
    shipping: number;
    codServiceFee: number;
    creditApplied: number | null;
    totalBeforeCredit: number | null;
    total: number;
  };
  creditReservation: { amount: number; status: "reserved" | "consumed" | "released" } | null;
};

const money = (value: number) => `NT$ ${value.toLocaleString("zh-TW")}`;

function currentLocalDateTimeValue() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

const DIRECT_MEMBER_CANCELLATION_STATUSES = new Set([
  "new_order",
  "confirmed",
  "waiting_merchant_create_cod_shipment",
  "waiting_studio_pickup_confirmation",
  "inventory_pending",
  "inventory_failed",
]);

const MEMBER_CANCELLATION_REASONS = [
  "單純想取消",
  "行程／取貨時間不方便",
  "咖啡還沒喝完，暫時不需要",
  "想更換咖啡／數量／烘焙度",
  "重複下單或誤操作",
  "預算考量",
  "其他",
] as const;

function cancellationPresentation(status: string, orderMode: string) {
  if (
    DIRECT_MEMBER_CANCELLATION_STATUSES.has(status) ||
    (status === "ready_for_pickup" && orderMode === "studio_pickup")
  ) {
    return {
      canSubmit: true,
      note: "目前可提出自助取消。確認後系統會依既有安全流程處理訂單、庫存與已保留的會員抵用金。",
    };
  }
  if (status === "shipment_created") {
    return {
      canSubmit: true,
      note: "此訂單已建立 7-ELEVEN 寄件資訊。送出後會先建立取消申請，KD Coffee 需確認物流單作廢後才會完成取消。",
    };
  }
  if (status === "shipped") {
    return {
      canSubmit: false,
      note: "此訂單已完成交寄，無法使用會員自助取消；如需取消或退貨，請使用下方訂單詢問聯繫 KD Coffee。",
    };
  }
  if (status === "ready_for_pickup") {
    return {
      canSubmit: false,
      note: "此訂單已進入待取貨階段，無法使用會員自助取消；如需協助，請使用下方訂單詢問聯繫 KD Coffee。",
    };
  }
  if (status === "completed") {
    return {
      canSubmit: false,
      note: "此訂單已完成取貨，不能使用一般取消；如需退貨協助，請使用下方訂單詢問聯繫 KD Coffee。",
    };
  }
  if (status === "cancelled") {
    return {
      canSubmit: false,
      note: "此訂單已取消，不需要再次操作。",
    };
  }
  return {
    canSubmit: false,
    note: "此訂單目前無法使用會員自助取消；如需協助，請使用下方訂單詢問聯繫 KD Coffee。",
  };
}

function tokenFromBrowser(orderNumber: string) {
  const hashToken = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
  if (hashToken) {
    sessionStorage.setItem(`kdcoffee-order-access:${orderNumber}`, hashToken);
    return hashToken;
  }
  return sessionStorage.getItem(`kdcoffee-order-access:${orderNumber}`) || "";
}

function mergeMessage(messages: OrderMessage[], message: OrderMessage) {
  return messages.some((entry) => entry.id === message.id) ? messages : [...messages, message];
}

export default function OrderConversation({ orderNumber }: { orderNumber: string }) {
  const [order, setOrder] = useState<CustomerOrderSummary>();
  const [access, setAccess] = useState<"member" | "guest">();
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [timeline, setTimeline] = useState<OrderTimelineEntry[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellationOtherReason, setCancellationOtherReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancellationNotice, setCancellationNotice] = useState("");
  const [cancellationError, setCancellationError] = useState("");
  const [claimLast5, setClaimLast5] = useState("");
  const [claimTransferredAt, setClaimTransferredAt] = useState(currentLocalDateTimeValue);
  const [claimReceipt, setClaimReceipt] = useState<File | null>(null);
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimNotice, setClaimNotice] = useState("");
  const [claimError, setClaimError] = useState("");
  const token = useRef("");
  const actionId = useRef("");
  const cancellationActionId = useRef("");
  const claimActionId = useRef("");
  const claimReceiptInput = useRef<HTMLInputElement>(null);

  const loadOrder = useCallback(async () => {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}/messages`, {
      cache: "no-store",
      headers: token.current ? { "X-Order-Access-Token": token.current } : undefined,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "無法讀取訂單。");
    setOrder(result.order);
    setAccess(result.access === "member" ? "member" : "guest");
    setMessages(Array.isArray(result.messages) ? result.messages : []);
    setTimeline(Array.isArray(result.timeline) ? result.timeline : []);
  }, [orderNumber]);

  useEffect(() => {
    token.current = tokenFromBrowser(orderNumber);
    loadOrder()
      .catch((reason) => setError(reason instanceof Error ? reason.message : "無法讀取訂單。"))
      .finally(() => setLoading(false));
  }, [loadOrder, orderNumber]);

  async function submitAtmTransferClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order || order.orderMode !== "home_delivery" || order.paymentDetails?.method !== "atm_transfer") return;
    setClaimError("");
    setClaimNotice("");

    if (!/^\d{5}$/.test(claimLast5.trim())) {
      setClaimError("請輸入匯款帳號末五碼（5 位數字）。");
      return;
    }
    const transferredAtDate = new Date(claimTransferredAt);
    if (!claimTransferredAt || Number.isNaN(transferredAtDate.getTime())) {
      setClaimError("請填寫正確的匯款日期與時間。");
      return;
    }
    if (claimReceipt && claimReceipt.size > 5 * 1024 * 1024) {
      setClaimError("匯款明細圖片不可超過 5MB。");
      return;
    }

    if (!claimActionId.current) claimActionId.current = crypto.randomUUID();
    setClaimSubmitting(true);
    try {
      const form = new FormData();
      form.append("actionId", claimActionId.current);
      form.append("accountLast5", claimLast5.trim());
      form.append("transferredAt", transferredAtDate.toISOString());
      if (claimReceipt) form.append("receipt", claimReceipt);

      const response = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}/transfer-claim`, {
        method: "POST",
        headers: token.current ? { "X-Order-Access-Token": token.current } : undefined,
        body: form,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "匯款回報暫時無法送出。");

      setClaimNotice(result.message || "匯款資料已回報，等待 KD Coffee 核對入帳。");
      setClaimReceipt(null);
      if (claimReceiptInput.current) claimReceiptInput.current.value = "";
      claimActionId.current = "";
      await loadOrder();
    } catch (reason) {
      setClaimError(reason instanceof Error ? reason.message : "匯款回報暫時無法送出。");
    } finally {
      setClaimSubmitting(false);
    }
  }

  async function cancelOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order || access !== "member") return;

    const reason = cancellationReason === "其他"
      ? cancellationOtherReason.trim()
        ? `其他：${cancellationOtherReason.trim()}`
        : ""
      : cancellationReason.trim();

    setCancellationError("");
    setCancellationNotice("");

    if (!reason) {
      setCancellationError(cancellationReason === "其他" ? "請填寫其他取消原因。" : "請選擇取消原因。");
      return;
    }

    if (!cancellationActionId.current) cancellationActionId.current = crypto.randomUUID();
    setCancelling(true);

    try {
      const response = await fetch(`/api/member/orders/${encodeURIComponent(orderNumber)}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cancellationReason: reason,
          idempotencyKey: cancellationActionId.current,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (response.status === 409 && result.customerMessage) {
        setCancellationNotice(result.customerMessage);
        cancellationActionId.current = "";
        await loadOrder();
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || result.customerMessage || "取消申請處理失敗。");
      }

      setCancellationNotice(result.customerMessage || (response.status === 202 ? "取消申請已送出。" : "訂單已取消。"));
      setCancellationReason("");
      setCancellationOtherReason("");
      cancellationActionId.current = "";
      await loadOrder();
    } catch (reasonError) {
      setCancellationError(reasonError instanceof Error ? reasonError.message : "取消申請處理失敗。");
    } finally {
      setCancelling(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!actionId.current) actionId.current = crypto.randomUUID();
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId: actionId.current,
          message,
          token: token.current || undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "留言暫時無法送出。");
      setMessages((current) => mergeMessage(current, result.message));
      if (Array.isArray(result.timeline)) setTimeline(result.timeline);
      setMessage("");
      actionId.current = "";
      setNotice("詢問已送出，我們看到後會盡快回覆。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "留言暫時無法送出。");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <section className="order-conversation-card"><p>正在讀取訂單…</p></section>;
  }
  if (!order) {
    return (
      <section className="order-conversation-card order-conversation-denied">
        <h1>無法開啟此訂單</h1>
        <p>{error || "請確認您已登入正確會員帳號，或使用下單完成時提供的安全連結。"}</p>
        <Link href="/member">前往會員登入</Link>
      </section>
    );
  }

  const latestAtmClaim = order.atmTransferClaims.length
    ? order.atmTransferClaims[order.atmTransferClaims.length - 1]
    : null;

  return (
    <section className="order-conversation-card">
      <header className="customer-order-summary">
        <p className="eyebrow dark">ORDER DETAIL</p>
        <h1>{order.orderNumber}</h1>
        <span>{new Date(order.createdAt).toLocaleString("zh-TW")}・{order.modeLabel}</span>
        <div><b>{order.statusLabel}</b><strong>{money(order.financialBreakdown.total)}</strong></div>
      </header>

      <div className="customer-order-financials" aria-label="訂單金額明細">
        <span>商品小計</span><b>{money(order.financialBreakdown.subtotal)}</b>
        <span>{order.modeLabel.startsWith("7-ELEVEN") ? "7-ELEVEN 運費" : "運費"}</span><b>{order.financialBreakdown.shipping ? money(order.financialBreakdown.shipping) : "免運"}</b>
        {order.orderMode === "home_delivery" && <><span>貨到付款手續費</span><b>{money(order.financialBreakdown.codServiceFee)}</b></>}
        {order.financialBreakdown.creditApplied !== null ? <><span>會員抵用金</span><b className="credit-deduction">−{money(order.financialBreakdown.creditApplied)}</b></> : null}
        {order.financialBreakdown.totalBeforeCredit !== null ? <><span>折抵前總額</span><b>{money(order.financialBreakdown.totalBeforeCredit)}</b></> : null}
        <strong>訂單總計</strong><strong>{money(order.financialBreakdown.total)}</strong>
      </div>

      {order.status === "cancelled" ? (
        <section
          aria-label="訂單取消資訊"
          style={{
            marginTop: 18,
            padding: "16px 18px",
            border: "1px solid #dfcbb9",
            borderRadius: 18,
            background: "#fbf3e9",
          }}
        >
          <strong style={{ display: "block", fontSize: 17, color: "#3e2d23" }}>
            此訂單已取消
          </strong>
          <p style={{ margin: "8px 0 0", lineHeight: 1.7, color: "#5f493b" }}>
            取消原因：<b>{order.cancellation?.reason || "此筆歷史訂單未記錄取消原因，如有疑問請聯繫 KD Coffee。"}</b>
          </p>
          {order.cancellation?.cancelledAt ? (
            <p style={{ margin: "4px 0 0", color: "#7b6555", fontSize: 13 }}>
              取消時間：{new Date(order.cancellation.cancelledAt).toLocaleString("zh-TW")}
            </p>
          ) : null}
        </section>
      ) : null}
      {order.orderMode === "home_delivery" && (
        <section
          aria-label="宅配資料"
          style={{
            marginTop: 18,
            padding: "18px",
            border: "1px solid #eadfd4",
            borderRadius: 18,
            background: "#faf6f0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 17 }}>宅配資料</strong>
            <span style={{ fontSize: 13, color: "#765f4e" }}>
              {order.paymentDetails?.method === "atm_transfer" ? "ATM 轉帳" : "貨到付款"}
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: 14,
              marginTop: 14,
            }}
          >
            <div>
              <small style={{ display: "block", color: "#8a725f", marginBottom: 4 }}>收件人</small>
              <strong>{order.deliveryAddress?.recipientName || "待確認"}</strong>
            </div>
            <div>
              <small style={{ display: "block", color: "#8a725f", marginBottom: 4 }}>聯絡電話</small>
              <strong>{order.deliveryAddress?.phone || "待確認"}</strong>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <small style={{ display: "block", color: "#8a725f", marginBottom: 4 }}>配送地址</small>
              <strong style={{ lineHeight: 1.65 }}>
                {order.deliveryAddress
                  ? `${order.deliveryAddress.postalCode} ${order.deliveryAddress.city}${order.deliveryAddress.district}${order.deliveryAddress.addressLine}`
                  : "地址待確認"}
              </strong>
            </div>
            <div>
              <small style={{ display: "block", color: "#8a725f", marginBottom: 4 }}>付款方式</small>
              <strong>{order.paymentDetails?.method === "atm_transfer" ? "ATM 轉帳" : "貨到付款"}</strong>
            </div>
            <div>
              <small style={{ display: "block", color: "#8a725f", marginBottom: 4 }}>付款狀態</small>
              <strong>{order.paymentDetails?.status === "paid" ? "已收款" : order.status === "cancelled" ? "訂單已取消" : "待收款"}</strong>
            </div>
          </div>

          {order.status !== "cancelled" && order.paymentDetails?.method === "atm_transfer" && order.atmTransferSnapshot ? (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #e8dbcf" }}>
              <AtmTransferInfoDialog
                data={{
                  bankName: order.atmTransferSnapshot.bankName,
                  bankCode: order.atmTransferSnapshot.bankCode,
                  branchName: order.atmTransferSnapshot.branchName,
                  accountName: order.atmTransferSnapshot.accountName,
                  accountNumber: order.atmTransferSnapshot.accountNumber,
                  instructions: order.atmTransferSnapshot.instructions,
                  bankbookImageUrl: order.atmTransferSnapshot.bankbookImageUrl,
                  showBankbookImage: order.atmTransferSnapshot.showBankbookImage,
                }}
              />
            </div>
          ) : null}
        </section>
      )}

      {order.status !== "cancelled" && order.orderMode === "home_delivery" && order.paymentDetails?.method === "atm_transfer" ? (
        <section
          className="order-conversation-form"
          aria-label="ATM 匯款回報"
          style={{ marginTop: 22, padding: "22px", borderRadius: 20 }}
        >
          <div>
            <p className="eyebrow dark">ATM TRANSFER REPORT</p>
            <h2>{order.paymentDetails.status === "paid" ? "ATM 已確認入帳" : "回報 ATM 匯款"}</h2>
          </div>

          {latestAtmClaim ? (
            <div
              style={{
                marginTop: 12,
                padding: "16px 18px",
                border: "1px solid #d9e5d7",
                borderRadius: 16,
                background: "#f5faf4",
              }}
            >
              <strong style={{ display: "block", marginBottom: 9 }}>
                {order.paymentDetails.status === "paid" ? "✓ 工作室已確認收到款項" : "✓ 已回報匯款，等待工作室核對入帳"}
              </strong>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                <span>末五碼：<b>{latestAtmClaim.accountLast5}</b></span>
                <span>回報金額：<b>{money(latestAtmClaim.amount)}</b></span>
                <span style={{ gridColumn: "1 / -1" }}>匯款時間：<b>{new Date(latestAtmClaim.transferredAt).toLocaleString("zh-TW")}</b></span>
              </div>
              {latestAtmClaim.receipt ? (
                <a href={latestAtmClaim.receipt.url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10 }}>
                  查看已上傳的匯款明細
                </a>
              ) : <p style={{ marginBottom: 0 }}>未上傳匯款明細圖片。</p>}
              {order.paymentDetails.status === "pending" ? <p style={{ marginBottom: 0 }}>若末五碼或時間填錯，可重新送出；系統會保留回報紀錄供工作室核對。</p> : null}
            </div>
          ) : (
            <div style={{ marginTop: 10, lineHeight: 1.75, color: "#5f493b" }}>
              <p>完成轉帳後，請回報帳號末五碼與匯款時間。應付金額由系統直接帶入，避免人工填錯。</p>
            </div>
          )}

          {order.paymentDetails.status === "pending" ? (
            <form onSubmit={submitAtmTransferClaim} style={{ marginTop: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
                <label style={{ display: "grid", gap: 7 }}>
                  <span>匯款帳號末五碼</span>
                  <input id="atm-transfer-last5" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} value={claimLast5} onChange={(event) => setClaimLast5(event.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="例如：82641" required disabled={claimSubmitting} />
                </label>
                <label style={{ display: "grid", gap: 7 }}>
                  <span>匯款日期與時間</span>
                  <input id="atm-transfer-time" type="datetime-local" value={claimTransferredAt} onChange={(event) => setClaimTransferredAt(event.target.value)} required disabled={claimSubmitting} />
                </label>
              </div>

              <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 14, background: "#f6f0e8" }}>
                本訂單核對金額：<b>{money(order.financialBreakdown.total)}</b>
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <strong style={{ fontSize: 15 }}>匯款明細圖片</strong>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      minHeight: 22,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "#f0e8df",
                      color: "#6d5748",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    選填
                  </span>
                </div>

                <input
                  ref={claimReceiptInput}
                  id="atm-transfer-receipt"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setClaimReceipt(event.target.files?.[0] || null)}
                  disabled={claimSubmitting}
                  style={{
                    position: "absolute",
                    width: 1,
                    height: 1,
                    padding: 0,
                    margin: -1,
                    overflow: "hidden",
                    clip: "rect(0, 0, 0, 0)",
                    whiteSpace: "nowrap",
                    border: 0,
                  }}
                />

                <label
                  htmlFor="atm-transfer-receipt"
                  aria-disabled={claimSubmitting}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    minHeight: 78,
                    padding: "14px 16px",
                    border: "1px dashed #cbb9a7",
                    borderRadius: 16,
                    background: claimReceipt ? "#f7f2eb" : "#fcfaf7",
                    cursor: claimSubmitting ? "not-allowed" : "pointer",
                    opacity: claimSubmitting ? 0.65 : 1,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: "grid",
                      placeItems: "center",
                      width: 40,
                      height: 40,
                      flex: "0 0 40px",
                      borderRadius: 999,
                      background: "#efe4d8",
                      color: "#4b3528",
                      fontSize: 24,
                      lineHeight: 1,
                    }}
                  >
                    +
                  </span>

                  <span style={{ display: "grid", gap: 3, minWidth: 0, flex: 1 }}>
                    <strong>{claimReceipt ? "已選擇匯款明細" : "選擇匯款明細圖片"}</strong>
                    <small style={{ color: "#7b6555", overflowWrap: "anywhere" }}>
                      {claimReceipt
                        ? `${claimReceipt.name} · ${Math.max(1, Math.round(claimReceipt.size / 1024)).toLocaleString("zh-TW")} KB`
                        : "JPEG / PNG / WebP · 5MB 以內"}
                    </small>
                  </span>

                  <span
                    style={{
                      flex: "0 0 auto",
                      padding: "8px 12px",
                      border: "1px solid #3e2d23",
                      borderRadius: 999,
                      background: "#fff",
                      color: "#3e2d23",
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    {claimReceipt ? "重新選擇" : "選擇圖片"}
                  </span>
                </label>

                <p style={{ margin: "8px 2px 0", color: "#7b6555", fontSize: 13, lineHeight: 1.65 }}>
                  上傳後系統會自動縮小尺寸並轉為 WebP 儲存；請先遮蔽帳戶餘額等非必要資訊。
                </p>

                {claimReceipt ? (
                  <button
                    type="button"
                    disabled={claimSubmitting}
                    onClick={() => {
                      setClaimReceipt(null);
                      if (claimReceiptInput.current) claimReceiptInput.current.value = "";
                    }}
                    style={{
                      marginTop: 8,
                      padding: 0,
                      border: 0,
                      background: "transparent",
                      color: "#735b4b",
                      fontSize: 13,
                      textDecoration: "underline",
                      cursor: claimSubmitting ? "not-allowed" : "pointer",
                    }}
                  >
                    移除已選圖片
                  </button>
                ) : null}
              </div>

              <label style={{ display: "flex", gap: 9, alignItems: "flex-start", marginTop: 14, lineHeight: 1.55 }}>
                <input type="checkbox" required disabled={claimSubmitting} />
                <span>我確認末五碼、匯款時間與本次回報資料正確。</span>
              </label>

              <p style={{ marginTop: 12 }}>
                送出後會通知 KD Coffee 工作室；工作室核對銀行實際入帳後，訂單才會標記為已付款。
              </p>
              {claimError ? <p className="form-error" role="alert">{claimError}</p> : null}
              {claimNotice ? <p className="form-success" role="status">{claimNotice}</p> : null}
              <button type="submit" disabled={claimSubmitting || claimLast5.length !== 5} style={{ marginTop: 8 }}>
                {claimSubmitting ? "送出中…" : latestAtmClaim ? "重新回報匯款資料" : "我已完成轉帳，送出回報"}
              </button>
            </form>
          ) : null}
        </section>
      ) : null}
      {order.creditReservation?.status === "released" ? <p className="customer-credit-returned" role="status">訂單取消，{money(order.creditReservation.amount)} 抵用金已返還。</p> : null}

      <OrderTimeline entries={timeline} audience="customer" />

      {access === "member" ? (
        <section className="order-conversation-form order-cancellation-panel" aria-label="取消訂單">
          <div>
            <p className="eyebrow dark">ORDER CANCELLATION</p>
            <h2>取消訂單</h2>
          </div>

          <p>{cancellationPresentation(order.status, order.orderMode).note}</p>

          {cancellationPresentation(order.status, order.orderMode).canSubmit ? (
            <form className="order-cancellation-form" onSubmit={cancelOrder}>
              <label htmlFor="order-cancellation-reason">取消原因</label>
              <select
                id="order-cancellation-reason"
                value={cancellationReason}
                onChange={(event) => {
                  setCancellationReason(event.target.value);
                  if (event.target.value !== "其他") setCancellationOtherReason("");
                }}
                disabled={cancelling}
                required
              >
                <option value="">請選擇取消原因</option>
                {MEMBER_CANCELLATION_REASONS.map((reason) => (
                  <option value={reason} key={reason}>{reason}</option>
                ))}
              </select>

              {cancellationReason === "其他" ? (
                <>
                  <label htmlFor="order-cancellation-other">其他取消原因</label>
                  <textarea
                    id="order-cancellation-other"
                    value={cancellationOtherReason}
                    onChange={(event) => setCancellationOtherReason(event.target.value)}
                    maxLength={190}
                    rows={3}
                    disabled={cancelling}
                    required
                  />
                </>
              ) : null}

              {cancellationError ? <p className="form-error" role="alert">{cancellationError}</p> : null}
              {cancellationNotice ? <p className="form-success" role="status">{cancellationNotice}</p> : null}

              <button className="order-cancellation-submit" type="submit" disabled={cancelling || !cancellationReason}>
                {cancelling ? "處理中…" : order.status === "shipment_created" ? "送出取消申請" : "確認取消訂單"}
              </button>
            </form>
          ) : (
            <>
              {cancellationError ? <p className="form-error" role="alert">{cancellationError}</p> : null}
              {cancellationNotice ? <p className="form-success" role="status">{cancellationNotice}</p> : null}
            </>
          )}
        </section>
      ) : (
        <section className="order-conversation-form" aria-label="取消訂單說明">
          <div>
            <p className="eyebrow dark">ORDER CANCELLATION</p>
            <h2>取消訂單</h2>
          </div>
          <p>訪客訂單目前不開放安全連結直接取消。如需取消，請使用下方訂單詢問聯繫 KD Coffee。</p>
        </section>
      )}

      <div className="order-conversation-thread" aria-live="polite">
        <div className="order-conversation-heading">
          <div><p className="eyebrow dark">ORDER CONVERSATION</p><h2>訂單詢問</h2></div>
          <span>{messages.length} 則</span>
        </div>
        {messages.length ? messages.map((entry) => (
          <article className={`order-message ${entry.authorType}`} key={entry.id}>
            <div><strong>{entry.authorType === "admin" ? "KD Coffee" : "您"}</strong><time>{new Date(entry.createdAt).toLocaleString("zh-TW")}</time></div>
            <p>{entry.message}</p>
          </article>
        )) : <p className="order-conversation-empty">目前還沒有留言。</p>}
      </div>

      <form className="order-conversation-form" onSubmit={submit}>
        <label htmlFor="order-question">詢問此訂單</label>
        <p>有關這張訂單的問題，可以直接留言給 KD Coffee。我們看到後會盡快回覆。</p>
        <textarea
          id="order-question"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={1000}
          rows={5}
          required
          disabled={submitting}
        />
        <small>{message.length} / 1000</small>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {notice ? <p className="form-success" role="status">{notice}</p> : null}
        <button type="submit" disabled={submitting}>{submitting ? "送出中…" : "送出詢問"}</button>
      </form>
      <Link className="order-conversation-back" href="/member">返回會員中心</Link>
    </section>
  );
}
