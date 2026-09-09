"use client";

import { FormEvent, useState } from "react";

type MemberAccountStatus = "active" | "disabled" | "possible-duplicate" | "merged-tombstone";

async function submitMemberAction(body: Record<string, string>) {
  const response = await fetch("/api/admin/members/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "會員操作失敗");
}

function AllMemberClearPanel({ totalMembers }: { totalMembers?: number }) {
  const [open, setOpen] = useState(false);
  const [password1, setPassword1] = useState("");
  const [password2, setPassword2] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (password1 !== password2) { setError("兩次輸入的管理員密碼不一致。"); return; }
    setBusy(true);
    try {
      await submitMemberAction({ mode: "all", password1, password2, confirmation });
      window.location.assign("/admin/members");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "刪除失敗"); setBusy(false); }
  }

  return <section className="member-delete-panel is-all">
    <div><strong>清除全部測試會員</strong><p>目前共 {totalMembers ?? 0} 位會員。這會清除會員帳號、身份、推薦、抵用金與定期購測試資料；既有訂單紀錄不會被刪除。</p></div>
    {!open ? <button type="button" className="member-delete-open" onClick={() => setOpen(true)}>開啟全部清除</button> : <form onSubmit={submit} className="member-delete-form"><label>管理員密碼<input type="password" autoComplete="current-password" value={password1} onChange={(e) => setPassword1(e.target.value)} required /></label><label>再次輸入管理員密碼<input type="password" autoComplete="current-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required /></label><label>確認文字：刪除全部會員<input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required /></label>{error ? <p role="alert" className="form-error">{error}</p> : null}<div><button type="button" onClick={() => { setOpen(false); setError(""); }}>取消</button><button type="submit" className="member-delete-confirm" disabled={busy}>{busy ? "處理中…" : "永久刪除全部會員"}</button></div></form>}
  </section>;
}

function SingleMemberLifecyclePanel({ memberId, memberLabel, memberStatus }: { memberId: string; memberLabel?: string; memberStatus: MemberAccountStatus }) {
  const [lifecycleOpen, setLifecycleOpen] = useState(false);
  const [lifecyclePassword, setLifecyclePassword] = useState("");
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPassword1, setResetPassword1] = useState("");
  const [resetPassword2, setResetPassword2] = useState("");
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");
  const lifecycleAction = memberStatus === "disabled" ? "reactivate" : "disable";
  const lifecycleLabel = memberStatus === "disabled" ? "重新啟用會員" : "停用會員";
  const canChangeLifecycle = memberStatus === "active" || memberStatus === "disabled";

  async function submitLifecycle(event: FormEvent) {
    event.preventDefault(); setLifecycleError(""); setLifecycleBusy(true);
    try {
      await submitMemberAction({ mode: "single", action: lifecycleAction, memberId, password1: lifecyclePassword });
      window.location.reload();
    } catch (caught) { setLifecycleError(caught instanceof Error ? caught.message : "會員操作失敗"); setLifecycleBusy(false); }
  }

  async function submitFullReset(event: FormEvent) {
    event.preventDefault(); setResetError("");
    if (resetPassword1 !== resetPassword2) { setResetError("兩次輸入的管理員密碼不一致。"); return; }
    setResetBusy(true);
    try {
      await submitMemberAction({ mode: "single", action: "full-reset", memberId, password1: resetPassword1, password2: resetPassword2, confirmation: resetConfirmation });
      window.location.assign("/admin/members");
    } catch (caught) { setResetError(caught instanceof Error ? caught.message : "完整重置失敗"); setResetBusy(false); }
  }

  return <>
    <section className="admin-panel member-detail-section">
      <div className="admin-panel-head"><div><p className="eyebrow dark">ACCOUNT ACCESS</p><h2>{canChangeLifecycle ? lifecycleLabel : "會員存取狀態"}</h2></div></div>
      <p>停用後會員無法登入，但會員編號、Email／LINE 身份、推薦、點數、訂閱與歷史資料都會保留；未來重新啟用仍是同一位會員。</p>
      {canChangeLifecycle ? (!lifecycleOpen ? <button type="button" className={`member-lifecycle-action member-lifecycle-action--${lifecycleAction}`} onClick={() => setLifecycleOpen(true)}>{lifecycleLabel}</button> : <form onSubmit={submitLifecycle} className="member-delete-form"><label>管理員密碼<input type="password" autoComplete="current-password" value={lifecyclePassword} onChange={(event) => setLifecyclePassword(event.target.value)} required /></label>{lifecycleError ? <p role="alert" className="form-error">{lifecycleError}</p> : null}<div><button type="button" onClick={() => { setLifecycleOpen(false); setLifecycleError(""); }}>取消</button><button type="submit" className={`member-lifecycle-action member-lifecycle-action--${lifecycleAction}`} disabled={lifecycleBusy}>{lifecycleBusy ? "處理中…" : lifecycleLabel}</button></div></form>) : <p>這位會員目前的身份狀態無法使用一般停用／重新啟用操作。</p>}
    </section>
    <section className="member-delete-panel">
      <div><strong>Owner 完整重置會員身分</strong><p>完整重置會清除這位會員的登入身份與會員／推薦關聯資料。同一 Email 或 LINE 未來再次加入時會被視為全新會員，可能重新取得首次推薦資格。既有訂單歷史不會刪除。</p><small>{memberLabel || "此會員"}</small></div>
      {!resetOpen ? <button type="button" className="member-delete-open" onClick={() => setResetOpen(true)}>開啟完整重置</button> : <form onSubmit={submitFullReset} className="member-delete-form"><label>管理員密碼<input type="password" autoComplete="current-password" value={resetPassword1} onChange={(event) => setResetPassword1(event.target.value)} required /></label><label>再次輸入管理員密碼<input type="password" autoComplete="current-password" value={resetPassword2} onChange={(event) => setResetPassword2(event.target.value)} required /></label><label>確認文字：完整重置會員身分<input value={resetConfirmation} onChange={(event) => setResetConfirmation(event.target.value)} required /></label>{resetError ? <p role="alert" className="form-error">{resetError}</p> : null}<div><button type="button" onClick={() => { setResetOpen(false); setResetError(""); }}>取消</button><button type="submit" className="member-delete-confirm" disabled={resetBusy}>{resetBusy ? "處理中…" : "永久完整重置會員身分"}</button></div></form>}
    </section>
  </>;
}

export default function MemberDeletionPanel({ memberId, memberLabel, memberStatus, totalMembers }: { memberId?: string; memberLabel?: string; memberStatus?: MemberAccountStatus; totalMembers?: number }) {
  if (memberId && memberStatus) return <SingleMemberLifecyclePanel memberId={memberId} memberLabel={memberLabel} memberStatus={memberStatus} />;
  return <AllMemberClearPanel totalMembers={totalMembers} />;
}
