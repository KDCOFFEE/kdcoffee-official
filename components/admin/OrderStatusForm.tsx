"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SaveOrderStatusInput = {
  orderNumber: string;
  status: string;
  trackingNumber: string;
  refresh: () => void;
  setMessage: (message: string) => void;
  setSaving: (saving: boolean) => void;
  fetcher?: typeof fetch;
};

export async function runOrderStatusSave({
  orderNumber,
  status,
  trackingNumber,
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
      body: JSON.stringify({ status, trackingNumber }),
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
}: {
  orderNumber: string;
  initialStatus: string;
  initialTracking?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [trackingNumber, setTrackingNumber] = useState(initialTracking || "");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  function save() {
    return runOrderStatusSave({
      orderNumber,
      status,
      trackingNumber,
      refresh: router.refresh,
      setMessage,
      setSaving,
    });
  }

  return (
    <div className="admin-status-form">
      <label>
        訂單狀態
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="new_order">新訂單</option>
          <option value="confirmed">已確認</option>
          <option value="waiting_merchant_create_cod_shipment">待建立 7-ELEVEN 寄件單</option>
          <option value="waiting_studio_pickup_confirmation">待確認自取時間</option>
          <option value="shipment_created">寄件單已建立</option>
          <option value="shipped">已寄件</option>
          <option value="ready_for_pickup">等待取貨</option>
          <option value="completed">已完成</option>
          <option value="cancelled">已取消</option>
        </select>
      </label>
      <label>
        寄件／物流編號
        <input
          value={trackingNumber}
          onChange={(event) => setTrackingNumber(event.target.value)}
          placeholder="尚未建立時可留空"
        />
      </label>
      <button type="button" className="admin-primary-button" disabled={saving} onClick={save}>
        {saving ? "儲存中…" : "儲存變更"}
      </button>
      {message && <p className="admin-save-message">{message}</p>}
    </div>
  );
}
