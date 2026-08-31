"use client";

import { FormEvent, useEffect, useState } from "react";

import type { LogisticsSettings } from "@/lib/fulfillmentTypes";

export default function LogisticsSettingsForm({ initial }: { initial: LogisticsSettings }) {
  const [settings, setSettings] = useState(initial);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [gmailReady, setGmailReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  useEffect(() => { fetch("/api/admin/fulfillment/gmail-sync", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((result) => setGmailReady(Boolean(result?.ready))).catch(() => undefined); }, []);
  async function syncGmail() {
    setSyncing(true); setMessage("");
    try { const response = await fetch("/api/admin/fulfillment/gmail-sync", { method: "POST" }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Gmail 同步失敗"); setMessage(`已掃描 ${result.scanned ?? 0} 封信，更新 ${result.processed ?? 0} 筆，${result.reviewed ?? 0} 筆待人工確認。`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Gmail 同步失敗"); }
    finally { setSyncing(false); }
  }
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
      <label>逾期處理<select value="manual_review" disabled><option value="manual_review">標記疑似未取貨，等待人工確認</option></select><small>沒有可信未取貨通知時，系統不會自動停止定期購。</small></label>
    </div>
    <label className="fulfillment-switch"><input type="checkbox" checked={settings.automaticTrackingEnabled} onChange={(event)=>setSettings({...settings,automaticTrackingEnabled:event.target.checked})} /><span>啟用 7-ELEVEN 自動追蹤</span></label>
    <fieldset><legend>追蹤通知類型</legend><div className="fulfillment-check-grid">
      {([['orderCreated','訂單成立'],['shipped','已交寄'],['arrived','已到店'],['completed','成功取貨']] as const).map(([key,label])=><label key={key}><input type="checkbox" checked={tracked[key]} onChange={(event)=>setSettings({...settings,trackedEvents:{...tracked,[key]:event.target.checked}})} />{label}</label>)}
    </div></fieldset>
    <div className="gmail-connection-box"><span>Gmail 連線狀態</span><strong>{settings.gmailConnection.status === "connected" ? "已連接" : settings.gmailConnection.status === "error" ? "連線異常" : "未連接"}</strong><p>{gmailReady ? "只會掃描核准寄件者、設定日期範圍與選用 Label；未知格式一律進人工確認。" : "尚未設定正式 Gmail OAuth；系統不會假裝連線成功，也不會讀取真實信箱。"}</p><button type="button" disabled={!gmailReady || syncing || !settings.automaticTrackingEnabled} onClick={syncGmail}>{syncing ? "同步中…" : gmailReady ? "立即安全同步" : "連接 Gmail（待 OAuth 設定）"}</button></div>
    <div className="fulfillment-form-actions"><button type="submit" disabled={saving}>{saving ? "儲存中…" : "儲存物流設定"}</button>{message ? <span role="status">{message}</span> : null}</div>
  </form>;
}
