"use client";
import { useEffect, useRef, useState } from "react";
import type { AssetRecord } from "@/lib/assets";
import type { SocialImageValue } from "@/lib/socialImageSettings";
import SocialImageField from "./SocialImageField";
import styles from "./SocialImageField.module.css";

export default function HomepageSocialImageSettings() {
  const [version, setVersion] = useState<number>(), [assets, setAssets] = useState<AssetRecord[]>([]);
  const [image, setImage] = useState<SocialImageValue>(), [baseline, setBaseline] = useState("null");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const lock = useRef(false);
  async function load() {
    const response = await fetch("/api/admin/pages", { cache: "no-store" });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "暫時無法讀取分享圖片設定。");
    const selected = data.store.systemPages?.homepage?.seo?.socialImage;
    setVersion(data.store.version); setAssets(data.assets || []); setImage(selected); setBaseline(JSON.stringify(selected || null));
  }
  useEffect(() => { void load().catch(error => setMessage(error.message)); }, []);
  const dirty = JSON.stringify(image || null) !== baseline;
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  async function save() {
    if (version === undefined || lock.current) return;
    lock.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/pages", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "homepageSeo", version, image: image || null }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "尚未儲存成功，您的選擇會保留。");
      setVersion(result.version); setImage(result.homepage.seo?.socialImage); setBaseline(JSON.stringify(result.homepage.seo?.socialImage || null));
      setMessage("設定已儲存。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "儲存失敗。"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section id="homepage-social-share" className={`${styles.settings} ${styles.homepageSettings}`} aria-label="首頁分享設定">
    <SocialImageField variant="compact" label="首頁分享圖片" help="未設定時，會使用全站預設分享圖片。"
      value={image} assets={assets} disabled={busy || version === undefined} onChange={next => { setImage(next); setMessage(""); }}
      onBusy={active => { lock.current = active; setBusy(active); }} onUploaded={asset => setAssets(current => [asset, ...current])} />
    <div className={styles.footer}><button type="button" className={styles.primary} disabled={busy || version === undefined || !dirty} onClick={() => void save()}>儲存設定</button>
    <button type="button" className={styles.secondary} disabled={busy} onClick={() => { if (!dirty || window.confirm("重新整理會捨棄尚未儲存的分享圖片選擇，確定繼續？")) void load().catch(error => setMessage(error.message)); }}>重新整理</button>
    {message || dirty ? <p role="status" aria-live="polite">{message || "尚有未儲存的變更"}</p> : null}</div>
  </section>;
}
