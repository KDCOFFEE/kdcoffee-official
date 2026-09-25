"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Mode = "closed" | "login" | "register" | "recovery";

const PHONE_SUPPORT_URL = "https://line.me/R/ti/p/@kdcoffee";
const SAFE_REFERRAL_RETURN = /^\/member\?ref=KD[A-F0-9]{10}$/u;

function safeDestination(returnTo: string) {
  return returnTo === "/checkout" || returnTo === "/member" || SAFE_REFERRAL_RETURN.test(returnTo)
    ? returnTo
    : "/member";
}

function validTaiwanMobileInput(value: string) {
  const compact = value.trim().replace(/[ -]/gu, "");
  return /^09\d{8}$/u.test(compact) || /^\+8869\d{8}$/u.test(compact);
}

export default function PhoneAuthForms({ returnTo = "/member" }: { returnTo?: string }) {
  const [mode, setMode] = useState<Mode>("closed");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const entryRef = useRef<HTMLButtonElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const recoveryLinkRef = useRef<HTMLAnchorElement>(null);
  const focusAfterModeChangeRef = useRef(false);

  useEffect(() => {
    if (!focusAfterModeChangeRef.current) return;
    focusAfterModeChangeRef.current = false;

    if (mode === "closed") entryRef.current?.focus();
    else if (mode === "recovery") recoveryLinkRef.current?.focus();
    else phoneInputRef.current?.focus();
  }, [mode]);

  function switchMode(nextMode: Mode) {
    focusAfterModeChangeRef.current = true;
    setMode(nextMode);
    setPassword("");
    setPasswordConfirmation("");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!validTaiwanMobileInput(phone)) {
      setError("請輸入正確的台灣手機號碼");
      return;
    }
    if (password.length < 8) {
      setError("密碼至少需要 8 個字元");
      return;
    }
    if (mode === "register" && password !== passwordConfirmation) {
      setError("兩次輸入的密碼不一致");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/auth/phone/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          password,
          ...(mode === "register" ? {
            passwordConfirmation,
            ...(SAFE_REFERRAL_RETURN.test(returnTo)
              ? { referralCode: new URL(returnTo, window.location.origin).searchParams.get("ref") }
              : {}),
          } : {}),
        }),
      });
      const result = await response.json();

      if (response.status === 409 && mode === "register") {
        switchMode("login");
        setError(result.error || "此手機號碼已經註冊過，請直接登入。");
        return;
      }
      if (!response.ok) {
        throw new Error(result.error || (mode === "login" ? "手機號碼或密碼錯誤" : "建立會員失敗，請稍後再試"));
      }

      window.location.assign(safeDestination(returnTo));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失敗，請稍後再試");
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === "closed") {
    return (
      <button
        ref={entryRef}
        className="phone-auth-entry"
        type="button"
        onClick={() => switchMode("login")}
        aria-controls="phone-auth-panel"
        aria-expanded="false"
      >
        使用手機號碼登入／註冊
      </button>
    );
  }

  return (
    <section className="phone-auth-section" id="phone-auth-panel" aria-labelledby="phone-auth-title">
      <div className="phone-auth-heading">
        <p className="eyebrow dark">PHONE MEMBER</p>
        <h2 id="phone-auth-title">
          {mode === "login" ? "手機號碼登入" : mode === "register" ? "建立手機會員" : "忘記手機會員密碼"}
        </h2>
      </div>

      {mode === "recovery" ? (
        <div className="phone-recovery-help">
          <p>目前可以傳訊息給 KD Coffee，由我們協助確認會員資料並重設新密碼。</p>
          <p>人工協助的方式會持續保留；我們不會查看或提供您原本的密碼。</p>
          <a
            ref={recoveryLinkRef}
            className="phone-support-link"
            href={PHONE_SUPPORT_URL}
            target="_blank"
            rel="noreferrer"
          >
            傳訊息給 KD Coffee
          </a>
          <button className="phone-auth-text-button" type="button" onClick={() => switchMode("login")}>
            返回手機登入
          </button>
        </div>
      ) : (
        <>
          <form className="phone-auth-form" onSubmit={submit} noValidate>
            <label>
              手機號碼
              <input
                ref={phoneInputRef}
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="09xx xxx xxx"
                aria-describedby="phone-auth-example"
                required
              />
              <small id="phone-auth-example">例如：0912 345 678</small>
            </label>

            <label>
              {mode === "register" ? "設定密碼" : "密碼"}
              <input
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
              {mode === "register" ? <small>密碼至少 8 個字元</small> : null}
            </label>

            {mode === "register" ? (
              <label>
                再次輸入密碼
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwordConfirmation}
                  onChange={(event) => setPasswordConfirmation(event.target.value)}
                  minLength={8}
                  required
                />
              </label>
            ) : null}

            {error ? <p className="form-error phone-auth-error" role="alert">{error}</p> : null}

            <button className="phone-auth-submit" type="submit" disabled={submitting}>
              {submitting ? "處理中…" : mode === "login" ? "登入" : "建立會員"}
            </button>
          </form>

          {mode === "login" ? (
            <button className="phone-auth-help" type="button" onClick={() => switchMode("recovery")}>
              忘記密碼？
            </button>
          ) : null}

          <button
            className="phone-auth-switch"
            type="button"
            onClick={() => switchMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "第一次使用？建立手機會員" : "已經是手機會員？返回登入"}
          </button>
          <button className="phone-auth-text-button" type="button" onClick={() => switchMode("closed")}>
            改用其他登入方式
          </button>
        </>
      )}
    </section>
  );
}
