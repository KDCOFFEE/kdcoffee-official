"use client";

import { FormEvent, useState } from "react";

type Props = {
  initial: {
    pickupName?: string;
    phone?: string;
    email?: string;
  };
};

export default function MemberProfileForm({ initial }: Props) {
  const [pickupName, setPickupName] = useState(initial.pickupName || "");
  const [phone, setPhone] = useState(initial.phone || "");
  const [email, setEmail] = useState(initial.email || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/member/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickupName, phone, email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "會員資料儲存失敗");
      setMessage("會員資料已更新，下次結帳會自動帶入。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "會員資料儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="member-account-inline-form" onSubmit={save}>
      <div className="member-account-inline-head">
        <div>
          <p className="eyebrow dark">PROFILE</p>
          <h3>基本資料</h3>
        </div>
        <span>可直接修改後儲存</span>
      </div>

      <div className="member-account-field-grid">
        <label>
          <small>常用姓名</small>
          <input
            value={pickupName}
            onChange={(event) => setPickupName(event.target.value)}
            maxLength={20}
            autoComplete="name"
            placeholder="請填寫真實姓名"
          />
        </label>

        <label>
          <small>手機號碼</small>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
            inputMode="tel"
            pattern="09[0-9]{8}"
            autoComplete="tel"
            placeholder="例如 0912345678"
          />
        </label>

        <label>
          <small>Email <em>選填</em></small>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            autoComplete="email"
            placeholder="用於日後寄送訂單通知"
          />
        </label>
      </div>

      <div className="member-account-form-actions">
        <button className="member-save-button" type="submit" disabled={saving}>
          {saving ? "儲存中…" : "儲存會員資料"}
        </button>
        {message && <p className="member-success">{message}</p>}
        {error && <p className="form-error">{error}</p>}
      </div>
    </form>
  );
}
