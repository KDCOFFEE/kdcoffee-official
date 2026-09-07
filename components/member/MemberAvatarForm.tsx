"use client";
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, useRef, useState } from "react";

export default function MemberAvatarForm({ customAvatarUrl, providerPictureUrl }: { customAvatarUrl?: string; providerPictureUrl?: string }) {
  const [avatarUrl, setAvatarUrl] = useState(customAvatarUrl || providerPictureUrl || "");
  const [hasCustomAvatar, setHasCustomAvatar] = useState(Boolean(customAvatarUrl));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true); setMessage("");
    try {
      const body = new FormData(); body.set("avatar", file);
      const response = await fetch("/api/member/avatar", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "頭像上傳失敗");
      setAvatarUrl(result.avatarUrl); setHasCustomAvatar(true); setMessage("頭像已更新。重新整理後首頁頭像也會同步。 ");
    } catch (error) { setMessage(error instanceof Error ? error.message : "頭像上傳失敗"); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  async function remove() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/member/avatar", { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "頭像移除失敗");
      setAvatarUrl(result.fallbackUrl || ""); setHasCustomAvatar(false); setMessage(result.fallbackUrl ? "已恢復 LINE 頭像。" : "已恢復 KD 預設頭像。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "頭像移除失敗"); }
    finally { setBusy(false); }
  }

  return <section className="member-avatar-editor" aria-label="會員頭像">
    <div className="member-avatar-editor-preview">{avatarUrl ? <img src={avatarUrl} alt="目前會員頭像" /> : <span>KD</span>}</div>
    <div className="member-avatar-editor-copy"><strong>會員頭像</strong><p>可上傳 JPG、PNG 或 WebP，檔案上限 5MB。自行上傳的照片會優先於 LINE 頭像。</p><div className="member-avatar-editor-actions"><label className="member-avatar-upload-button">{busy ? "處理中…" : hasCustomAvatar ? "更換照片" : "上傳照片"}<input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={upload} /></label>{hasCustomAvatar ? <button type="button" disabled={busy} onClick={() => void remove()}>移除自訂頭像</button> : null}</div>{message ? <small role="status">{message}</small> : null}</div>
  </section>;
}
