"use client";
/* eslint-disable @next/next/no-img-element -- runtime Asset Library images. */
import { useState } from "react";
import type { AssetRecord } from "@/lib/assets";
import { isSocialLibraryImage, type SocialImageValue } from "@/lib/socialImageSettings";
import AssetUploadButton from "./AssetUploadButton";
import ImageLibraryPicker from "./ImageLibraryPicker";

export default function SocialImageField({ value, assets, onChange, onUploaded, onBusy, label = "社群分享縮圖（Open Graph）", help = "未設定時，將使用作品主要圖片或全站預設分享圖。", disabled = false }: {
  value?: SocialImageValue | null; assets: AssetRecord[]; onChange: (value: SocialImageValue | undefined) => void;
  onUploaded?: (asset: AssetRecord) => void | Promise<void>; onBusy?: (busy: boolean) => void; label?: string; help?: string; disabled?: boolean;
}) {
  const [picker, setPicker] = useState(false), [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  function choose(asset: AssetRecord) {
    if (!isSocialLibraryImage(asset)) { setMessage("請選擇素材庫中的 JPG、PNG 或 WebP 公開圖片。"); return; }
    onChange({ path: asset.path, alt: asset.alt || asset.name, assetId: asset.id }); setPicker(false); setMessage("");
  }
  return <section className="cms-panel" aria-label={label}>
    <h3>{label}</h3><p>分享至 LINE、Facebook、Messenger 等平台時使用。建議尺寸 1200 × 630 px。</p><p>{help}</p>
    {value?.path ? <img src={value.path} alt={value.alt || "社群分享縮圖預覽"} style={{ width: "100%", maxWidth: 480, aspectRatio: "1200 / 630", objectFit: "contain", background: "#f4eee6" }} /> : <p>未設定專屬圖片，將依上述備援方式顯示。</p>}
    <div className="cms-toolbar-actions">
      <AssetUploadButton uploadUrl="/api/admin/assets/upload?purpose=social-share" accept="image/jpeg,image/png,image/webp" disabled={disabled||uploading} label={value?.path ? "上傳替換圖片" : "上傳分享圖片"} onUploadingChange={busy=>{setUploading(busy);onBusy?.(busy);}} onError={setMessage}
        onUploaded={async asset => { await onUploaded?.(asset); choose(asset); }} />
      <button type="button" disabled={disabled||uploading} onClick={() => setPicker(true)}>{value?.path ? "更換素材庫圖片" : "從素材庫選擇圖片"}</button>
      {value?.path ? <button type="button" disabled={disabled||uploading} onClick={() => onChange(undefined)}>移除分享圖片</button> : null}
    </div><small>移除只會取消此處的設定，不會刪除素材。選擇後請儲存設定。</small>
    {message ? <p role="alert">{message}</p> : null}
    {picker ? <ImageLibraryPicker title="選擇社群分享圖片" assets={assets.filter(isSocialLibraryImage)} onClose={() => setPicker(false)} onChoose={choose} /> : null}
  </section>;
}
