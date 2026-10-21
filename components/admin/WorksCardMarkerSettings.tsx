"use client";

import { isWorksSoldOutText, type WorksSoldOutPresentation } from "@/lib/worksPageCms";
import { worksSoldOutPresentationBindings } from "@/lib/worksSoldOutPresentation";
import type { MediaAsset } from "@/lib/media";
import MediaUploader from "@/components/admin/MediaUploader";
import WorksCardMarkerVisual from "@/components/works/WorksCardMarkerVisual";
import styles from "./WorksPageManager.module.css";

export default function WorksCardMarkerSettings({ value, onChange, uploadImage, title = "作品缺貨顯示", textEditable = true }: {
  title?: string; textEditable?: boolean;
  value: WorksSoldOutPresentation; onChange: (value: WorksSoldOutPresentation) => void;
  uploadImage: (file: File) => Promise<MediaAsset>;
}) {
  const invalid = !isWorksSoldOutText(value.text);
  const preview = worksSoldOutPresentationBindings(value);
  const positions = <><option value="top">上方</option><option value="center">中央</option><option value="bottom">下方</option></>;
  return <section className={styles.contentCard} aria-labelledby="works-sold-out-title">
    <header><div><h3 id="works-sold-out-title">{title}</h3>
      <p>僅影響公開作品卡片的標示呈現，不會修改商品庫存。</p></div></header>
    <div className={"cms-grid two " + styles.compactFields}>
      <label htmlFor="works-sold-out-source">標示來源
        <select id="works-sold-out-source" value={value.mode} onChange={event => onChange({ ...value, mode: event.target.value as WorksSoldOutPresentation["mode"] })}>
          <option value="text">文字</option><option value="image">圖片</option>
        </select>
      </label>
      <label htmlFor="works-sold-out-position">{value.mode === "image" ? "圖片位置" : "文字位置"}
        <select id="works-sold-out-position" value={value.textPosition} onChange={event => onChange({ ...value, textPosition: event.target.value as WorksSoldOutPresentation["textPosition"] })}>{positions}</select>
      </label>
      {value.mode === "text" ? <>
        <label className="span-two" htmlFor="works-sold-out-text">標示文字
          <input id="works-sold-out-text" type="text" value={value.text} readOnly={!textEditable} aria-invalid={invalid}
            aria-describedby="works-sold-out-text-hint" onChange={event => onChange({ ...value, text: event.target.value })} />
          {!textEditable && <small>自訂文字沿用個別作品的既有 Product.tag；此處只設定共用樣式。</small>}
          <small id="works-sold-out-text-hint">{Array.from(value.text).length}/40 字元 · 純文字呈現，不使用底板。</small>
          {invalid && <small role="alert">請輸入 1–40 個有效字元，不可留白或換行。</small>}
        </label>
        <label htmlFor="works-sold-out-font-size">文字大小：{value.textFontSize}px
          <input id="works-sold-out-font-size" type="range" min="12" max="48" step="1" value={value.textFontSize}
            onChange={event => onChange({ ...value, textFontSize: Number(event.target.value) })} />
        </label>
        <label htmlFor="works-sold-out-color">文字顏色
          <input id="works-sold-out-color" type="color" value={value.textColor} onChange={event => onChange({ ...value, textColor: event.target.value })} />
        </label>
      </> : <div className="span-two">
        <MediaUploader label="透明標示圖片" value={value.imageAsset?.media} imageOnly
          imageActionLabel={value.imageAsset ? "替換標示圖片" : "上傳標示圖片"}
          onImageUpload={async file => {
            if (!["image/png", "image/webp"].includes(file.type) || !/\.(png|webp)$/i.test(file.name))
              throw new Error("請選擇透明 PNG / WebP 圖片。");
            return uploadImage(file);
          }}
          onChange={media => onChange({ ...value, imageAsset: { media, alt: "作品卡標示" } })}
          onRemove={() => { const { imageAsset: _removed, ...rest } = value; onChange(rest); }} />
        <small>沿用網站圖片最佳化與資產登錄。建議使用透明 PNG / WebP；未選圖片時以標示文字顯示。</small>
      <label htmlFor="works-marker-image-size">圖片大小：{value.imageSize ?? 65}%
        <input id="works-marker-image-size" type="range" min="20" max="90" step="1" value={value.imageSize ?? 65}
          onChange={event => onChange({ ...value, imageSize: Number(event.target.value) })} />
      </label></div>}
      <label htmlFor="works-sold-out-dim-mode">暗壓方式
        <select id="works-sold-out-dim-mode" value={value.dimMode} onChange={event => onChange({ ...value, dimMode: event.target.value as WorksSoldOutPresentation["dimMode"] })}>
          <option value="none">不壓暗</option><option value="band">腰帶式暗壓</option><option value="full">全圖均勻壓暗</option>
        </select>
      </label>
      {value.dimMode === "band" && <>
        <label htmlFor="works-sold-out-band-position">暗壓位置
          <select id="works-sold-out-band-position" value={value.bandPosition} onChange={event => onChange({ ...value, bandPosition: event.target.value as WorksSoldOutPresentation["bandPosition"] })}>{positions}</select>
        </label>
        <label htmlFor="works-sold-out-band-size">暗壓高度：{value.bandSize}%
          <input id="works-sold-out-band-size" type="range" min="10" max="60" step="1" value={value.bandSize}
            onChange={event => onChange({ ...value, bandSize: Number(event.target.value) })} />
        </label>
        <label htmlFor="works-marker-feather">暗帶柔邊：{value.bandFeather ?? 0}%
          <input id="works-marker-feather" type="range" min="0" max="40" step="1" value={value.bandFeather ?? 0}
            onChange={event => onChange({ ...value, bandFeather: Number(event.target.value) })} />
        </label>
      </>}
      {value.dimMode !== "none" && <label htmlFor="works-sold-out-strength">明暗強度：{value.dimStrength}%
        <input id="works-sold-out-strength" type="range" min="0" max="100" step="1" value={value.dimStrength}
          onChange={event => onChange({ ...value, dimStrength: Number(event.target.value) })} />
      </label>}
    </div>
    <figure style={{ margin: "18px 0 0" }}>
      <figcaption style={{ marginBottom: 8, fontSize: 12 }}>即時預覽（儲存前）</figcaption>
      <div role="img" aria-label="標示即時預覽" data-sold-out-preview
        style={{ position: "relative", isolation: "isolate", overflow: "hidden", width: 240, maxWidth: "100%", aspectRatio: "4 / 5", borderRadius: 6, background: "linear-gradient(145deg,#c9b599,#6b7b75 55%,#b09373)" }}>
        <span style={{ position: "absolute", top: 13, left: 14, fontSize: 9, color: "#fff" }}>01</span>
        <span data-works-sold-out-presentation data-display-mode={preview.displayMode} data-dim-mode={value.dimMode} style={preview.frameStyle}>
          <WorksCardMarkerVisual value={value} />
        </span>
      </div>
    </figure>
    <p className="cms-message">變更後請按上方「儲存全部」。</p>
  </section>;
}
