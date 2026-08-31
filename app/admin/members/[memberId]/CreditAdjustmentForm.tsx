"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const reasons = ["客訴補償", "活動贈送", "人工修正", "Phase I.4A Round 2 測試", "其他"] as const;

export default function CreditAdjustmentForm({ memberId, currentBalance }: { memberId: string; currentBalance: number }) {
  const router = useRouter();
  const idempotencyKey = useRef("");
  const [direction, setDirection] = useState<"grant" | "deduct">("grant");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<(typeof reasons)[number]>("客訴補償");
  const [customReason, setCustomReason] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const numericAmount = /^\d+$/.test(amount) ? Number(amount) : 0;
  const projected = direction === "grant" ? currentBalance + numericAmount : currentBalance - numericAmount;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!confirmed) return setMessage({ kind: "error", text: "請先勾選確認本次調整。" });
    if (!Number.isSafeInteger(numericAmount) || numericAmount < 1) return setMessage({ kind: "error", text: "請輸入大於 0 的整數金額。" });
    const finalReason = reason === "其他" ? customReason.trim() : reason;
    if (finalReason.length < 2) return setMessage({ kind: "error", text: "請填寫調整原因。" });
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/members/${encodeURIComponent(memberId)}/credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction, amount: numericAmount, reason: finalReason, note, confirmation: "CONFIRM_CREDIT_ADJUSTMENT", idempotencyKey: idempotencyKey.current }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "抵用金調整失敗");
      setMessage({ kind: "success", text: `調整完成，目前可用抵用金為 NT$${Number(result.balanceAfter).toLocaleString("zh-TW")}。` });
      setAmount(""); setNote(""); setConfirmed(false); idempotencyKey.current = "";
      router.refresh();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "抵用金調整失敗" });
    } finally {
      setBusy(false);
    }
  }

  return <form className="member-credit-adjustment" onSubmit={submit}>
    <div className="member-credit-current"><small>目前可用</small><strong>NT$ {currentBalance.toLocaleString("zh-TW")}</strong></div>
    <fieldset><legend>類型</legend><label><input type="radio" name="direction" checked={direction === "grant"} onChange={() => setDirection("grant")} /> 新增抵用金</label><label><input type="radio" name="direction" checked={direction === "deduct"} onChange={() => setDirection("deduct")} /> 扣除抵用金</label></fieldset>
    <label>金額<span className="member-credit-input"><b>NT$</b><input inputMode="numeric" pattern="[0-9]*" value={amount} onChange={(event) => setAmount(event.target.value.trim())} placeholder="100" required /></span></label>
    <label>原因<select value={reason} onChange={(event) => setReason(event.target.value as (typeof reasons)[number])}>{reasons.map((item) => <option key={item}>{item}</option>)}</select></label>
    {reason === "其他" ? <label>其他原因<input value={customReason} onChange={(event) => setCustomReason(event.target.value)} maxLength={80} required /></label> : null}
    <label>內部備註（選填）<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} rows={3} /></label>
    <div className="member-credit-impact"><span>目前餘額 <b>NT$ {currentBalance.toLocaleString("zh-TW")}</b></span><span>本次{direction === "grant" ? "新增" : "扣除"} <b>{direction === "grant" ? "+" : "−"} NT$ {numericAmount.toLocaleString("zh-TW")}</b></span><span>調整後餘額 <b className={projected < 0 ? "is-danger" : ""}>NT$ {projected.toLocaleString("zh-TW")}</b></span></div>
    {direction === "deduct" && projected < 0 ? <p className="member-credit-warning">扣除金額不可超過目前可用抵用金。</p> : null}
    <label className="member-credit-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> 我已核對會員、類型、金額與原因，確認送出本次調整。</label>
    <button className="admin-primary-button" disabled={busy || !confirmed || numericAmount < 1 || projected < 0}>{busy ? "處理中…" : "確認調整抵用金"}</button>
    {message ? <p className={`member-credit-message ${message.kind}`}>{message.text}</p> : null}
  </form>;
}
