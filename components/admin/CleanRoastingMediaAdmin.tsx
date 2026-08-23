"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */

import MediaUploader from "@/components/admin/MediaUploader";
import {
  CLEAN_ROASTING_LEGACY_CONFIG,
  CLEAN_ROASTING_MEDIA_MAX_ITEMS,
  normalizeCleanRoastingMedia,
  type CleanRoastingMediaConfig,
  type CleanRoastingMediaItem,
} from "@/lib/cleanRoastingMedia";
import { localImageMedia, type MediaAsset } from "@/lib/media";
import { isCanonicalProductSlug } from "@/lib/productMediaNaming";

export default function CleanRoastingMediaAdmin({ selected, patch, setMessage }: { selected: Record<string, any>; patch: (change: Record<string, unknown>) => void; setMessage: (message: string) => void }) {
  const fallback = selected.slug === "giotto-awakening" ? CLEAN_ROASTING_LEGACY_CONFIG : undefined;
  const config = normalizeCleanRoastingMedia(selected.cleanRoastingMedia, fallback);
  const items = [...config.items].sort((left, right) => (left.order || 0) - (right.order || 0));
  const productSlug = String(selected.slug || "").trim();
  const reservedPublicIds = items.map((item) => item.media?.publicId).filter((publicId): publicId is string => typeof publicId === "string" && Boolean(publicId.trim()));
  const display = { ...config.display };
  const update = (change: Partial<CleanRoastingMediaConfig>) => patch({ cleanRoastingMedia: { ...config, ...change } });
  const updateItems = (nextItems: CleanRoastingMediaItem[]) => update({ items: nextItems.map((item, index) => ({ ...item, order: index })) });
  const addMedia = (media: MediaAsset) => {
    if (items.length >= CLEAN_ROASTING_MEDIA_MAX_ITEMS) {
      setMessage(`CLEAN ROASTING 最多 ${CLEAN_ROASTING_MEDIA_MAX_ITEMS} 個媒體。`);
      return;
    }
    const id = globalThis.crypto.randomUUID();
    updateItems([...items, { id, type: media.type, src: media.url, alt: media.type === "image" ? `${selected.name} 乾淨烘焙實拍` : `${selected.name} 烘焙影片`, poster: media.posterUrl, enabled: true, order: items.length, media }]);
    setMessage(`已新增 CLEAN ROASTING ${media.type === "image" ? "照片" : "影片"}，請儲存變更。`);
  };
  const uploadImage = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("desiredName", `kdcoffee-${selected.slug || "artwork"}-clean-roasting`);
    form.append("artworkSlug", selected.slug || selected.nameEn || selected.name || "artwork");
    form.append("assetType", "clean-roasting");
    const response = await fetch("/api/admin/homepage/upload", { method: "POST", body: form });
    const result = await response.json();
    if (!response.ok || !result.path) throw new Error(result.error || "CLEAN ROASTING 圖片上傳失敗。");
    return localImageMedia(result.path);
  };
  const move = (index: number, step: -1 | 1) => {
    const target = index + step;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    updateItems(next);
  };

  return <section className="clean-roasting-admin-group clean-roasting-media-admin" aria-labelledby="clean-roasting-media-admin-title">
    <div className="clean-roasting-admin-group-heading"><span>B</span><div><h3 id="clean-roasting-media-admin-title">媒體與播放設定</h3><p>照片使用既有 Persistent Storage；影片使用既有 Cloudinary 安全上傳。最多 {CLEAN_ROASTING_MEDIA_MAX_ITEMS} 個。</p></div><label className="cms-switch"><input type="checkbox" checked={config.enabled !== false} onChange={(event) => update({ enabled: event.target.checked })} />{config.enabled !== false ? "顯示媒體" : "隱藏媒體"}</label></div>
    <div className="clean-roasting-display-controls"><label>顯示方式<select value={display.mode || "slider"} onChange={(event) => update({ display: { ...display, mode: event.target.value as "single" | "slider" } })}><option value="single">單一媒體</option><option value="slider">左右滑動</option></select></label><label>切換效果<select value={display.transition || "slide"} onChange={(event) => update({ display: { ...display, transition: event.target.value as "slide" | "fade" } })}><option value="slide">左右滑動</option><option value="fade">淡入淡出</option></select></label><label>切換時間<input type="number" min="200" max="1200" step="50" value={display.transitionDurationMs || 450} onChange={(event) => update({ display: { ...display, transitionDurationMs: Number(event.target.value) } })} /><small>200–1200 ms</small></label><label className="clean-roasting-autoplay"><input type="checkbox" checked={display.autoplay === true} onChange={(event) => update({ display: { ...display, autoplay: event.target.checked } })} />自動切換</label>{display.autoplay === true ? <label>自動切換間隔<input type="number" min="3000" max="12000" step="500" value={display.autoplayIntervalMs || 6000} onChange={(event) => update({ display: { ...display, autoplayIntervalMs: Number(event.target.value) } })} /><small>3000–12000 ms</small></label> : null}</div>
    <div className="clean-roasting-media-list">{items.map((item, index) => <article key={item.id}><b>{String(index + 1).padStart(2, "0")}</b><div className="clean-roasting-admin-preview">{item.type === "image" ? <img src={item.src} alt="" /> : item.poster || item.media?.posterUrl ? <img src={item.poster || item.media?.posterUrl} alt="" /> : <span>VIDEO</span>}</div><div className="clean-roasting-admin-item-copy"><span>{item.type.toUpperCase()}</span><strong>{item.src.split("/").pop() || item.src}</strong><small>{item.src}</small><label>替代文字<input value={item.alt || ""} onChange={(event) => updateItems(items.map((current) => current.id === item.id ? { ...current, alt: event.target.value } : current))} /></label></div><label className="cms-switch"><input type="checkbox" checked={item.enabled !== false} onChange={(event) => updateItems(items.map((current) => current.id === item.id ? { ...current, enabled: event.target.checked } : current))} />{item.enabled !== false ? "顯示" : "隱藏"}</label><div className="clean-roasting-admin-actions"><button type="button" disabled={index === 0} onClick={() => move(index, -1)}>上移</button><button type="button" disabled={index === items.length - 1} onClick={() => move(index, 1)}>下移</button><button type="button" onClick={() => updateItems(items.filter((current) => current.id !== item.id))}>移除</button></div></article>)}{!items.length ? <p className="empty-admin-state">尚未設定媒體。Giotto 只有在整個設定缺席時才使用 legacy fallback。</p> : null}</div>
    <MediaUploader label="新增 CLEAN ROASTING 媒體" usage="product" showPreview={false} disabled={items.length >= CLEAN_ROASTING_MEDIA_MAX_ITEMS || !isCanonicalProductSlug(productSlug)} imageActionLabel="＋ 新增照片" videoActionLabel="＋ 新增影片" productMediaNaming={{ productSlug, mediaPurpose: "clean-roasting", reservedPublicIds }} onImageUpload={uploadImage} onChange={addMedia} />
  </section>;
}
