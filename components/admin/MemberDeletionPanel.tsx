"use client";

import { FormEvent, useState } from "react";

export default function MemberDeletionPanel({ memberId, memberLabel, totalMembers }: { memberId?: string; memberLabel?: string; totalMembers?: number }) {
  const [open, setOpen] = useState(false);
  const [password1, setPassword1] = useState("");
  const [password2, setPassword2] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mode = memberId ? "single" : "all";

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (password1 !== password2) { setError("兩次輸入的管理員密碼不一致。"); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/members/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, memberId, password1, password2, confirmation }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "刪除失敗");
      window.location.assign("/admin/members");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "刪除失敗"); setBusy(false); }
  }

  return <section className={`member-delete-panel ${mode === "all" ? "is-all" : ""}`}>
    <div><strong>{mode === "all" ? "清除全部測試會員" : "永久刪除此會員"}</strong><p>{mode === "all" ? `目前共 ${totalMembers ?? 0} 位會員。這會清除會員帳號、身份、推薦、抵用金與定期購測試資料；既有訂單紀錄不會被刪除。` : `刪除 ${memberLabel || "此會員"} 的會員帳號與會員系統關聯資料；既有訂單紀錄不會被刪除。`}</p></div>
    {!open ? <button type="button" className="member-delete-open" onClick={() => setOpen(true)}>{mode === "all" ? "開啟全部清除" : "刪除會員"}</button> : <form onSubmit={submit} className="member-delete-form"><label>管理員密碼<input type="password" autoComplete="current-password" value={password1} onChange={(e) => setPassword1(e.target.value)} required /></label><label>再次輸入管理員密碼<input type="password" autoComplete="current-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required /></label>{mode === "all" ? <label>確認文字：刪除全部會員<input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required /></label> : null}{error ? <p role="alert" className="form-error">{error}</p> : null}<div><button type="button" onClick={() => { setOpen(false); setError(""); }}>取消</button><button type="submit" className="member-delete-confirm" disabled={busy}>{busy ? "處理中…" : mode === "all" ? "永久刪除全部會員" : "永久刪除此會員"}</button></div></form>}
  </section>;
}
