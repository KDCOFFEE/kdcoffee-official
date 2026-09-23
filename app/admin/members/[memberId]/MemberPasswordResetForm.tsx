"use client";

import { FormEvent, useState } from "react";

type Message = { kind: "success" | "error"; text: string } | null;

export default function MemberPasswordResetForm({ memberId }: { memberId: string }) {
  const [adminPassword, setAdminPassword] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (password.length < 8) {
      setMessage({ kind: "error", text: "會員新密碼至少需要 8 個字元。" });
      return;
    }
    if (password !== passwordConfirmation) {
      setMessage({ kind: "error", text: "兩次輸入的會員新密碼不一致。" });
      return;
    }
    if (!adminPassword) {
      setMessage({ kind: "error", text: "請輸入 Owner 管理員密碼確認本次操作。" });
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/members/${encodeURIComponent(memberId)}/password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adminPassword,
            password,
            passwordConfirmation,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "會員密碼重新設定失敗");

      setAdminPassword("");
      setPassword("");
      setPasswordConfirmation("");
      setMessage({
        kind: "success",
        text: "會員密碼已重新設定。請將新密碼以安全方式提供給會員。",
      });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "會員密碼重新設定失敗",
      });
    } finally {
      setBusy(false);
    }
  }

  return <form className="member-delete-form" onSubmit={submit}>
    <label>Owner 管理員密碼
      <input
        type="password"
        autoComplete="current-password"
        value={adminPassword}
        onChange={(event) => setAdminPassword(event.target.value)}
        required
      />
    </label>
    <label>會員新密碼
      <input
        type="password"
        autoComplete="new-password"
        minLength={8}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
    </label>
    <label>再次輸入會員新密碼
      <input
        type="password"
        autoComplete="new-password"
        minLength={8}
        value={passwordConfirmation}
        onChange={(event) => setPasswordConfirmation(event.target.value)}
        required
      />
    </label>
    <p>密碼至少 8 個字元。系統不會顯示或保存明文密碼。</p>
    {message?.kind === "error" ? <p role="alert" className="form-error">{message.text}</p> : null}
    {message?.kind === "success" ? <p role="status" className="admin-save-message">{message.text}</p> : null}
    <button className="admin-primary-button" type="submit" disabled={busy}>
      {busy ? "重新設定中…" : "確認重新設定會員密碼"}
    </button>
  </form>;
}
