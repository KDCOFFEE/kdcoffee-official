"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
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
  customerNotification?: {
    enabled: boolean;
    actionId: string;
    channels: ("line" | "email")[];
    photo?: File;
  };
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
  customerNotification,
  fetcher = fetch,
}: SaveOrderStatusInput) {
  setSaving(true);
  setMessage("");
  let statusSaved = false;

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
    statusSaved = true;
    if (customerNotification?.enabled) {
      const form = new FormData();
      form.set("actionId", customerNotification.actionId);
      customerNotification.channels.forEach((channel) => form.append("channels", channel));
      if (customerNotification.photo) form.set("photo", customerNotification.photo);
      const notificationResponse = await fetcher(
        `/api/admin/orders/${encodeURIComponent(orderNumber)}/customer-notifications`,
        { method: "POST", body: form },
      );
      const notificationResult = await notificationResponse.json().catch(() => ({}));
      if (!notificationResponse.ok) {
        setMessage(
          notificationResult.saved
            ? notificationResult.warning || "訂單狀態已更新，但顧客通知失敗。"
            : `訂單狀態已更新，但${notificationResult.error || "顧客通知處理失敗"}。`,
        );
        refresh();
        return notificationResult.saved === true;
      }
      setMessage(notificationResult.replayed ? "訂單已儲存；此顧客通知已處理。" : "訂單已儲存並通知客人。");
    } else {
      setMessage(result.warning ? `訂單已儲存。${result.warning}` : "已更新訂單狀態");
    }
    refresh();
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "請稍後再試";
    setMessage(statusSaved ? `訂單狀態已更新，但顧客通知未完成：${detail}` : detail);
    return false;
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
  customerNotificationCapability,
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
  customerNotificationCapability: {
    lineAvailable: boolean;
    emailAvailable: boolean;
  };
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [trackingNumber, setTrackingNumber] = useState(initialTracking || "");
  const [cancellationReason, setCancellationReason] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [notifyLine, setNotifyLine] = useState(customerNotificationCapability.lineAvailable);
  const [notifyEmail, setNotifyEmail] = useState(!customerNotificationCapability.lineAvailable && customerNotificationCapability.emailAvailable);
  const [notificationPhoto, setNotificationPhoto] = useState<File>();
  const notificationActionId = useRef(crypto.randomUUID());
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
  const notificationStatusSuggested =
    status === "confirmed" ||
    status === "ready_for_pickup" ||
    status === "completed" ||
    (orderMode === "711_cod" && (status === "shipment_created" || status === "shipped"));
  const hasCustomerNotificationChannel =
    customerNotificationCapability.lineAvailable || customerNotificationCapability.emailAvailable;
  const selectedNotificationChannels = [
    ...(notifyLine && customerNotificationCapability.lineAvailable ? ["line" as const] : []),
    ...(notifyEmail && customerNotificationCapability.emailAvailable ? ["email" as const] : []),
  ];

  async function save() {
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

    const completed = await runOrderStatusSave({
      orderNumber,
      status,
      trackingNumber,
      cancellationReason: cancellationReason.trim(),
      refresh: router.refresh,
      setMessage,
      setSaving,
      customerNotification: {
        enabled: notifyCustomer && notificationStatusSuggested,
        actionId: notificationActionId.current,
        channels: selectedNotificationChannels,
        photo: notificationPhoto,
      },
    });
    if (completed) {
      notificationActionId.current = crypto.randomUUID();
      setNotificationPhoto(undefined);
      setNotifyCustomer(false);
    }
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
      <section className="admin-customer-notification">
        <div>
          <strong>顧客通知</strong>
          <p>訂單狀態會先儲存；只有明確勾選時才通知客人。</p>
        </div>
        {!hasCustomerNotificationChannel ? (
          <p className="admin-notification-unavailable">此訂單沒有可用的顧客通知方式。</p>
        ) : !notificationStatusSuggested ? (
          <p className="admin-notification-unavailable">目前選擇的狀態不是建議通知節點。</p>
        ) : (
          <>
            <label className="admin-notify-toggle">
              <input
                type="checkbox"
                checked={notifyCustomer}
                onChange={(event) => setNotifyCustomer(event.target.checked)}
              />
              同時通知客人
            </label>
            {notifyCustomer ? (
              <div className="admin-notification-options">
                <span>通知方式</span>
                {customerNotificationCapability.lineAvailable ? (
                  <label><input type="checkbox" checked={notifyLine} onChange={(event) => setNotifyLine(event.target.checked)} />LINE</label>
                ) : null}
                {customerNotificationCapability.emailAvailable ? (
                  <label><input type="checkbox" checked={notifyEmail} onChange={(event) => setNotifyEmail(event.target.checked)} />Email</label>
                ) : null}
                <label className="admin-notification-photo">
                  準備完成／包裝照片 <small>選填，JPEG／PNG／WebP，最大 5MB</small>
                  <input
                    key={notificationActionId.current}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    onChange={(event) => setNotificationPhoto(event.target.files?.[0])}
                  />
                </label>
              </div>
            ) : null}
          </>
        )}
      </section>
      <button type="button" className="admin-primary-button" disabled={saving || !statusCanBeSaved || (notifyCustomer && selectedNotificationChannels.length === 0)} onClick={save}>
        {saving ? "儲存中…" : "儲存變更"}
      </button>
      {message && <p className="admin-save-message">{message}</p>}
    </div>
  );
}
