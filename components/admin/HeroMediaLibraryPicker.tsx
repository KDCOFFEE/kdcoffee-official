"use client";

/* eslint-disable @next/next/no-img-element -- runtime-managed local and Cloudinary media paths are not known at build time. */

import { useEffect, useMemo, useState } from "react";

import type { AssetRecord } from "@/lib/assets";
import { localImageMedia, type MediaAsset } from "@/lib/media";

type CloudinaryVideoAsset = {
  publicId: string;
  displayName: string;
  posterUrl?: string;
  format?: string;
  duration?: number;
};

type LibraryItem =
  | { kind: "image"; id: string; name: string; subtitle: string; previewUrl: string; media: MediaAsset }
  | { kind: "video"; id: string; name: string; subtitle: string; previewUrl?: string; publicId: string };

function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return "影片";
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return minutes ? `${minutes}:${String(remainder).padStart(2, "0")} 影片` : `${remainder} 秒影片`;
}

export default function HeroMediaLibraryPicker({
  assets,
  title,
  onChoose,
  onClose,
}: {
  assets: AssetRecord[];
  title: string;
  onChoose: (media: MediaAsset) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState<CloudinaryVideoAsset[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [message, setMessage] = useState("");
  const [choosingId, setChoosingId] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/media/cleanup", { method: "POST", cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Cloudinary 影片讀取失敗");
        if (!cancelled) setVideos(Array.isArray(result.assets) ? result.assets : []);
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Cloudinary 影片讀取失敗");
      })
      .finally(() => {
        if (!cancelled) setLoadingVideos(false);
      });
    return () => { cancelled = true; };
  }, []);

  const items = useMemo<LibraryItem[]>(() => {
    const imageItems: LibraryItem[] = assets
      .filter((asset) => asset.status === "active" && /\.(avif|gif|jpe?g|png|svg|webp)(?:\?|$)/i.test(asset.path))
      .map((asset) => ({
        kind: "image",
        id: `image:${asset.id}`,
        name: asset.name,
        subtitle: asset.alt || asset.category || "網站圖片",
        previewUrl: asset.path,
        media: localImageMedia(asset.path),
      }));
    const videoItems: LibraryItem[] = videos.map((video) => ({
      kind: "video",
      id: `video:${video.publicId}`,
      name: video.displayName || video.publicId.split("/").at(-1) || "Cloudinary 影片",
      subtitle: `${video.format?.toUpperCase() || "VIDEO"} · ${formatDuration(video.duration)}`,
      previewUrl: video.posterUrl,
      publicId: video.publicId,
    }));
    return [...imageItems, ...videoItems];
  }, [assets, videos]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("zh-TW");
    if (!keyword) return items;
    return items.filter((item) => `${item.name} ${item.subtitle}`.toLocaleLowerCase("zh-TW").includes(keyword));
  }, [items, query]);

  async function choose(item: LibraryItem) {
    if (item.kind === "image") {
      onChoose(item.media);
      return;
    }
    setChoosingId(item.id);
    setMessage("正在驗證既有 Cloudinary 影片…");
    try {
      const response = await fetch("/api/admin/media/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId: item.publicId, usage: "hero", mediaType: "video", reuseExisting: true }),
      });
      const result = await response.json() as { error?: string; media?: MediaAsset };
      if (!response.ok || !result.media) throw new Error(result.error || "影片驗證失敗");
      onChoose(result.media);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "影片驗證失敗");
    } finally {
      setChoosingId("");
    }
  }

  return <div className="page-asset-picker" role="dialog" aria-modal="true" aria-label={title}>
    <header>
      <div><h3>{title}</h3><p>可直接選擇既有圖片或已上傳至 Cloudinary 的影片，不會重新上傳檔案。</p></div>
      <button type="button" onClick={onClose} aria-label="關閉素材庫">×</button>
    </header>
    <label>搜尋素材<input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名稱、圖片說明或影片格式" /></label>
    {loadingVideos ? <p className="cms-help">正在讀取 Cloudinary 影片…</p> : null}
    {message ? <div className="cms-message" role="status">{message}</div> : null}
    <div className="page-asset-grid">
      {filtered.map((item) => <button type="button" key={item.id} disabled={choosingId === item.id} onClick={() => void choose(item)}>
        <span>
          {item.previewUrl ? <img src={item.previewUrl} alt="" loading="lazy" /> : <b>{item.kind === "video" ? "VIDEO" : "IMAGE"}</b>}
        </span>
        <b>{item.name}</b>
        <small>{item.kind === "video" ? `影片 · ${item.subtitle}` : `圖片 · ${item.subtitle}`}</small>
      </button>)}
      {!filtered.length && !loadingVideos ? <p>找不到符合的圖片或影片。</p> : null}
    </div>
  </div>;
}
