"use client";

import { FormEvent, useState } from "react";

type Mode = "login" | "register" | "forgot";

export default function EmailAuthForms() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setPassword("");
    setPasswordConfirmation("");
    setError("");
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const endpoint =
        mode === "forgot" ? "forgot-password" : mode;
      const response = await fetch(`/api/auth/email/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          ...(mode === "forgot"
            ? {}
            : {
                password,
                ...(mode === "register" ? { passwordConfirmation } : {}),
              }),
        }),
      });
      const result = await response.json();

      if (response.status === 409 && mode === "register") {
        setMode("login");
        setPassword("");
        setPasswordConfirmation("");
        setError(result.error || "此 Email 已經註冊過，請直接登入。");
        setSubmitting(false);
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || "操作失敗，請稍後再試");
      }

      if (mode === "forgot") {
        setMessage(
          result.message ||
            "如果此 Email 已註冊，我們會將密碼重設方式寄到您的信箱。",
        );
        setSubmitting(false);
        return;
      }

      window.location.assign("/member");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失敗，請稍後再試");
      setSubmitting(false);
    }
  }

  return (
    <>
      {mode === "login" && (
        <button
          className="email-register-entry"
          type="button"
          onClick={() => switchMode("register")}
          aria-controls="email-auth-form"
        >
          使用 Email 快速註冊
        </button>
      )}

      <section className="email-auth-section" id="email-auth-form">
      <div className="email-auth-heading">
        <p className="eyebrow dark">EMAIL MEMBER</p>
        <h2>
          {mode === "login"
            ? "Email 登入"
            : mode === "register"
              ? "建立 Email 會員"
              : "忘記密碼"}
        </h2>
      </div>

      <form className="email-auth-form" onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            inputMode="email"
            required
          />
        </label>

        {mode !== "forgot" && (
          <label>
            密碼
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={8}
              required
            />
          </label>
        )}

        {mode === "register" && (
          <label>
            再次輸入密碼
            <input
              type="password"
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="member-success" role="status">{message}</p>}

        <button className="email-auth-submit" type="submit" disabled={submitting}>
          {submitting
            ? "處理中…"
            : mode === "login"
              ? "登入"
              : mode === "register"
                ? "建立會員"
                : "寄送密碼重設方式"}
        </button>
      </form>

      {mode === "login" && (
        <button
          className="email-auth-help"
          type="button"
          onClick={() => switchMode("forgot")}
        >
          忘記密碼？
        </button>
      )}

      <button
        className="email-auth-switch"
        type="button"
        onClick={() => switchMode(mode === "login" ? "register" : "login")}
      >
        {mode === "login"
          ? "還不是會員？使用 Email 快速註冊"
          : mode === "register"
            ? "已經是 Email 會員？Email 登入"
            : "返回 Email 登入"}
      </button>
      </section>
    </>
  );
}
