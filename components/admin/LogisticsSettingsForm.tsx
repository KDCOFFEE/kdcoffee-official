"use client";

import { FormEvent, useState } from "react";

import type { LogisticsSettings } from "@/lib/fulfillmentTypes";

export default function LogisticsSettingsForm({ initial }: { initial: LogisticsSettings }) {
  const [settings, setSettings] = useState(initial);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/fulfillment/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...settings, expectedRevision: settings.revision }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "儲存失敗");
      setSettings(result.settings); setMessage("物流設定已儲存");
    } catch (error) { setMessage(error instanceof Error ? error.message : "儲存失敗"); }
    finally { setSaving(false); }
  }
  const tracked = settings.trackedEvents;
  return <form className="fulfillment-settings-form" onSubmit={submit}>
    <div className="fulfillment-settings-grid">
      <label>物流通知信箱<input type="email" value={settings.notificationEmail} onChange={(event)=>setSettings({...settings,notificationEmail:event.target.value})} required /></label>
      <label>7-ELEVEN 取貨期限（天）<input type="number" min={1} max={30} value={settings.pickupDeadlineDays} onChange={(event)=>setSettings({...settings,pickupDeadlineDays:Number(event.target.value)})} required /></label>
      <label>逾期處理<select value={settings.expiryPolicy} onChange={(event)=>setSettings({...settings,expiryPolicy:event.target.value as LogisticsSettings["expiryPolicy"]})}><option value="manual_review">標記需要人工確認</option><option value="confirm_uncollected">直接判定未取貨</option></select></label>
    </div>
    <label className="fulfillment-switch"><input type="checkbox" checked={settings.automaticTrackingEnabled} onChange={(event)=>setSettings({...settings,automaticTrackingEnabled:event.target.checked})} /><span>啟用 7-ELEVEN 自動追蹤</span></label>
    <fieldset><legend>追蹤通知類型</legend><div className="fulfillment-check-grid">
      {([['orderCreated','訂單成立'],['shipped','已交寄'],['arrived','已到店'],['completed','成功取貨']] as const).map(([key,label])=><label key={key}><input type="checkbox" checked={tracked[key]} onChange={(event)=>setSettings({...settings,trackedEvents:{...tracked,[key]:event.target.checked}})} />{label}</label>)}
    </div></fieldset>
    <div className="gmail-connection-box"><span>Gmail 連線狀態</span><strong>{settings.gmailConnection.status === "connected" ? "已連接" : settings.gmailConnection.status === "error" ? "連線異常" : "未連接"}</strong><p>尚未設定正式 Gmail OAuth；系統不會假裝連線成功，也不會讀取真實信箱。</p><button type="button" disabled>連接 Gmail（待 OAuth 設定）</button></div>
    <div className="fulfillment-form-actions"><button type="submit" disabled={saving}>{saving ? "儲存中…" : "儲存物流設定"}</button>{message ? <span role="status">{message}</span> : null}</div>
  </form>;
}
