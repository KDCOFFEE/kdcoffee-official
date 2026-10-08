"use client";

import { useState } from "react";
import { isPointNameAlias, pointNameAliasValue } from "@/lib/pointDisplayName";
import { MEMBER_CENTER_COPY_CATALOG, creditDisplayName, memberCopyUsesIndependentCreditName, memberCopyValidationError, resolveMemberCopy, type MemberCopyOverrides } from "@/lib/memberCenterCopy";
import styles from "./MemberCenterCopyManager.module.css";

const groups: Record<string, string> = { dashboard: "會員首頁", kdPoints: "KD 點", storeCredit: "抵用金", navigation: "導覽", referral: "推薦回饋／組織圖與分享", selfPurchase: "自購回饋", rewards: "零售／待入帳回饋", qualification: "資格／等待", subscription: "定期配送", orders: "訂單相關說明", hints: "提示文字", emptyStates: "空狀態", buttons: "按鈕", account: "帳戶資料", login: "會員登入與密碼" };
function inGroup(entry: (typeof MEMBER_CENTER_COPY_CATALOG)[number], group: string) {
  if (entry.group === group) return true;
  if (group === "kdPoints") return /KD\s?點|\{(?:pointName|kdPoints|currentPoints|requiredPoints|remainingPoints)\}/u.test(entry.defaultText);
  if (group === "storeCredit") return /抵用金|折抵|\{creditName\}/u.test(entry.defaultText);
  if (group === "selfPurchase") return /自己.*消費|自購/u.test(entry.defaultText);
  if (group === "orders") return /訂單|取貨|出貨/u.test(entry.defaultText);
  if (group === "hints") return /\.(?:hint|tooltip)\./u.test(entry.key);
  if (group === "emptyStates") return entry.key.includes(".emptyState.");
  if (group === "buttons") return entry.key.includes(".button.");
  return false;
}

export default function MemberCenterCopyManager({ initialRevision, initialOverrides, initialPointSetting = { revision: 0, pointDisplayName: "KD點" } }: { initialRevision: number; initialOverrides: MemberCopyOverrides; initialPointSetting?: { revision: number; pointDisplayName: string } }) {
  const copyOnly = Object.fromEntries(Object.entries(initialOverrides).filter(([key]) => !isPointNameAlias(key)));
  const [overrides, setOverrides] = useState(copyOnly);
  const [pointSetting, setPointSetting] = useState(initialPointSetting);
  const [pointName, setPointName] = useState(initialPointSetting.pointDisplayName);
  const [revision, setRevision] = useState(initialRevision);
  const [saved, setSaved] = useState(JSON.stringify(copyOnly));
  const [group, setGroup] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const copyDirty = JSON.stringify(overrides) !== saved;
  const pointDirty = pointName !== pointSetting.pointDisplayName;
  const dirty = copyDirty || pointDirty;
  const entries = MEMBER_CENTER_COPY_CATALOG.filter((entry) => inGroup(entry, group) && (!query || `${entry.purpose} ${entry.defaultText}`.includes(query)));
  const invalid = Boolean(memberCopyValidationError("member.rewards.kdPoints.title", pointName)) || Object.entries(overrides).some(([key, value]) => Boolean(memberCopyValidationError(key, value)));
  async function save() {
    setBusy(true); setFeedback("");
    try {
      if (pointDirty) {
        const response = await fetch("/api/admin/point-display-name", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: pointSetting.revision, pointDisplayName: pointName }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "無法儲存點數名稱。");
        setPointSetting(result); setPointName(result.pointDisplayName);
        setFeedback(copyDirty ? "統一點數名稱已儲存；其他文字尚未儲存，請再次按儲存顯示文字。" : "統一點數名稱已儲存。其他管理位置重新載入後會顯示同一名稱。");
        if (typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel("kd-member-display-copy"); channel.postMessage("updated"); channel.close(); }
        return;
      }
      const response = await fetch("/api/admin/member-center-copy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: revision, overrides }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "無法儲存顯示文字。" );
      setRevision(result.revision); const next = Object.fromEntries(Object.entries(result.overrides as MemberCopyOverrides).filter(([key]) => !isPointNameAlias(key))); setOverrides(next); setSaved(JSON.stringify(next));
      setFeedback("顯示文字已儲存。會員中心重新開啟或回到視窗時會顯示更新內容。" );
      if (typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel("kd-member-display-copy"); channel.postMessage("updated"); channel.close(); }
    } catch (error) { setFeedback(error instanceof Error ? error.message : "儲存失敗。" ); }
    finally { setBusy(false); }
  }
  function edit(key: string, value?: string) {
    if (isPointNameAlias(key)) { setPointName(value ?? "KD點"); return; }
    setOverrides((current) => { const next = { ...current }; if (value === undefined) delete next[key]; else next[key] = value; return next; });
  }
  return <div className={styles.manager}>
    <header className={styles.header}><div><h1>會員中心顯示文字與說明</h1><p>管理會員看到的名稱、說明、提示與按鈕。動態數字與日期由原系統提供。</p></div><button type="button" disabled={busy || !dirty || invalid} onClick={() => void save()}>{busy ? "儲存中…" : "儲存顯示文字"}</button></header>
    <p role="status">{feedback || (dirty ? "有尚未儲存的變更" : `已載入版本 ${revision}`)}</p>
    <div className={styles.filters}><label>區塊<select value={group} onChange={(event) => setGroup(event.target.value)}>{Object.entries(groups).map(([key, label]) => <option key={key} value={key}>{key === "storeCredit" ? creditDisplayName(overrides) : label}</option>)}</select></label><label>搜尋文字<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：入帳、查看、尚無" /></label></div>
    <p>本區共 {entries.length} 個欄位。空狀態、按鈕與說明依所屬功能歸類。請保留列出的動態變數；只支援純文字與換行。</p>
    <div className={styles.fields}>{entries.map((entry) => {
      const alias = isPointNameAlias(entry.key);
      const value = alias ? pointName : overrides[entry.key] ?? entry.defaultText;
      const error = memberCopyValidationError(entry.key, value);
      const independent = Object.hasOwn(overrides, entry.key) && memberCopyUsesIndependentCreditName(entry.key, value);
      const samples = Object.fromEntries(Object.keys(entry.tokens).map((token) => [token, `[${entry.tokens[token]}]`]));
      return <section key={entry.key} className={styles.field}>
        <label htmlFor={entry.key}>{entry.purpose}</label>
        <small>預設文字：{entry.defaultText}</small>
        {entry.multiline ? <textarea id={entry.key} value={value} maxLength={alias ? 24 : 4000} rows={4} disabled={busy} aria-invalid={Boolean(error)} aria-describedby={`${entry.key}-help`} onChange={(event) => edit(entry.key, event.target.value)} /> : <input id={entry.key} value={value} maxLength={alias ? 24 : 4000} disabled={busy} aria-invalid={Boolean(error)} aria-describedby={`${entry.key}-help`} onChange={(event) => edit(entry.key, event.target.value)} />}
        <div id={`${entry.key}-help`} className={styles.tokens}>{Object.keys(entry.tokens).length ? Object.entries(entry.tokens).map(([token, description]) => <span key={token}><code>{`{${token}}`}</code> {description}</span>) : <span>{alias ? "此欄位編輯統一點數名稱；與會員制度設定共用。空格形式只用於顯示預覽。" : "此欄位沒有動態變數。"}</span>}</div>
        {error ? <p role="alert" className={styles.error}>{error}</p> : <p className={styles.preview}>預覽：{alias ? pointNameAliasValue(entry.key, pointName) : resolveMemberCopy({ ...overrides, [entry.key]: value }, entry.key, samples, entry.defaultText)}</p>}
        {independent && <div role="status"><strong>此文案尚未引用統一名稱</strong><p>原文（持續保留）：{value}</p><p>使用 &#123;creditName&#125; 後的預設模板預覽：{resolveMemberCopy({ ...overrides, [entry.key]: entry.defaultText }, entry.key, samples)}</p><small>統一名稱目前為「{creditDisplayName(overrides)}」。請自行編輯；儲存前不會變更原文。</small></div>}
        <button type="button" disabled={busy || (alias ? pointName === "KD點" : !Object.hasOwn(overrides, entry.key))} onClick={() => edit(entry.key)}>恢復預設</button>
      </section>;
    })}</div>
  </div>;
}
