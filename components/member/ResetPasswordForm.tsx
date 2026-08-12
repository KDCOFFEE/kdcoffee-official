"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/email/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, passwordConfirmation }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "密碼重設失敗，請重新申請。");
      }

      setPassword("");
      setPasswordConfirmation("");
      setSuccess(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "密碼重設失敗，請重新申請。",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="email-reset-success" role="status">
        <strong>密碼已重新設定，請使用新密碼登入。</strong>
        <Link className="email-auth-submit" href="/member">
          回到會員登入
        </Link>
      </div>
    );
  }

  return (
    <form className="email-auth-form" onSubmit={submit}>
      <label>
        新密碼
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>

      <label>
        再次輸入新密碼
        <input
          type="password"
          value={passwordConfirmation}
          onChange={(event) => setPasswordConfirmation(event.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>

      {error && <p className="form-error" role="alert">{error}</p>}

      <button className="email-auth-submit" type="submit" disabled={submitting}>
        {submitting ? "重設中…" : "重新設定密碼"}
      </button>

      <Link className="text-link" href="/member">
        返回會員登入
      </Link>
    </form>
  );
}
