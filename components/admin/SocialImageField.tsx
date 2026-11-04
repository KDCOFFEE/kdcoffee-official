"use client";
/* eslint-disable @next/next/no-img-element -- runtime Asset Library images. */
import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { AssetRecord } from "@/lib/assets";
import { isSocialLibraryImage, type SocialImageValue } from "@/lib/socialImageSettings";
import AssetUploadButton from "./AssetUploadButton";
import ImageLibraryPicker from "./ImageLibraryPicker";
import styles from "./SocialImageField.module.css";

export default function SocialImageField({ value, assets, onChange, onUploaded, onBusy, label = "社群分享圖片", help = "未設定時，會使用作品主視覺或全站預設分享圖片。", disabled = false, variant = "default" }: {
  value?: SocialImageValue | null; assets: AssetRecord[]; onChange: (value: SocialImageValue | undefined) => void;
  onUploaded?: (asset: AssetRecord) => void | Promise<void>; onBusy?: (busy: boolean) => void; label?: string; help?: string; disabled?: boolean;
  variant?: "default" | "compact";
}) {
  const [picker, setPicker] = useState(false), [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const titleId = useId(), helpId = useId();
  const libraryButton = useRef<HTMLButtonElement>(null);
  function closePicker() {
    setPicker(false); requestAnimationFrame(() => libraryButton.current?.focus());
  }
  function pickerKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closePicker(); }
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]),input:not([disabled])"));
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  function choose(asset: AssetRecord) {
    if (!isSocialLibraryImage(asset)) { setMessage("請選擇 JPG、PNG 或 WebP 圖片。"); return; }
    onChange({ path: asset.path, alt: asset.alt || asset.name, assetId: asset.id });
    if (picker) closePicker(); else setPicker(false);
    setMessage("已選取圖片，請儲存設定。");
  }
  const Heading = variant === "compact" ? "h2" : "h3";
  return <section className={variant === "compact" ? `${styles.card} ${styles.compact}` : styles.card} aria-labelledby={titleId} aria-describedby={helpId} data-social-image-field>
    <Heading id={titleId} className={styles.heading}>{label}</Heading>
    <p className={styles.description}>分享網站連結到 LINE、Facebook、Messenger 等平台時顯示。</p>
    <div className={styles.content}>
    <div className={styles.preview}>{value?.path ? <img src={value.path} alt={value.alt || "分享圖片預覽"} /> : <div className={styles.empty}>尚未設定專屬分享圖片</div>}</div>
    <div className={styles.controls}>
    <p id={helpId} className={styles.help}>{help}</p>
    <div className={styles.actions}>
      <AssetUploadButton uploadUrl="/api/admin/assets/upload?purpose=social-share" accept="image/jpeg,image/png,image/webp" showStatus={false} className={styles.primary} disabled={disabled||uploading} label={value?.path ? "更換圖片" : "上傳圖片"} onUploadingChange={busy=>{setUploading(busy);if(busy)setMessage("");onBusy?.(busy);}} onError={setMessage}
        onUploaded={async asset => { await onUploaded?.(asset); choose(asset); }} />
      <button ref={libraryButton} type="button" className={styles.secondary} disabled={disabled||uploading} onClick={() => setPicker(true)}>從素材庫選擇</button>
      {value?.path ? <button type="button" className={styles.remove} disabled={disabled||uploading} onClick={() => { onChange(undefined); setMessage("已取消圖片設定，請儲存變更。"); }}>移除設定</button> : null}
    </div>
    <p className={styles.size}>建議尺寸 1200 × 630 px</p>
    {value?.path ? <p className={styles.note}>移除設定不會刪除素材庫中的原始圖片。</p> : null}
    {message ? <p className={styles.status} role="status" aria-live="polite">{message}</p> : null}
    </div></div>
    {picker ? <div className={styles.pickerScope} onKeyDownCapture={pickerKeys}><ImageLibraryPicker title="選擇分享圖片" assets={assets.filter(isSocialLibraryImage)} onClose={closePicker} onChoose={choose} /></div> : null}
  </section>;
}
