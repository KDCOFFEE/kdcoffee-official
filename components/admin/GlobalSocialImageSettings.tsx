"use client";
import { useEffect, useState } from "react";
import type { AssetLibrary } from "@/lib/assets";
import type { SocialImageValue } from "@/lib/socialImageSettings";
import SocialImageField from "./SocialImageField";
import styles from "./SocialImageField.module.css";

export default function GlobalSocialImageSettings({ onSaved }: { onSaved?: (library: AssetLibrary) => void }) {
  const [library, setLibrary] = useState<AssetLibrary | null>(null), [image, setImage] = useState<SocialImageValue>();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function load(updateImage = true) {
    const response = await fetch("/api/admin/assets?purpose=social-share", { cache: "no-store" });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "暫時無法讀取分享圖片設定。");
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
      setLibrary(result); onSaved?.(result); setMessage("設定已儲存。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "儲存失敗。"); }
    finally { setBusy(false); }
  }
  return <div id="social-share" className={styles.settings}>
    <SocialImageField label="全站預設分享圖片" help="當頁面沒有設定自己的分享圖片時，會使用這張圖片。" value={image} assets={library?.assets || []} onChange={next => { setImage(next); setMessage(""); }} disabled={busy || !library} onBusy={setBusy} onUploaded={async () => { await load(false); }} />
    <div className={styles.footer}><button type="button" className={styles.primary} disabled={busy || !library} onClick={() => void save()}>{busy ? "處理中…" : "儲存設定"}</button>
    {message ? <p role="status" aria-live="polite">{message}</p> : null}</div>
  </div>;
}
