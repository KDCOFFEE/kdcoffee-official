"use client";
import { useEffect, useRef, useState } from "react";
import type { AssetRecord } from "@/lib/assets";
import type { SocialImageValue } from "@/lib/socialImageSettings";
import SocialImageField from "./SocialImageField";

export default function HomepageSocialImageSettings() {
  const [version, setVersion] = useState<number>(), [assets, setAssets] = useState<AssetRecord[]>([]);
  const [image, setImage] = useState<SocialImageValue>(), [baseline, setBaseline] = useState("null");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const lock = useRef(false);
  async function load() {
    const response = await fetch("/api/admin/pages", { cache: "no-store" });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "首頁分享圖無法讀取。");
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
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "儲存失敗，草稿已保留。");
      setVersion(result.version); setImage(result.homepage.seo?.socialImage); setBaseline(JSON.stringify(result.homepage.seo?.socialImage || null));
      setMessage("首頁分享圖已儲存。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "儲存失敗。"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section id="homepage-social-share" aria-label="首頁 SEO 與社群分享">
    <h2>首頁 SEO 與社群分享</h2>
    <SocialImageField label="首頁社群分享縮圖（Open Graph）" help="分享首頁至 LINE、Facebook、Messenger 等平台時使用。建議尺寸 1200 × 630 px。未設定時使用全站預設分享圖。"
      value={image} assets={assets} disabled={busy || version === undefined} onChange={setImage}
      onBusy={active => { lock.current = active; setBusy(active); }} onUploaded={asset => setAssets(current => [asset, ...current])} />
    <button type="button" disabled={busy || version === undefined || !dirty} onClick={() => void save()}>儲存首頁分享圖</button>
    <button type="button" disabled={busy} onClick={() => { if (!dirty || window.confirm("重新載入會捨棄尚未儲存的首頁分享圖設定，確定繼續？")) void load().catch(error => setMessage(error.message)); }}>重新載入分享圖設定</button>
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
