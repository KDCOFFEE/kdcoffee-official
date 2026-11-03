"use client";
import { useEffect, useState } from "react";
import type { AssetLibrary } from "@/lib/assets";
import type { SocialImageValue } from "@/lib/socialImageSettings";
import SocialImageField from "./SocialImageField";

export default function GlobalSocialImageSettings({ onSaved }: { onSaved?: (library: AssetLibrary) => void }) {
  const [library, setLibrary] = useState<AssetLibrary | null>(null), [image, setImage] = useState<SocialImageValue>();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function load(updateImage = true) {
    const response = await fetch("/api/admin/assets?purpose=social-share", { cache: "no-store" });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "讀取分享圖設定失敗。");
    setLibrary(data);
    if (updateImage) { const slot = data.assets.find((asset: { id: string }) => asset.id === "LOGO005"); setImage(slot?.path && slot.status === "active" ? { path: slot.path, alt: slot.alt } : undefined); }
    return data as AssetLibrary;
  }
  useEffect(() => { void load().catch(error => setMessage(error.message)); }, []);
  async function save() {
    if (!library) return; setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/assets?purpose=social-share", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: library.version, image: image || null }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "儲存失敗。");
      setLibrary(result); onSaved?.(result); setMessage("預設社群分享縮圖已儲存。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "儲存失敗。"); }
    finally { setBusy(false); }
  }
  return <div id="social-share">
    <SocialImageField label="預設社群分享縮圖（Open Graph）" help="未設定頁面專屬分享圖時，將使用此圖片。未設定全站分享圖時，最後使用既有安全 Logo。" value={image} assets={library?.assets || []} onChange={setImage} disabled={busy || !library} onBusy={setBusy} onUploaded={async () => { await load(false); }} />
    <button type="button" disabled={busy || !library} onClick={() => void save()}>{busy ? "處理中…" : "儲存預設分享圖"}</button>
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
