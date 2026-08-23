"use client";

import { useState } from "react";
import MediaUploader from "./MediaUploader";
import { isCanonicalProductSlug } from "@/lib/productMediaNaming";
import {
  PRODUCT_CUSTOM_MEDIA_ALT_MAX_LENGTH,
  PRODUCT_CUSTOM_MEDIA_CAPTION_MAX_LENGTH,
  PRODUCT_CUSTOM_MEDIA_POSITIONS,
  type ProductCustomSection,
  type ProductCustomSectionMedia,
} from "@/lib/productCustomSections";
import { parseYouTubeUrl, youtubeEmbedUrl, youtubeWatchUrl, YouTubeUrlValidationError } from "@/lib/youtubeMedia";
import { isYouTubeAdminActionReady } from "@/lib/customSectionAdminActionFeedback";

const positionLabels: Record<ProductCustomSectionMedia["position"], string> = {
  full: "滿版／寬版媒體",
  "media-left": "媒體在左",
  "media-right": "媒體在右",
  "media-top": "媒體在上",
  "media-bottom": "媒體在下",
};

function readableBytes(bytes?: number) {
  if (!bytes) return "—";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export default function CustomSectionMediaEditor({
  section,
  productSlug,
  onChange,
}: {
  section: ProductCustomSection;
  productSlug: string;
  onChange: (next: ProductCustomSection) => void;
}) {
  const media = section.media;
  const cloudinaryMedia = media?.provider === "cloudinary" ? media : undefined;
  const youtubeMedia = media?.provider === "youtube" ? media : undefined;
  const [youtubeUrl, setYoutubeUrl] = useState(() => youtubeMedia ? youtubeWatchUrl(youtubeMedia.videoId) : "");
  const [youtubeTitle, setYoutubeTitle] = useState(() => youtubeMedia?.title || "");
  const [youtubeMessage, setYoutubeMessage] = useState("");
  const namingReady = isCanonicalProductSlug(productSlug);
  const activeYouTubeTitle = youtubeMedia?.title ?? youtubeTitle;
  const youtubeActionReady = isYouTubeAdminActionReady(youtubeUrl, activeYouTubeTitle);
  const setMedia = (next: ProductCustomSectionMedia | undefined) => onChange({ ...section, media: next });

  const addYouTubeVideo = () => {
    if (!youtubeActionReady) return;
    try {
      const replacing = Boolean(youtubeMedia);
      const videoId = parseYouTubeUrl(youtubeUrl);
      const title = activeYouTubeTitle.trim();
      setMedia({
        provider: "youtube",
        videoId,
        title,
        ...(media?.caption ? { caption: media.caption } : {}),
        position: media?.position || "media-top",
      });
      setYoutubeUrl(youtubeWatchUrl(videoId));
      setYoutubeMessage(replacing ? "✓ YouTube 影片已更換。還需要按『儲存商品』才會正式儲存。" : "✓ YouTube 影片已加入。還需要按『儲存商品』才會正式儲存。");
    } catch (error) {
      setYoutubeMessage(error instanceof YouTubeUrlValidationError ? error.message : "YouTube 影片網址格式不正確。");
    }
  };

  return <fieldset className="custom-section-editor-group custom-section-media-editor"><legend>媒體內容</legend>
    {!media ? <p className="custom-section-media-empty">此 Section 尚未加入圖片或影片。</p> : null}
    <div className="custom-section-youtube-editor">
      <h4>YouTube 影片</h4>
      <label>YouTube 影片網址<input type="url" value={youtubeUrl} placeholder="https://www.youtube.com/watch?v=…" onChange={(event) => { setYoutubeUrl(event.target.value); setYoutubeMessage(""); }} /><small>貼上 YouTube 影片網址即可，不需要嵌入碼。</small></label>
      <label>影片標題／替代說明<input maxLength={PRODUCT_CUSTOM_MEDIA_ALT_MAX_LENGTH} value={activeYouTubeTitle} onChange={(event) => {
        setYoutubeTitle(event.target.value);
        if (youtubeMedia) setMedia({ ...youtubeMedia, title: event.target.value });
      }} /></label>
      {!youtubeActionReady ? <p className="custom-section-action-helper">請先輸入 YouTube 網址與影片標題。</p> : null}
      <button type="button" className="custom-section-primary-action" onClick={addYouTubeVideo} disabled={!youtubeActionReady}>{youtubeMedia ? "更換 YouTube 影片" : "＋ 加入 YouTube 影片"}</button>
      {youtubeMedia ? <button type="button" className="kd-media-remove" onClick={() => setMedia(undefined)}>移除 YouTube 影片</button> : null}
      {youtubeMessage ? <p className="custom-section-action-status" role="status" aria-live="polite">{youtubeMessage}</p> : null}
      {youtubeMedia ? <div className="custom-section-youtube-preview"><iframe src={youtubeEmbedUrl(youtubeMedia.videoId)} title={youtubeMedia.title.trim() || "YouTube 影片預覽"} loading="lazy" allow="encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /></div> : null}
    </div>
    <MediaUploader
      label={cloudinaryMedia ? "更換 Section 媒體" : "新增圖片或上傳影片"}
      usage="product"
      value={cloudinaryMedia?.asset}
      disabled={!namingReady}
      imageActionLabel={cloudinaryMedia?.asset.type === "image" ? "更換圖片" : "新增圖片"}
      videoActionLabel={cloudinaryMedia?.asset.type === "video" ? "更換影片" : "新增影片"}
      productMediaNaming={{ productSlug, mediaPurpose: "custom-section", sectionId: section.id, reservedPublicIds: cloudinaryMedia?.asset.publicId ? [cloudinaryMedia.asset.publicId] : [] }}
      onChange={(asset) => setMedia({
        provider: "cloudinary",
        asset,
        alt: youtubeMedia?.title || cloudinaryMedia?.alt || "",
        ...(media?.caption ? { caption: media.caption } : {}),
        position: media?.position || "media-top",
      })}
      onRemove={media ? () => setMedia(undefined) : undefined}
    />
    {!namingReady ? <p className="kd-media-upload-message">請先設定有效的商品 slug，才能安全命名與上傳媒體。</p> : null}
    {cloudinaryMedia ? <>
      <div className="custom-section-media-meta"><span>{cloudinaryMedia.asset.type === "image" ? "圖片" : "影片"}</span><strong>{cloudinaryMedia.asset.publicId?.split("/").pop() || "Cloudinary 媒體"}</strong><small>{cloudinaryMedia.asset.width || "—"} × {cloudinaryMedia.asset.height || "—"} px · {readableBytes(cloudinaryMedia.asset.bytes)}</small></div>
      <label>替代文字（ALT）<input maxLength={PRODUCT_CUSTOM_MEDIA_ALT_MAX_LENGTH} value={cloudinaryMedia.alt} onChange={(event) => setMedia({ ...cloudinaryMedia, alt: event.target.value })} /><small>用於無障礙與搜尋引擎理解圖片內容。</small></label>
    </> : null}
    {youtubeMedia ? <div className="custom-section-media-meta"><span>YouTube</span><strong>{youtubeMedia.title}</strong><small>影片 ID：{youtubeMedia.videoId}</small></div> : null}
    {media ? <>
      <label>圖片／影片說明<textarea maxLength={PRODUCT_CUSTOM_MEDIA_CAPTION_MAX_LENGTH} rows={3} value={media.caption || ""} onChange={(event) => setMedia({ ...media, caption: event.target.value || undefined })} /><small>選填；只有非空白內容會顯示在媒體附近。</small></label>
      <label>媒體位置<select value={media.position} onChange={(event) => setMedia({ ...media, position: event.target.value as ProductCustomSectionMedia["position"] })}>{PRODUCT_CUSTOM_MEDIA_POSITIONS.map((position) => <option key={position} value={position}>{positionLabels[position]}</option>)}</select><small>本階段建立穩定位置契約；精緻視覺編排留待 G.3C.2B。</small></label>
      <details className="custom-section-media-advanced"><summary>進階資訊</summary>{cloudinaryMedia ? <dl><div><dt>Provider</dt><dd>{cloudinaryMedia.asset.provider}</dd></div><div><dt>Public ID</dt><dd><code>{cloudinaryMedia.asset.publicId}</code></dd></div><div><dt>格式</dt><dd>{cloudinaryMedia.asset.format || "—"}</dd></div>{cloudinaryMedia.asset.duration ? <div><dt>長度</dt><dd>{cloudinaryMedia.asset.duration.toFixed(1)} 秒</dd></div> : null}</dl> : <dl><div><dt>Provider</dt><dd>YouTube</dd></div><div><dt>Video ID</dt><dd><code>{youtubeMedia?.videoId}</code></dd></div></dl>}</details>
      {cloudinaryMedia ? <p className="custom-section-media-retention">更換、移除或刪除 Section 只會更新商品引用，不會自動刪除 Cloudinary 資產。</p> : null}
    </> : null}
  </fieldset>;
}
