"use client";

import { ChangeEvent, DragEvent, useEffect, useState } from "react";

type Asset = {
  id: string; category: string; name: string; usage: string; path: string; recommendedSize: string;
  displaySize: string; format: string; alt: string; seoStem: string; status: "active" | "missing" | "draft";
  originalFileName?: string; updatedAt?: string;
};
type Library = { version: number; updatedAt: string; assets: Asset[] };

export default function LogoManager() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [message, setMessage] = useState("讀取 Logo 資料中…");
  const [uploading, setUploading] = useState("");
  const [dragging, setDragging] = useState("");

  useEffect(() => {
    fetch("/api/admin/assets", { cache: "no-store" })
      .then(async (res) => { const body = await res.json(); if (!res.ok) throw new Error(body.error || "讀取失敗"); return body; })
      .then((value) => { setLibrary(value); setMessage(""); })
      .catch((error) => setMessage(error.message));
  }, []);

  const patch = (id: string, change: Partial<Asset>) => setLibrary((current) => current ? ({
    ...current,
    assets: current.assets.map((asset) => asset.id === id ? { ...asset, ...change } : asset),
  }) : current);

  async function saveText() {
    if (!library) return;
    setMessage("儲存中…");
    const response = await fetch("/api/admin/assets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(library),
    });
    const result = await response.json();
    setMessage(response.ok ? "Logo 設定已儲存。" : result.error || "儲存失敗");
  }

  async function uploadFile(file: File | undefined, asset: Asset) {
    if (!file) return;
    setUploading(asset.id);
    setMessage(`${asset.id} 上傳中…`);
    const form = new FormData();
    form.append("file", file);
    form.append("assetId", asset.id);
    const response = await fetch("/api/admin/assets/upload", { method: "POST", body: form });
    const result = await response.json();
    setUploading("");
    setDragging("");
    if (!response.ok) { setMessage(result.error || "上傳失敗"); return; }
    patch(asset.id, result.asset);
    setMessage(`${asset.name} 已上傳並套用到網站。檔名：${result.fileName}`);
  }

  function onChoose(event: ChangeEvent<HTMLInputElement>, asset: Asset) {
    const file = event.target.files?.[0];
    event.target.value = "";
    void uploadFile(file, asset);
  }

  function onDrop(event: DragEvent<HTMLDivElement>, asset: Asset) {
    event.preventDefault();
    void uploadFile(event.dataTransfer.files?.[0], asset);
  }

  if (!library) return <p className="admin-empty">{message}</p>;
  const logos = library.assets.filter((asset) => asset.category === "logo");

  return <div className="logo-manager">
    <div className="cms-toolbar logo-toolbar">
      <div>
        <p className="eyebrow dark">BRAND LOGO CONTROL</p>
        <h1>Logo 管理</h1>
        <p>每一種 Logo 都有固定用途。直接拖曳或選擇檔案，上傳後會自動命名並套用到對應位置。</p>
      </div>
      <div className="cms-toolbar-actions">
        <a href="/" target="_blank">預覽網站 ↗</a>
        <button onClick={saveText}>儲存 ALT 與 SEO 設定</button>
      </div>
    </div>

    {message ? <div className="cms-message">{message}</div> : null}

    <section className="logo-guide">
      <h2>網站需要幾種 Logo？</h2>
      <p><strong>目前必要的是 2 種：</strong>Header 深色字版與 Footer 白色版。其餘方形標誌、Apple Touch Icon、社群分享圖可之後補齊。</p>
    </section>

    <div className="logo-grid">
      {logos.map((asset) => <article className="logo-card" key={asset.id}>
        <header className="logo-card-head">
          <div><span className="asset-id">{asset.id}</span><h2>{asset.name}</h2><p>{asset.usage}</p></div>
          <span className={`asset-status ${asset.path ? "ready" : "missing"}`}>{asset.path ? "已套用" : "尚未上傳"}</span>
        </header>

        <div className={`logo-preview ${asset.id === "LOGO002" ? "dark" : "light"}`}>
          {asset.path ? <img src={asset.path} alt={asset.alt || asset.name}/> : <div><b>{asset.id}</b><span>請拖曳 Logo 到下方上傳區</span></div>}
        </div>

        <div
          className={`logo-dropzone ${dragging === asset.id ? "dragging" : ""}`}
          onDragEnter={(event) => { event.preventDefault(); setDragging(asset.id); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging("")}
          onDrop={(event) => onDrop(event, asset)}
        >
          <strong>{uploading === asset.id ? "上傳中，請稍候…" : asset.path ? "拖曳新 Logo 來替換" : "把 Logo 拖曳到這裡"}</strong>
          <span>或</span>
          <label className="logo-file-button">
            {asset.path ? "選擇新版本" : "選擇 Logo 檔案"}
            <input type="file" accept="image/svg+xml,image/png,image/webp,image/jpeg" disabled={uploading === asset.id} onChange={(event) => onChoose(event, asset)}/>
          </label>
        </div>

        <dl className="logo-spec-list">
          <div><dt>建議尺寸</dt><dd>{asset.recommendedSize}</dd></div>
          <div><dt>網站顯示</dt><dd>{asset.displaySize}</dd></div>
          <div><dt>檔案格式</dt><dd>{asset.format}</dd></div>
          <div><dt>SEO 檔名</dt><dd><code>{asset.seoStem}-v01.ext</code></dd></div>
          {asset.path ? <div><dt>目前檔案</dt><dd><code>{asset.path}</code></dd></div> : null}
        </dl>

        <label className="logo-field">圖片 ALT
          <input value={asset.alt} onChange={(event) => patch(asset.id, { alt: event.target.value })}/>
        </label>
        <label className="logo-field">SEO 檔名主體
          <input value={asset.seoStem} onChange={(event) => patch(asset.id, { seoStem: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}/>
        </label>
      </article>)}
    </div>
  </div>;
}
