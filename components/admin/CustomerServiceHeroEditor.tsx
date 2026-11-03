"use client";

/* eslint-disable @next/next/no-img-element -- runtime Asset Library previews use original canonical paths. */
import { useRef, useState, type KeyboardEvent } from "react";
import type { AssetRecord } from "@/lib/assets";
import { resolveAssetAlt } from "@/lib/assetMetadata";
import { DEFAULT_SERVICE_HERO, SERVICE_HERO_POSITIONS, serviceHeroPosition, type ServiceHero } from "@/lib/customerServiceHero";
import { isLocalAssetImagePath } from "@/lib/media";
import AssetUploadButton from "./AssetUploadButton";
import ImageLibraryPicker from "./ImageLibraryPicker";
import styles from "./CustomerServiceManager.module.css";

export default function CustomerServiceHeroEditor({ value, saved, disabled, onChange, onUploadingChange }: {
  value?: ServiceHero | null; saved?: ServiceHero | null; disabled: boolean;
  onChange: (hero: ServiceHero) => void; onUploadingChange: (busy: boolean) => void;
}) {
  const hero = value ?? { ...DEFAULT_SERVICE_HERO };
  const [assets, setAssets] = useState<AssetRecord[]>([]), [picker, setPicker] = useState(false), [loading, setLoading] = useState(false), [notice, setNotice] = useState("");
  const pickerButton = useRef<HTMLButtonElement>(null);
  const close = () => { setPicker(false); requestAnimationFrame(() => pickerButton.current?.focus()); };
  const choose = (asset: AssetRecord) => {
    onChange({ src: asset.path, alt: resolveAssetAlt(asset), position: "center" }); close();
  };
  async function openPicker() {
    setLoading(true); setNotice("");
    try {
      const response = await fetch("/api/admin/assets", { cache: "no-store" }), result = await response.json();
      if (!response.ok || !Array.isArray(result.assets)) throw new Error("素材庫暫時無法讀取，請重試。");
      setAssets(result.assets.filter((asset: AssetRecord) => asset.status === "active" && isLocalAssetImagePath(asset.path))); setPicker(true);
    } catch (error) { setNotice(error instanceof Error ? error.message : "素材庫無法讀取。"); }
    finally { setLoading(false); }
  }
  function modalKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]),input"));
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return <section className={styles.media} aria-labelledby="service-hero-media-title">
    <h3 id="service-hero-media-title">主視覺圖片</h3>
    <p>建議至少 1600px 寬，4:3 或接近 3:2；主體請避免緊貼邊緣。桌機與手機會有不同裁切。</p>
    <div className={styles.heroPreviews}>
      <figure aria-label="主視覺桌機版預覽"><div className={styles.desktopCrop}><img src={hero.src} alt={hero.alt} style={{ objectPosition: serviceHeroPosition(hero) }}/></div><figcaption>桌機版預覽</figcaption></figure>
      <figure aria-label="主視覺手機版預覽"><div className={styles.mobileCrop}><img src={hero.src} alt={hero.alt} style={{ objectPosition: serviceHeroPosition(hero, true) }}/></div><figcaption>手機版預覽</figcaption></figure>
    </div>
    <div className={styles.mediaActions}>
      <AssetUploadButton showStatus={false} uploadUrl="/api/admin/customer-service" disabled={disabled} onUploadingChange={onUploadingChange} onError={setNotice} onUploaded={asset => { onChange({ src: asset.path, alt: resolveAssetAlt(asset), position: "center" }); setAssets(current => [...current.filter(item => item.id !== asset.id), asset]); setNotice("圖片已更新，儲存後會顯示在客服頁。"); }}/>
      <button ref={pickerButton} type="button" disabled={disabled || loading} onClick={() => void openPicker()}>{loading ? "讀取素材庫…" : "從素材庫選擇圖片"}</button>
      <button type="button" disabled={disabled} onClick={() => onChange({ ...(saved ?? DEFAULT_SERVICE_HERO) })}>回復已儲存圖片</button>
      <button type="button" disabled={disabled} onClick={() => onChange({ ...DEFAULT_SERVICE_HERO })}>使用原始圖片</button>
    </div>
    <p className={styles.hint}>支援 12 MB 以內的 JPG、PNG、WebP；圖片會自動調整為適合網站的格式。選好圖片後，請儲存客服內容。</p>
    {notice && <p role="status" className={styles.hint}>{notice}</p>}
    <div className={styles.fields}>
      <label className={styles.field}>主視覺圖片描述<input aria-label="主視覺圖片描述" aria-describedby="service-hero-alt-help" value={hero.alt} maxLength={300} onChange={event => onChange({ ...hero, alt: event.target.value })}/><small id="service-hero-alt-help">請填寫圖片描述；沒有可用的素材描述時會留空，需填寫後才能儲存。</small></label>
      <label className={styles.field}>圖片裁切位置<select aria-label="圖片裁切位置" value={hero.position} onChange={event => onChange({ ...hero, position: event.target.value as ServiceHero["position"] })}>{Object.entries(SERVICE_HERO_POSITIONS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    </div>
    {picker && <div onKeyDownCapture={modalKeys}><ImageLibraryPicker assets={assets} onChoose={choose} onClose={close}/></div>}
  </section>;
}
