"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  fulfillmentOrderStatuses,
  MAX_CANCELLATION_REASON_LENGTH,
  orderStatuses,
  orderStatusLabel,
  type OrderStatus,
} from "@/lib/orderInventoryPolicy";
import {
  assessOrderStatusProgression,
  orderFlowDescription,
} from "@/lib/orderStatusPolicy";

type SaveOrderStatusInput = {
  orderNumber: string;
  status: string;
  trackingNumber: string;
  cancellationReason?: string;
  refresh: () => void;
  setMessage: (message: string) => void;
  setSaving: (saving: boolean) => void;
  fetcher?: typeof fetch;
};

export async function runOrderStatusSave({
  orderNumber,
  status,
  trackingNumber,
  cancellationReason = "",
  refresh,
  setMessage,
  setSaving,
  fetcher = fetch,
}: SaveOrderStatusInput) {
  setSaving(true);
  setMessage("");

  try {
    const response = await fetcher(`/api/admin/orders/${encodeURIComponent(orderNumber)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, trackingNumber, cancellationReason }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || "更新失敗");
    }
    setMessage(result.warning ? `訂單已儲存。${result.warning}` : "已更新訂單狀態");
    refresh();
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "更新失敗，請稍後再試");
  } finally {
    setSaving(false);
  }
}

export default function OrderStatusForm({
  orderNumber,
  initialStatus,
  initialTracking,
  orderMode,
  reactivationBlocked = false,
  inventoryReturned = false,
  inventoryFulfillmentBlocked = false,
  inventoryGuardMessage = "",
  cancellationAllowed = true,
  cancellationBlockedMessage = "",
}: {
  orderNumber: string;
  initialStatus: string;
  initialTracking?: string;
  orderMode: string;
  reactivationBlocked?: boolean;
  inventoryReturned?: boolean;
  inventoryFulfillmentBlocked?: boolean;
  inventoryGuardMessage?: string;
  cancellationAllowed?: boolean;
  cancellationBlockedMessage?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [trackingNumber, setTrackingNumber] = useState(initialTracking || "");
  const [cancellationReason, setCancellationReason] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const statusIsKnown = (orderStatuses as readonly string[]).includes(status);
  const statusTransitionAllowed =
    statusIsKnown &&
    (status === "cancelled"
      ? cancellationAllowed
      : assessOrderStatusProgression(
          { status: initialStatus, orderMode },
          status as OrderStatus,
        ).allowed);
  const statusCanBeSaved =
    statusTransitionAllowed &&
    (!inventoryFulfillmentBlocked || status === "cancelled") &&
    (status !== "cancelled" ||
      (cancellationAllowed && cancellationReason.trim().length > 0));

  function save() {
    if (status === "cancelled") {
      const reason = cancellationReason.trim();
      if (!cancellationAllowed) {
        setMessage(cancellationBlockedMessage || "此訂單目前不能使用一般取消操作。");
        return;
      }
      if (!reason) {
        setMessage("請填寫取消原因。");
        return;
      }
      if (reason.length > MAX_CANCELLATION_REASON_LENGTH) {
        setMessage(`取消原因最多 ${MAX_CANCELLATION_REASON_LENGTH} 個字。`);
        return;
      }
      if (!window.confirm("取消訂單會將尚未出貨的已扣庫存商品回補。確定要取消此訂單嗎？")) {
        return;
      }
    }

    return runOrderStatusSave({
      orderNumber,
      status,
      trackingNumber,
      cancellationReason: cancellationReason.trim(),
      refresh: router.refresh,
      setMessage,
      setSaving,
    });
  }

  return (
    <div className="admin-status-form">
      <p className="admin-order-flow-hint">
        <strong>本訂單流程</strong>
        <span>{orderFlowDescription(orderMode)}</span>
      </p>
      <label>
        訂單狀態
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          {!statusIsKnown ? (
            <option value={status} disabled>{orderStatusLabel(status)}</option>
          ) : null}
          {fulfillmentOrderStatuses.map((optionStatus) => (
            <option
              value={optionStatus}
              disabled={
                reactivationBlocked ||
                inventoryFulfillmentBlocked ||
                !assessOrderStatusProgression(
                  { status: initialStatus, orderMode },
                  optionStatus,
                ).allowed
              }
              key={optionStatus}
            >
              {orderStatusLabel(optionStatus)}
            </option>
          ))}
          <option value="cancelled" disabled={!cancellationAllowed}>已取消</option>
        </select>
      </label>
      {reactivationBlocked ? (
        <p className="admin-save-message">
          {inventoryReturned
            ? "此訂單已取消且庫存已返還，無法直接恢復。"
            : "此訂單已取消，庫存狀態無法安全確認，無法直接恢復。"}
        </p>
      ) : null}
      {inventoryFulfillmentBlocked ? (
        <p className="admin-save-message admin-inventory-block-message">
          {inventoryGuardMessage || "庫存交易狀態尚未確認，一般履約狀態已停用。"}
        </p>
      ) : null}
      {!cancellationAllowed && !reactivationBlocked ? (
        <p className="admin-save-message admin-cancellation-block-message">
          {cancellationBlockedMessage || "此訂單目前不能使用一般取消操作。"}
        </p>
      ) : null}
      {status === "cancelled" && initialStatus !== "cancelled" ? (
        <label>
          取消原因
          <textarea
            value={cancellationReason}
            onChange={(event) => setCancellationReason(event.target.value)}
            maxLength={MAX_CANCELLATION_REASON_LENGTH}
            rows={3}
            placeholder="請簡短說明取消原因"
            required
          />
          <small>{cancellationReason.trim().length} / {MAX_CANCELLATION_REASON_LENGTH} 字</small>
        </label>
      ) : null}
      {orderMode === "711_cod" ? (
        <label>
          寄件／物流編號
          <input
            value={trackingNumber}
            onChange={(event) => setTrackingNumber(event.target.value)}
            placeholder="尚未建立時可留空"
          />
        </label>
      ) : null}
      <button type="button" className="admin-primary-button" disabled={saving || !statusCanBeSaved} onClick={save}>
        {saving ? "儲存中…" : "儲存變更"}
      </button>
      {message && <p className="admin-save-message">{message}</p>}
    </div>
  );
}
