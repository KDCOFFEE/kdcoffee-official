"use client";

import { useState } from "react";
import KdMedia from "@/components/media/KdMedia";
import type { StoreMediaReference } from "@/lib/storeTypes";
import styles from "./StoreProductDetail.module.css";

type GalleryProps = { name: string; heroMedia?: StoreMediaReference; gallery: StoreMediaReference[] };

/** Hero remains first; the existing gallery's stored order is untouched. */
export function storeProductMediaItems(hero: StoreMediaReference | undefined, gallery: readonly StoreMediaReference[]) {
  return hero ? [hero, ...gallery] : [...gallery];
}

export function storeProductMediaPreview(media: StoreMediaReference): string | undefined {
  if (media.type === "image") return media.url;
  if (media.posterUrl) return media.posterUrl;
  if (media.type === "youtube" && media.videoId && /^[A-Za-z0-9_-]{11}$/u.test(media.videoId)) {
    return `https://i.ytimg.com/vi/${media.videoId}/hqdefault.jpg`;
  }
  return undefined;
}

export default function StoreProductGallery({ name, heroMedia, gallery }: GalleryProps) {
  const mediaItems = storeProductMediaItems(heroMedia, gallery);
  const [selection, setSelection] = useState({ index: 0, activated: false });
  const index = Math.min(selection.index, Math.max(0, mediaItems.length - 1));
  const selected = mediaItems[index];
  const preview = selected ? storeProductMediaPreview(selected) : undefined;
  const imageFallback = mediaItems.find(media => media.type === "image")?.url;
  const alt = selected?.alt.trim() ? selected.alt : name;
  const placeholder = <div className={styles.placeholder} role="img" aria-label={`${name}：商品圖片尚未提供`}>商品圖片尚未提供</div>;
  const choose = (next: number) => setSelection({ index: next, activated: false });

  return (
    <section className={styles.gallery} aria-label={`${name} 商品媒體`}>
      <div className={styles.stage}>
        {!selected ? placeholder : selected.type === "image" || selection.activated ? (
          <KdMedia key={index} media={selected} alt={alt} eager={selected.type === "image" && index === 0}
            backgroundVideo={false} showPlayAffordance={selected.type === "video"} playLabel="播放商品影片"
            fallbackImageUrl={selected.type === "image" ? undefined : imageFallback} fallback={placeholder} />
        ) : (
          <>
            {preview || imageFallback ? <img src={preview || imageFallback} alt={alt} loading={index === 0 ? "eager" : "lazy"} decoding="async" /> : placeholder}
            <button type="button" className={styles.playButton} onClick={() => setSelection({ index, activated: true })}
              aria-label={`播放${name}的${selected.type === "youtube" ? "YouTube" : ""}影片`}>播放商品影片</button>
          </>
        )}
      </div>
      {mediaItems.length > 1 ? (
        <>
          <div className={styles.galleryControls}>
            <button type="button" onClick={() => choose(index - 1)} disabled={index === 0} aria-label="上一個商品媒體">上一張</button>
            <p aria-live="polite" aria-atomic="true">{index + 1} / {mediaItems.length}</p>
            <button type="button" onClick={() => choose(index + 1)} disabled={index === mediaItems.length - 1} aria-label="下一個商品媒體">下一張</button>
          </div>
          <div className={styles.thumbnails} role="group" aria-label="選擇商品媒體">
            {mediaItems.map((media, itemIndex) => {
              const thumbnail = storeProductMediaPreview(media);
              const label = media.type === "image" ? "圖片" : "影片";
              return (
                <button key={itemIndex} type="button" className={styles.thumbnail} aria-pressed={index === itemIndex}
                  aria-label={`${name}：${label} ${itemIndex + 1} / ${mediaItems.length}`} onClick={() => choose(itemIndex)}>
                  {thumbnail ? <img src={thumbnail} alt="" loading="lazy" decoding="async" /> : <span>{label}</span>}
                  {media.type !== "image" && thumbnail ? <span className={styles.mediaKind}>影片</span> : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}
