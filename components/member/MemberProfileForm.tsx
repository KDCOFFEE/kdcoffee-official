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
  const [editing, setEditing] = useState(false);
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
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "會員資料儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="member-profile-tools">
        <button type="button" className="member-edit-button" onClick={() => setEditing(true)}>編輯聯絡資料</button>
        {message && <p className="member-success">{message}</p>}
      </div>
    );
  }

  return (
    <form className="member-edit-form" onSubmit={save}>
      <div className="member-edit-head">
        <div>
          <p className="eyebrow dark">CONTACT PROFILE</p>
          <h2>編輯常用聯絡資料</h2>
        </div>
        <button type="button" className="member-cancel-button" onClick={() => setEditing(false)}>取消</button>
      </div>
      <label>取貨人姓名<input value={pickupName} onChange={(event) => setPickupName(event.target.value)} maxLength={20} autoComplete="name" placeholder="請填寫真實姓名" /></label>
      <label>手機號碼<input value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="tel" pattern="09[0-9]{8}" autoComplete="tel" placeholder="例如 0912345678" /></label>
      <label>Email <small>選填</small><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="用於日後寄送訂單通知" /></label>
      {error && <p className="form-error">{error}</p>}
      <button className="member-save-button" type="submit" disabled={saving}>{saving ? "儲存中…" : "儲存會員資料"}</button>
    </form>
  );
}
