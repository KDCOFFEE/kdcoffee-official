"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

type Asset = {
  id: string; category: string; name: string; usage: string; path: string; recommendedSize: string;
  displaySize: string; format: string; alt: string; seoStem: string; status: "active" | "missing" | "draft";
  originalFileName?: string; updatedAt?: string;
};
type Library = { version: number; updatedAt: string; assets: Asset[] };

const categoryLabels: Record<string, string> = { logo: "Logo", homepage: "首頁", brand: "品牌故事", product: "商品", social: "社群", misc: "其他" };

export default function AssetManager() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [message, setMessage] = useState("讀取中…");
  const [filter, setFilter] = useState("all");
  const [uploading, setUploading] = useState("");

  useEffect(() => {
    fetch("/api/admin/assets", { cache: "no-store" }).then(async (res) => {
      const value = await res.json(); if (!res.ok) throw new Error(value.error || "讀取失敗"); return value;
    }).then((value) => { setLibrary(value); setMessage(""); }).catch((error) => setMessage(error.message));
  }, []);

  const categories = useMemo(() => Array.from(new Set(library?.assets.map((asset) => asset.category) || [])), [library]);
  const visible = library?.assets.filter((asset) => filter === "all" || asset.category === filter) || [];
  const patch = (id: string, change: Partial<Asset>) => setLibrary((current) => current ? ({ ...current, assets: current.assets.map((asset) => asset.id === id ? { ...asset, ...change } : asset) }) : current);

  async function save() {
    if (!library) return; setMessage("儲存中…");
    const response = await fetch("/api/admin/assets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(library) });
    const result = await response.json(); setMessage(response.ok ? "資產資料已儲存。" : result.error || "儲存失敗");
  }

  async function upload(event: ChangeEvent<HTMLInputElement>, asset: Asset) {
    const file = event.target.files?.[0]; if (!file) return;
    setUploading(asset.id); setMessage(`${asset.id} 上傳中…`);
    const form = new FormData(); form.append("file", file); form.append("assetId", asset.id);
    const response = await fetch("/api/admin/assets/upload", { method: "POST", body: form });
    const result = await response.json(); setUploading(""); event.target.value = "";
    if (!response.ok) { setMessage(result.error || "上傳失敗"); return; }
    patch(asset.id, result.asset); setMessage(`上傳完成：${result.fileName}`);
  }

  if (!library) return <p className="admin-empty">{message}</p>;
  const missing = library.assets.filter((asset) => asset.status === "missing" || !asset.path).length;

  return <div className="asset-manager">
    <div className="cms-toolbar"><div><p className="eyebrow dark">KD ASSET LIBRARY</p><h2>品牌資產</h2><p>每張圖片都有固定編號、用途、尺寸與 SEO 名稱。上傳後由系統自動命名，不再使用 IMG_1234。</p></div><div className="cms-toolbar-actions"><button onClick={save}>儲存文字設定</button></div></div>
    {message ? <div className="cms-message">{message}</div> : null}
    <section className="asset-summary"><article><small>全部資產</small><strong>{library.assets.length}</strong></article><article><small>待補照片</small><strong>{missing}</strong></article><article><small>目前版本</small><strong>v{library.version}</strong></article></section>
    <div className="asset-filter"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>全部</button>{categories.map((category) => <button className={filter === category ? "active" : ""} onClick={() => setFilter(category)} key={category}>{categoryLabels[category] || category}</button>)}</div>
    <div className="asset-grid">{visible.map((asset) => <article className="asset-card" key={asset.id}>
      <div className="asset-preview">{asset.path ? <img src={asset.path} alt={asset.alt || asset.name}/> : <div><b>{asset.id}</b><span>尚未上傳</span></div>}</div>
      <div className="asset-card-head"><div><span className="asset-id">{asset.id}</span><h2>{asset.name}</h2></div><span className={`asset-status ${asset.path ? "ready" : "missing"}`}>{asset.path ? "使用中" : "待補"}</span></div>
      <dl className="asset-spec"><div><dt>前台位置</dt><dd>{asset.usage}</dd></div><div><dt>建議原圖</dt><dd>{asset.recommendedSize}</dd></div><div><dt>網站顯示</dt><dd>{asset.displaySize}</dd></div><div><dt>格式</dt><dd>{asset.format}</dd></div><div><dt>SEO 檔名</dt><dd><code>{asset.seoStem}-v01.ext</code></dd></div>{asset.originalFileName ? <div><dt>原始檔名</dt><dd>{asset.originalFileName}</dd></div> : null}</dl>
      <label>替代文字（ALT）<textarea value={asset.alt} onChange={(event) => patch(asset.id, { alt: event.target.value })}/></label>
      <label>SEO 檔名主體<input value={asset.seoStem} onChange={(event) => patch(asset.id, { seoStem: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}/></label>
      <label className="upload-label asset-upload">{uploading === asset.id ? "上傳中…" : asset.path ? "上傳新版本" : "上傳照片"}<input type="file" accept="image/*" disabled={uploading === asset.id} onChange={(event) => upload(event, asset)}/></label>
      {asset.path ? <small className="asset-path">目前路徑：{asset.path}</small> : null}
    </article>)}</div>
  </div>;
}
