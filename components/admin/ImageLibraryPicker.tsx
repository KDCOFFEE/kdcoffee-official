"use client";

/* eslint-disable @next/next/no-img-element -- owner-managed runtime asset paths are not known at build time. */

import { useMemo, useState } from "react";

import type { AssetRecord } from "@/lib/assets";

export default function ImageLibraryPicker({
  assets,
  onChoose,
  onClose,
  title = "從素材庫選擇圖片",
}: {
  assets: AssetRecord[];
  onChoose: (asset: AssetRecord) => void;
  onClose: () => void;
  title?: string;
}) {
  const [query, setQuery] = useState("");
  const images = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("zh-TW");
    return assets.filter((asset) =>
      asset.status === "active"
      && /\.(avif|gif|jpe?g|png|svg|webp)(?:\?|$)/i.test(asset.path)
      && `${asset.name} ${asset.category} ${asset.alt}`.toLocaleLowerCase("zh-TW").includes(keyword));
  }, [assets, query]);

  return <div className="page-asset-picker" role="dialog" aria-modal="true" aria-label={title}>
    <header>
      <div><h3>{title}</h3><p>選取既有圖片，不會建立重複檔案。</p></div>
      <button type="button" onClick={onClose} aria-label="關閉素材庫">×</button>
    </header>
    <label>搜尋素材<input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名稱、分類或替代文字" /></label>
    <div className="page-asset-grid">
      {images.map((asset) => <button type="button" key={asset.id} onClick={() => onChoose(asset)}>
        <span><img src={asset.path} alt={asset.alt || asset.name} loading="lazy" /></span>
        <b>{asset.name}</b><small>{asset.alt || "網站圖片"}</small>
      </button>)}
      {!images.length ? <p>找不到符合的圖片。</p> : null}
    </div>
  </div>;
}
