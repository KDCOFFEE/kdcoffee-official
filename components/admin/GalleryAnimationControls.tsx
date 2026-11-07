"use client";

import { useState } from "react";
import type { AssetRecord } from "@/lib/assets";
import type { MediaAsset } from "@/lib/media";
import { isCanonicalProductSlug } from "@/lib/productMediaNaming";
import MediaUploader from "./MediaUploader";
import HeroMediaLibraryPicker from "./HeroMediaLibraryPicker";
import css from "./GalleryAnimationControls.module.css";

const slots = [
  ["galleryDesktopAnimation", "桌機動畫"],
  ["galleryMobileAnimation", "手機動畫（選填）"],
] as const;
type Slot = typeof slots[number][0];

/** Optional asset roles on the existing work; uploads and saves use existing product APIs. */
export default function GalleryAnimationControls({ artworkSlug, assets, libraryAssets, onChange, onRemove }: {
  artworkSlug: string;
  assets?: Record<string, { media?: MediaAsset | null }>;
  libraryAssets: AssetRecord[];
  onChange: (slot: string, media: MediaAsset) => void;
  onRemove: (slot: string) => void;
}) {
  const [picker, setPicker] = useState<Slot | null>(null);
  const canUpload = isCanonicalProductSlug(artworkSlug);
  const reservedPublicIds = slots.flatMap(([slot]) => assets?.[slot]?.media?.publicId || []);
  return <section className={css.section} aria-label="作品詮釋動畫">
    <h3>作品詮釋動畫</h3>
    <p className="cms-help">此區設定作品動畫影片；下方進場效果控制文案。專屬於作品詮釋畫廊，不會更換商品 Hero 影片。手機動畫未設定時，將自動沿用桌機動畫並依手機版型裁切顯示。</p>
    {!canUpload && <p className="cms-help">請先儲存具有有效 Slug 的咖啡作品，再上傳新影片。</p>}
    <div className={css.grid}>
      {slots.map(([slot, label]) => <div className={css.card} key={slot}>
        <MediaUploader label={label} usage="product" videoOnly disabled={!canUpload} value={assets?.[slot]?.media}
          productMediaNaming={{ productSlug: artworkSlug, mediaPurpose: "interpretation", reservedPublicIds }}
          onChange={media => onChange(slot, media)} onRemove={() => onRemove(slot)}/>
        <button className={css.library} type="button" onClick={() => setPicker(slot)}>選擇既有媒體</button>
        {!assets?.[slot]?.media ? <p className="cms-help">尚未設定{slot === "galleryMobileAnimation" ? "，手機將沿用桌機動畫或作品圖片。" : "，畫廊將顯示作品圖片。"}</p> : null}
      </div>)}
    </div>
    {picker ? <HeroMediaLibraryPicker assets={libraryAssets} title="選擇作品詮釋動畫" usage="product" videoOnly
      onClose={() => setPicker(null)} onChoose={media => { onChange(picker, media); setPicker(null); }}/> : null}
  </section>;
}
