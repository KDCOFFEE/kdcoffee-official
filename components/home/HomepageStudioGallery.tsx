"use client";

import { useMemo, useRef, useState } from "react";
import KdMedia from "@/components/media/KdMedia";
import type { ResolvedHomepageMediaItem } from "@/components/home/HomepageMediaCollection";
import { primaryEnabledIndex } from "@/lib/homepageCms";

function thumbnailUrl(item: ResolvedHomepageMediaItem) {
  if (item.media.type === "image") return item.media.url;
  if (item.media.type === "youtube" && item.media.videoId) {
    return `https://i.ytimg.com/vi/${item.media.videoId}/mqdefault.jpg`;
  }
  return item.media.posterUrl;
}

export default function HomepageStudioGallery({ items }: { items: ResolvedHomepageMediaItem[] }) {
  const initialIndex = useMemo(() => {
    const primaryIndex = primaryEnabledIndex(items);
    return primaryIndex >= 0 ? primaryIndex : 0;
  }, [items]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);
  const requestedIndex = selectedId ? items.findIndex((item) => item.id === selectedId) : -1;
  const selectedIndex = requestedIndex >= 0 ? requestedIndex : initialIndex;
  const selected = items[selectedIndex] || items[0];
  if (!selected) return null;

  function select(index: number, focusStage = false) {
    stage.current?.querySelector("video")?.pause();
    setSelectedId(items[index]?.id || null);
    if (focusStage) window.requestAnimationFrame(() => stage.current?.focus());
  }

  return (
    <div className="v3-studio-gallery">
      <div className="v3-studio-stage" ref={stage} tabIndex={-1} aria-live="polite">
        <KdMedia key={selected.id} media={selected.media} alt={selected.alt} fallback={null} eager />
        {selected.title || selected.caption ? (
          <div className="v3-studio-caption">
            {selected.title ? <strong>{selected.title}</strong> : null}
            {selected.caption ? <span>{selected.caption}</span> : null}
          </div>
        ) : null}
      </div>
      {items.length > 1 ? (
        <div className="v3-studio-filmstrip" role="tablist" aria-label="工作室媒體選擇" tabIndex={0}>
          {items.map((item, index) => {
            const thumbnail = thumbnailUrl(item);
            const active = selected.id === item.id;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`${index + 1} / ${items.length}：${item.title || item.alt}${item.media.type === "image" ? "，圖片" : "，影片"}`}
                className={active ? "is-selected" : ""}
                key={item.id}
                onClick={() => select(index, true)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                  event.preventDefault();
                  const direction = event.key === "ArrowRight" ? 1 : -1;
                  const next = (index + direction + items.length) % items.length;
                  select(next);
                  (event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
                }}
              >
                {thumbnail ? <img src={thumbnail} alt="" loading="lazy" /> : <span aria-hidden="true">▶</span>}
                <small>{String(index + 1).padStart(2, "0")}</small>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
