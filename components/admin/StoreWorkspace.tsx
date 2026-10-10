"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import type { AssetRecord } from "@/lib/assets";
import type { MediaAsset } from "@/lib/media";
import type { StoreCatalog, StoreMediaReference, StoreProduct, StoreHeroSettings, StoreHeroTiming } from "@/lib/storeTypes";
import { newStoreAdminDraft, storeDraftPayload, changeStoreDraftSection, selectedStoreMedia, moveStoreGallery, type StoreAdminDraft, type StoreAdminKind } from "@/lib/storeAdminDraft";
import { storeSeoPreview } from "@/lib/storeSeo";
import MediaUploader from "@/components/admin/MediaUploader";
import HeroMediaLibraryPicker from "@/components/admin/HeroMediaLibraryPicker";
import ImageLibraryPicker from "@/components/admin/ImageLibraryPicker";
import { publicStoreHero, DEFAULT_STORE_HERO, resolveStoreHeroTiming, storeHeroStyle } from "@/lib/storeHero";
import { TYPOGRAPHY_SIZE_RANGES, VISUAL_COLOR_PRESETS, visualColorHex } from "@/lib/pageBuilderVisualStyle";
import heroMotionStyles from "@/components/store/StoreHeroMotion.module.css";
import { uploadStoreHeroImage, storeHeroLibraryAssets, type StoreHeroMediaTarget } from "@/lib/storeHeroMedia";
import KdMedia from "@/components/media/KdMedia";
import styles from "./StoreWorkspace.module.css";

const labels = { sections: "銷售專區", categories: "商品分類", products: "商品" };
type View = StoreAdminKind | "settings";
type Row = StoreCatalog[StoreAdminKind][number];

export default function StoreWorkspace({ initialCatalog, pointDisplayName }: { initialCatalog: StoreCatalog; pointDisplayName: string }) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const [view, setView] = useState<View>("sections");
  const [draft, setDraft] = useState<StoreAdminDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [library, setLibrary] = useState<"hero" | "gallery" | null>(null);
  const [uploadId, setUploadId] = useState("");
  const [heroDraft, setHeroDraft] = useState<StoreHeroSettings>(() => structuredClone(initialCatalog.settings?.hero || {}));
  const [heroPicker, setHeroPicker] = useState<StoreHeroMediaTarget | null>(null);
  const [heroPreviewKey, setHeroPreviewKey] = useState(0);
  const [heroPreviewMobile, setHeroPreviewMobile] = useState(false);
  const selectionVersion = useRef(0);
  const editorVersion = selectionVersion.current;

  const kind: StoreAdminKind = view === "settings" ? "sections" : view;
  const rows: Row[] = view === "settings" ? [] : catalog[kind];
  const liveSections = catalog.sections.filter(item => !item.archivedAt);
  const categories = catalog.categories.filter(item => item.sectionId === draft?.sectionId && (!item.archivedAt || draft?.archivedAt));
  const filtered = rows.filter(item => (showArchived || !item.archivedAt) && (!sectionFilter || !("sectionId" in item) || item.sectionId === sectionFilter) && `${item.name} ${item.slug} ${"sku" in item ? item.sku : ""}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const seo = draft ? storeSeoPreview({ name: draft.name || "", shortDescription: draft.shortDescription || "", description: draft.description || "", seoTitle: draft.seoTitle, seoDescription: draft.seoDescription }) : null;
  const archived = Boolean(draft?.archivedAt);

  function canLeave() { return !dirty || window.confirm("目前有尚未儲存的變更，確定離開此資料？"); }
  function choose(next: View, row?: Row) {
    if (busy || !canLeave()) return;
    selectionVersion.current += 1;
    setView(next); setDraft(row ? structuredClone(row) : null); setDirty(false); setConflict(false); setMessage(""); setQuery(""); setSectionFilter(""); setLibrary(null);
    setUploadId(`cs-${globalThis.crypto.randomUUID()}`);
    setHeroDraft(structuredClone(catalog.settings?.hero || {})); setHeroPicker(null); setHeroPreviewKey(0);
  }
  function create() {
    if (!canLeave()) return;
    selectionVersion.current += 1;
    setDraft(newStoreAdminDraft(kind, liveSections[0]?.id)); setDirty(false); setConflict(false); setMessage("填寫資料後儲存，即可建立新資料。"); setUploadId(`cs-${globalThis.crypto.randomUUID()}`);
  }
  function change(values: StoreAdminDraft) { setDraft(current => current ? { ...current, ...values } : current); setDirty(true); }
  async function reload(selectId = draft?.id, discard = true) {
    if (discard && !canLeave()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/store", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "重新載入失敗。");
      const next = result as StoreCatalog;
      selectionVersion.current += 1;
      setHeroDraft(structuredClone(next.settings?.hero || {})); setHeroPicker(null); setHeroPreviewKey(0);
      setCatalog(next); setDraft(selectId ? next[kind].find(item => item.id === selectId) || null : null); setDirty(false); setConflict(false); setMessage("已重新載入最新資料。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "重新載入失敗。"); }
    finally { setBusy(false); }
  }
  function changeHero(values: Partial<StoreHeroSettings>) {
    setHeroDraft(current => ({ ...current, ...values }));
    setDirty(true);
  }
  async function saveHero(event: FormEvent) {
    event.preventDefault();
    if (busy || conflict) return;
    setBusy(true); setMessage("儲存中…");
    try {
      const response = await fetch("/api/admin/store/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: catalog.revision,
          changes: { title: heroDraft.title || null, subtitle: heroDraft.subtitle || null, backgroundImage: heroDraft.backgroundImage || null, mobileBackgroundImage: heroDraft.mobileBackgroundImage || null, titleFontSize: heroDraft.titleFontSize ?? null, titleColor: heroDraft.titleColor ?? null, subtitleFontSize: heroDraft.subtitleFontSize ?? null, subtitleColor: heroDraft.subtitleColor ?? null, motionEnabled: heroDraft.motionEnabled ?? null, timing: heroDraft.timing ?? null },
        }),
      });
      const result = await response.json();
      if (!response.ok) { if (response.status === 409) setConflict(true); throw new Error(result.error || "主視覺儲存失敗。"); }
      setCatalog(result);
      setHeroDraft(structuredClone(result.settings?.hero || {}));
      setDirty(false); setMessage("商店主視覺已儲存。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "主視覺儲存失敗。"); }
    finally { setBusy(false); }
  }
  async function openHeroLibrary(target: StoreHeroMediaTarget) {
    if (busy || conflict) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/assets", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.assets)) throw new Error(result.error || "素材庫讀取失敗。");
      setAssets(result.assets); setHeroPicker(target); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "素材庫讀取失敗。"); }
    finally { setBusy(false); }
  }
  async function uploadHeroImage(file: File, target: StoreHeroMediaTarget) {
    setBusy(true); setMessage("圖片上傳中…");
    try { return await uploadStoreHeroImage(file, target); }
    finally { setBusy(false); }
  }
  function applyHeroImage(media: MediaAsset, target: StoreHeroMediaTarget, alt?: string) {
    if (view !== "settings" || editorVersion !== selectionVersion.current) return;
    if (media.type !== "image") { setMessage("商店 Hero 只接受圖片。"); return; }
    const key = target === "desktop" ? "backgroundImage" : "mobileBackgroundImage";
    setHeroDraft(current => ({ ...current, [key]: selectedStoreMedia(media, alt ?? current[key]?.alt) }));
    setDirty(true); setHeroPicker(null); setMessage("圖片已選擇，請儲存主視覺。");
  }
  function heroMediaEditor(target: StoreHeroMediaTarget) {
    const key = target === "desktop" ? "backgroundImage" : "mobileBackgroundImage";
    const current = heroDraft[key];
    const display = publicStoreHero(heroDraft);
    const preview = target === "desktop" ? display.backgroundImage : display.mobileBackgroundImage;
    const heading = target === "desktop" ? "桌機 Hero 素材" : "手機 Hero 素材（選填）";
    return <section className={styles.heroMediaPanel} aria-labelledby={`store-hero-${target}-heading`}>
      <h4 id={`store-hero-${target}-heading`}>{heading}</h4>
      <p className={styles.help}>{target === "mobile" ? current ? "手機使用此獨立圖片。" : "未設定時自動使用桌機 Hero。" : current ? "目前使用自訂桌機 Hero。" : "目前使用預設咖啡情境圖。"}</p>
      <div className={styles.heroPreview}><img src={preview.url} alt={preview.alt} /></div>
      <MediaUploader key={`${target}-${editorVersion}`} label={heading} usage="hero" imageOnly disabled={busy || conflict} showPreview={false}
        imageActionLabel="選擇圖片 / 上傳圖片" onImageUpload={file => uploadHeroImage(file, target)}
        onChange={media => applyHeroImage(media, target)} />
      <div className={styles.actions}>
        <button type="button" onClick={() => openHeroLibrary(target)}>從素材庫選擇</button>
        <button type="button" disabled={!current || busy || conflict} onClick={() => changeHero({ [key]: undefined })}>{target === "desktop" ? "移除桌機圖片引用" : "移除手機覆蓋"}</button>
      </div>
      <label className={styles.field}>{target === "desktop" ? "桌機 Hero ALT" : "手機 Hero ALT"}<input maxLength={300} disabled={!current} value={current?.alt || ""} onChange={event => { if (current) changeHero({ [key]: { ...current, alt: event.target.value } }); }} /></label>
    </section>;
  }
  const heroDisplay = publicStoreHero(heroDraft);
  function heroColorControl(key: "titleColor" | "subtitleColor", label: string) {
    const names = { ink: "咖啡黑", coffee: "深咖啡", "warm-gray": "暖灰", ivory: "暖白", gold: "品牌金", white: "純白" };
    return <div className={styles.heroColorControl}><p>{label}</p><div className={styles.heroSwatches}>
      {VISUAL_COLOR_PRESETS.map(preset => <button type="button" key={preset} aria-label={`${label}：${names[preset]}`} aria-pressed={heroDisplay[key] === preset} title={visualColorHex(preset)} onClick={() => changeHero({ [key]: preset })}><i style={{ backgroundColor: visualColorHex(preset) }} /><span>{names[preset]}</span></button>)}
      <label>{label}自訂色<input type="color" value={visualColorHex(heroDisplay[key])} onChange={event => changeHero({ [key]: event.target.value as `#${string}` })} /></label>
    </div></div>;
  }
  function heroSizeControl(key: "titleFontSize" | "subtitleFontSize", label: string) {
    const role = key === "titleFontSize" ? "heading" : "body";
    const [min, max] = TYPOGRAPHY_SIZE_RANGES[role].desktop;
    return <label className={styles.field}>{label}<input type="number" min={min} max={max} step={1} value={heroDraft[key] ?? heroDisplay[key]} onChange={event => changeHero({ [key]: Number(event.target.value) })} /><small>{min}–{max} px；手機沿用既有安全字級範圍調整。</small></label>;
  }
  function heroTimingControl(key: keyof StoreHeroTiming, label: string) {
    const update = (seconds: number) => changeHero({ timing: resolveStoreHeroTiming({ ...heroDisplay.timing, [key]: Math.round(Math.max(0, Math.min(10, Number.isFinite(seconds) ? seconds : 0)) * 10) * 100 }) });
    return <label className={styles.field}>{label}<input type="range" min={0} max={10} step={0.1} value={heroDisplay.timing[key] / 1000} onChange={event => update(Number(event.target.value))} /><span><input aria-label={`${label}秒數`} type="number" min={0} max={10} step={0.1} value={(heroDisplay.timing[key] / 1000).toFixed(1)} onChange={event => update(Number(event.target.value))} /> 秒</span></label>;
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || conflict || busy) return;
    setBusy(true); setMessage("儲存中…");
    try {
      const values = storeDraftPayload(kind, draft);
      const payload = draft.id ? { id: draft.id, expectedRevision: draft.revision, action: "update", changes: values } : values;
      const response = await fetch(`/api/admin/store/${kind}`, { method: draft.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) { if (response.status === 409) setConflict(true); throw new Error(result.error || "儲存失敗。"); }
      const read = await fetch("/api/admin/store", { cache: "no-store" });
      const updated = await read.json();
      if (!read.ok) { setDraft(result); setDirty(false); setMessage("已儲存，但清單重新載入失敗。請重新載入確認。"); return; }
      setCatalog(updated); setDraft(result); setDirty(false); setMessage("已儲存。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "儲存失敗。"); }
    finally { setBusy(false); }
  }
  async function archive() {
    if (!draft?.id || busy || conflict || archived) return;
    const explanation = kind === "sections" ? "此專區與所屬分類、商品將一併封存並取消發布。" : kind === "categories" ? "此分類與所屬商品將一併封存並取消發布。" : "此商品將封存並取消發布。";
    if (!window.confirm(`${explanation}\n封存保留資料，無法在此工作區還原。\n確定封存「${draft.name}」？${dirty ? "\n尚未儲存的變更不會寫入。" : ""}`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/store/${kind}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: draft.id, expectedRevision: draft.revision, action: "archive" }) });
      const result = await response.json();
      if (!response.ok) { if (response.status === 409) setConflict(true); throw new Error(result.error || "封存失敗。"); }
      setDraft(result); setDirty(false); setShowArchived(true);
      const read = await fetch("/api/admin/store", { cache: "no-store" });
      if (read.ok) setCatalog(await read.json());
      setMessage("已封存，資料與關聯皆保留。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "封存失敗。"); }
    finally { setBusy(false); }
  }
  async function openLibrary(target: "hero" | "gallery") {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/assets", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "素材庫讀取失敗。");
      setAssets(result.assets); setLibrary(target);
    } catch (error) { setMessage(error instanceof Error ? error.message : "素材庫讀取失敗。"); }
    finally { setBusy(false); }
  }
  function applyMedia(media: MediaAsset, target: "hero" | "gallery") {
    if (!draft || editorVersion !== selectionVersion.current) return;
    setDraft(current => {
      if (!current) return current;
      if (target === "hero") return { ...current, heroMedia: selectedStoreMedia(media, current.heroMedia?.alt) };
      if ((current.gallery?.length || 0) >= 24) return current;
      return { ...current, gallery: [...(current.gallery || []), selectedStoreMedia(media)] };
    });
    setDirty(true);
    setLibrary(null);
    setUploadId(`cs-${globalThis.crypto.randomUUID()}`);
  }
  function field(label: string, key: keyof StoreAdminDraft, options: { type?: string; max?: number; multiline?: boolean; required?: boolean; step?: string } = {}) {
    const value = draft?.[key];
    return <label className={styles.field}>{label}{options.multiline ? <textarea value={typeof value === "string" ? value : ""} maxLength={options.max} rows={key === "description" ? 6 : 3} onChange={event => change({ [key]: event.target.value })} /> : <input type={options.type || "text"} required={options.required} maxLength={options.max} min={options.type === "number" ? 0 : undefined} step={options.step || (options.type === "number" ? "1" : undefined)} value={typeof value === "string" || typeof value === "number" ? value : ""} onChange={event => change({ [key]: options.type === "number" ? (key === "salePrice" && event.target.value === "" ? undefined : Number(event.target.value)) : event.target.value })} />}</label>;
  }
  function checkbox(label: string, key: keyof StoreAdminDraft) { return <label className={styles.check}><input type="checkbox" checked={draft?.[key] === true} onChange={event => change({ [key]: event.target.checked })} />{label}</label>; }
  function mediaCard(media: StoreMediaReference, index?: number) {
    const galleryBlocked = busy || archived || conflict;
    return <article className={styles.mediaCard} key={index ?? "hero"}>
      <div className={styles.mediaPreview}><KdMedia media={media} alt={media.alt} eager /></div>
      <label className={styles.field}>ALT 替代文字<input maxLength={300} value={media.alt} onChange={event => { if (index === undefined) change({ heroMedia: { ...media, alt: event.target.value } }); else change({ gallery: draft!.gallery!.map((item, i) => i === index ? { ...item, alt: event.target.value } : item) }); }} /></label>
      {index === undefined ? <div className={styles.actions}><button type="button" onClick={() => change({ heroMedia: undefined })}>移除此引用</button></div> :
        <div className={`${styles.actions} ${styles.galleryActions}`} role="group" aria-label={`商品相簿第 ${index + 1} 項操作`}>
          <button type="button" aria-label={`商品相簿第 ${index + 1} 項上移`} disabled={galleryBlocked || index === 0} onClick={() => change({ gallery: moveStoreGallery(draft!.gallery!, index, -1) })}>上移</button>
          <button type="button" aria-label={`商品相簿第 ${index + 1} 項下移`} disabled={galleryBlocked || index === draft!.gallery!.length - 1} onClick={() => change({ gallery: moveStoreGallery(draft!.gallery!, index, 1) })}>下移</button>
          <button type="button" aria-label={`移除商品相簿第 ${index + 1} 項引用`} disabled={galleryBlocked} onClick={() => change({ gallery: draft!.gallery!.filter((_, i) => i !== index) })}>移除</button>
        </div>}
    </article>;
  }

  return <main className={styles.workspace}>
    <header className={styles.header}><div><Link href="/admin">← 返回營運中心</Link><p className={styles.eyebrow}>STORE WORKSPACE</p><h1>商店工作區</h1><p>集中管理銷售專區、商品分類與一般零售商品。</p></div><button type="button" disabled={busy} onClick={() => reload()}>重新載入</button></header>
    <nav className={styles.tabs} aria-label="Store 工作區">{(["sections", "categories", "products", "settings"] as View[]).map(item => <button type="button" key={item} aria-current={view === item ? "page" : undefined} disabled={busy} onClick={() => choose(item)}>{item === "settings" ? "設定" : labels[item]}</button>)}</nav>
    <div role={conflict ? "alert" : "status"} aria-live="polite" className={`${styles.message} ${conflict ? styles.conflict : ""}`}>{conflict ? "資料已被其他操作更新，請重新載入後再儲存。您的未儲存內容仍保留於畫面。" : message || (dirty ? "有尚未儲存的變更。" : "選擇左側資料，或新增一筆資料。")}{conflict && <button type="button" disabled={busy} onClick={() => reload()}>重新載入最新版本</button>}</div>
    {view === "settings" ? <section className={styles.settings}><h2>商店設定</h2>
      <form onSubmit={saveHero} className={styles.heroSettings}>
        <h3>商店首頁主視覺</h3>
        <p className={styles.help}>留空使用預設文案與咖啡情境圖。圖片與 ALT 只修改 Store 引用，不刪除素材。</p>
        <fieldset className={styles.fields} disabled={busy || conflict}>
          <label className={styles.field}>Hero 標題<input maxLength={200} placeholder="KD Coffee 商店" value={heroDraft.title || ""} onChange={event => changeHero({ title: event.target.value })} /></label>
          <label className={styles.field}>Hero 副標<textarea maxLength={500} rows={3} placeholder="為日常咖啡，選一件真正喜歡的器物。" value={heroDraft.subtitle || ""} onChange={event => changeHero({ subtitle: event.target.value })} /></label>
          <div className={styles.heroStyleGroups}>
            <section className={styles.heroStyleGroup}><h4>主標題樣式</h4>{heroSizeControl("titleFontSize", "主標題字體大小")}{heroColorControl("titleColor", "主標題文字顏色")}</section>
            <section className={styles.heroStyleGroup}><h4>副標／內文樣式</h4>{heroSizeControl("subtitleFontSize", "副標字體大小")}{heroColorControl("subtitleColor", "副標文字顏色")}</section>
          </div>
          <div className={styles.heroMediaEditors}>{heroMediaEditor("desktop")}{heroMediaEditor("mobile")}</div>
          <section className={styles.heroAnimation}><h4>主視覺進場動畫</h4><p className={styles.help}>沿用首頁 Hero 的圖片與文字進場節奏。減少動態偏好會自動停用；前台只進場一次。</p>
            <label className={styles.check}><input type="checkbox" checked={heroDisplay.motionEnabled} onChange={event => changeHero({ motionEnabled: event.target.checked })} />啟用主視覺進場動畫</label>
            <div className={styles.grid}>{heroTimingControl("mediaDuration", "圖片浮現時間")}{heroTimingControl("headlineLine1Start", "主標題開始")}{heroTimingControl("leadStart", "副標開始")}</div>
            <div className={styles.actions}><button type="button" onClick={() => changeHero({ timing: { ...DEFAULT_STORE_HERO.timing } })}>恢復首頁進場節奏</button><button type="button" onClick={() => { setHeroPreviewKey(key => key + 1); }}>預覽進場動畫</button><button type="button" onClick={() => changeHero({ titleFontSize: undefined, titleColor: undefined, subtitleFontSize: undefined, subtitleColor: undefined, motionEnabled: undefined, timing: undefined })}>恢復主視覺樣式</button></div>
          </section>
          <section className={styles.heroAppearancePreview} aria-label="商店主視覺即時預覽"><h4>主視覺即時預覽</h4>
            <div className={styles.actions}><button type="button" aria-pressed={!heroPreviewMobile} onClick={() => setHeroPreviewMobile(false)}>桌機預覽</button><button type="button" aria-pressed={heroPreviewMobile} onClick={() => setHeroPreviewMobile(true)}>手機預覽</button></div>
            <div key={heroPreviewKey} className={`${styles.heroAppearanceFrame} ${heroPreviewMobile ? styles.heroAppearanceMobile : ""} ${heroMotionStyles.motion}`} data-store-hero-motion={heroDisplay.motionEnabled && heroPreviewKey > 0 ? "on" : "off"} style={storeHeroStyle(heroDisplay)}>
              <img src={(heroPreviewMobile ? heroDisplay.mobileBackgroundImage : heroDisplay.backgroundImage).url} alt={(heroPreviewMobile ? heroDisplay.mobileBackgroundImage : heroDisplay.backgroundImage).alt} />
              <div><h2>{heroDisplay.title}</h2><p>{heroDisplay.subtitle}</p></div>
            </div><p className={styles.help}>即時顯示尚未儲存的文案、字級、顏色與圖片。動畫只會在按下預覽時重播。</p>
          </section>
          <div className={styles.actions}><button type="submit" className={styles.primary}>儲存主視覺</button></div>
        </fieldset>
      </form>
      <dl><dt>商品點數前台名稱</dt><dd>{pointDisplayName}</dd><dt>定期購資格</dt><dd>一般零售商品固定為 false。</dd></dl><p>商品只儲存自己的 PV 值。顯示名稱由既有全站設定管理。</p><Link href="/admin/membership">前往既有會員與制度設定</Link><p>請先建立銷售專區，再建立分類與商品。</p></section> : <div className={styles.columns}>
      <aside className={styles.list}><div className={styles.listHead}><h2>{labels[kind]}</h2><button type="button" disabled={busy || (kind !== "sections" && !liveSections.length)} onClick={create}>＋ 新增</button></div>{kind !== "sections" && !liveSections.length && <p>請先建立銷售專區。</p>}<label className={styles.field}>搜尋名稱、Slug 或 SKU<input value={query} onChange={event => setQuery(event.target.value)} /></label>{kind !== "sections" && <label className={styles.field}>依銷售專區篩選<select value={sectionFilter} onChange={event => setSectionFilter(event.target.value)}><option value="">全部專區</option>{catalog.sections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<label className={styles.check}><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />包含已封存</label><div className={styles.rows}>{filtered.map(item => <button type="button" disabled={busy} aria-pressed={draft?.id === item.id} className={draft?.id === item.id ? styles.selected : ""} key={item.id} onClick={() => choose(view, item)}><strong>{item.name}</strong><span>{"sectionId" in item ? `${catalog.sections.find(section => section.id === item.sectionId)?.name || ""} · ` : ""}{item.slug}</span><small>{item.archivedAt ? "已封存" : "published" in item ? item.published ? "已發布" : "草稿" : item.active ? "啟用" : "停用"} · 排序 {item.sortOrder}</small></button>)}</div>{!filtered.length && <p className={styles.empty}>目前沒有符合條件的資料。</p>}</aside>
      <section className={styles.editor}>{!draft ? <div className={styles.empty}><h2>開始管理{labels[kind]}</h2><p>選擇一筆資料進行編輯，或按「新增」。</p></div> : <form key={`${kind}-${editorVersion}`} onSubmit={save}><header className={styles.editorHeader}><div><small>{draft.id ? `正在編輯 · 版本 ${draft.revision}` : "新增資料"}</small><h2>{draft.name || `新增${labels[kind]}`}</h2>{archived && <p>此資料已封存，保留內容供查閱。</p>}</div><div className={styles.actions}><button type="submit" className={styles.primary} disabled={busy || archived || conflict}>{busy ? "處理中…" : "儲存"}</button>{draft.id && !archived && <button type="button" disabled={busy || conflict} onClick={archive}>封存</button>}</div></header><fieldset disabled={busy || archived || conflict} className={styles.fields}>
        <section className={styles.group}><h3>基本資料</h3><div className={styles.grid}>{field("名稱", "name", { required: true, max: 200 })}{field("Slug（網址識別）", "slug", { required: true, max: 80 })}</div><p className={styles.help}>名稱變更不會自動修改 Slug。只接受小寫英文、數字與連字號。</p>{kind !== "categories" && field("簡短說明", "shortDescription", { multiline: true, max: 500 })}{field("完整說明", "description", { multiline: true, max: 20000 })}{kind === "products" && <label className={styles.field}>商品類型<select value={draft.productType} onChange={event => change({ productType: event.target.value as StoreProduct["productType"] })}><option value="general">一般商品</option><option value="equipment">器具</option><option value="food">食品</option><option value="gift">禮盒</option></select></label>}</section>
        {kind !== "sections" && <section className={styles.group}><h3>分類</h3><label className={styles.field}>銷售專區<select required value={draft.sectionId || ""} onChange={event => { const next = changeStoreDraftSection(draft, event.target.value, catalog.categories); change(next.draft); if (next.cleared) setMessage("銷售專區已變更，原商品分類已清除。請重新選擇分類。"); }}><option value="">請選擇專區</option>{(archived ? catalog.sections : liveSections).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{kind === "products" && <label className={styles.field}>商品分類（可留空）<select value={draft.categoryId || ""} onChange={event => change({ categoryId: event.target.value || undefined })}><option value="">不指定分類</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}{kind === "categories" && draft.id && <p className={styles.help}>已有商品引用的分類，變更專區須符合既有資料關聯；無法儲存時會顯示原因。</p>}</section>}
        {kind === "products" && <><section className={styles.group}><h3>價格與庫存</h3><div className={styles.grid}>{field("SKU", "sku", { required: true, max: 120 })}{field("原價", "price", { type: "number", step: "any", required: true })}{field("特價（留空不啟用）", "salePrice", { type: "number", step: "any" })}{field("庫存數量", "inventory", { type: "number", required: true })}</div></section><section className={styles.group}><h3>商品點數（PV）</h3>{field("PV 值", "pvValue", { type: "number", step: "any", required: true })}<p className={styles.help}>前台顯示名稱：{pointDisplayName}。0 與小數皆可，每個商品獨立設定。</p></section><section className={styles.group}><h3>圖片與影片</h3><p className={styles.help}>上傳與網站素材庫沿用既有媒體系統。移除只解除此商品引用；媒體需儲存後才會套用。</p><h4>主視覺</h4>{draft.heroMedia && mediaCard(draft.heroMedia)}<MediaUploader usage="product" disabled={!draft.slug} showPreview={false} label="上傳主視覺" allowCloudinaryImage productMediaNaming={{ productSlug: draft.slug || "", mediaPurpose: "custom-section", sectionId: uploadId, reservedPublicIds: [draft.heroMedia, ...(draft.gallery || [])].flatMap(item => item?.publicId ? [item.publicId] : []) }} onChange={media => applyMedia(media, "hero")} /><button type="button" onClick={() => openLibrary("hero")}>從網站素材庫選擇主視覺</button><h4>商品相簿 · {draft.gallery?.length || 0}/24</h4><div className={styles.gallery}>{draft.gallery?.map((media, index) => mediaCard(media, index))}</div><MediaUploader usage="product" disabled={!draft.slug || (draft.gallery?.length || 0) >= 24} showPreview={false} label="上傳相簿素材" allowCloudinaryImage productMediaNaming={{ productSlug: draft.slug || "", mediaPurpose: "custom-section", sectionId: uploadId, reservedPublicIds: [draft.heroMedia, ...(draft.gallery || [])].flatMap(item => item?.publicId ? [item.publicId] : []) }} onChange={media => applyMedia(media, "gallery")} /><button type="button" disabled={(draft.gallery?.length || 0) >= 24} onClick={() => openLibrary("gallery")}>從網站素材庫加入相簿</button>{!draft.slug && <p className={styles.help}>填寫有效 Slug 後即可上傳素材。</p>}</section><section className={styles.group}><h3>規格</h3><p className={styles.help}>由您填寫商品資訊；食品成分、過敏原及產地等資料請依實際內容輸入。</p>{draft.specifications?.map((spec, index) => <div className={styles.spec} key={index}><label>Key<input required value={spec.key} maxLength={64} placeholder="material" onChange={event => change({ specifications: draft.specifications!.map((item, i) => i === index ? { ...item, key: event.target.value } : item) })} /></label><label>名稱<input required maxLength={120} value={spec.label} onChange={event => change({ specifications: draft.specifications!.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /></label><label>內容<input required maxLength={4000} value={spec.value} onChange={event => change({ specifications: draft.specifications!.map((item, i) => i === index ? { ...item, value: event.target.value } : item) })} /></label><label>排序<input type="number" min={0} step={1} required value={spec.sortOrder} onChange={event => change({ specifications: draft.specifications!.map((item, i) => i === index ? { ...item, sortOrder: Number(event.target.value) } : item) })} /></label><button type="button" onClick={() => change({ specifications: draft.specifications!.filter((_, i) => i !== index) })}>移除</button></div>)}<button type="button" disabled={(draft.specifications?.length || 0) >= 80} onClick={() => change({ specifications: [...(draft.specifications || []), { key: "", label: "", value: "", sortOrder: draft.specifications?.length || 0 }] })}>＋ 新增規格</button></section></>}
        {kind !== "categories" && <section className={styles.group}><h3>SEO</h3>{field("手動 SEO 標題（可留空）", "seoTitle", { max: 160 })}{field("手動 SEO 說明（可留空）", "seoDescription", { multiline: true, max: 500 })}<div className={styles.seoPreview}><small>搜尋結果預覽 · {seo?.titleIsManual || seo?.descriptionIsManual ? "含手動設定" : "自動 fallback"}</small><strong>{seo?.title || "填寫名稱後顯示"}</strong><p>{seo?.description || "填寫簡短說明或完整說明後顯示。"}</p></div><p className={styles.help}>手動內容優先。留空時即時計算預覽，不會把 fallback 寫入資料。</p></section>}
        <section className={styles.group}><h3>{kind === "categories" ? "啟用狀態與排序" : "發布狀態"}</h3>{checkbox("啟用", "active")}{kind !== "categories" && checkbox("發布", "published")}{field("排序（數字越小越前面）", "sortOrder", { type: "number" })}{kind === "sections" && <>{checkbox("首頁顯示", "showOnHomepage")}{field("首頁排序", "homepageSortOrder", { type: "number" })}{checkbox("導覽列顯示", "showInNavigation")}{field("導覽列排序", "navigationSortOrder", { type: "number" })}<p className={styles.help}>目前儲存顯示設定，公開商店頁面將於後續階段接入。</p></>}{kind === "products" && <>{checkbox("精選商品", "featured")}<p className={styles.help}>定期購資格：false（固定，不可編輯）。</p><label className={styles.field}>KD 折抵資格<select value={draft.kdRedemption?.mode || ""} onChange={event => change({ kdRedemption: event.target.value ? { mode: event.target.value as "inherit" | "enabled" | "disabled" } : undefined })}><option value="">未指定</option><option value="inherit">沿用全站資格</option><option value="enabled">允許</option><option value="disabled">不允許</option></select></label>{draft.kdRedemption && <label className={styles.field}>最高折抵百分比（可留空）<input type="number" min={0} max={100} step="any" value={draft.kdRedemption.maxDiscountPercent ?? ""} onChange={event => change({ kdRedemption: { mode: draft.kdRedemption!.mode, ...(event.target.value === "" ? {} : { maxDiscountPercent: Number(event.target.value) }) } })} /></label>}<p className={styles.help}>此處只管理資格資料。</p></>}</section>
      </fieldset><footer className={styles.footer}><span>{dirty ? "尚未儲存" : draft.id ? "已載入版本 " + draft.revision : "新資料"}</span><button type="submit" className={styles.primary} disabled={busy || archived || conflict}>儲存{labels[kind]}</button></footer></form>}</section>
    </div>}
    {heroPicker && view === "settings" && <ImageLibraryPicker assets={storeHeroLibraryAssets(assets)} title={heroPicker === "desktop" ? "選擇桌機 Hero 圖片" : "選擇手機 Hero 圖片"}
      onClose={() => setHeroPicker(null)} onChoose={asset => { if (!busy && !conflict) applyHeroImage({ type: "image", provider: "local", url: asset.path }, heroPicker, asset.alt.slice(0, 300)); }} />}
    {library && <HeroMediaLibraryPicker assets={assets} usage="product" title={library === "hero" ? "選擇主視覺" : "選擇相簿素材"} onClose={() => setLibrary(null)} onChoose={media => applyMedia(media, library)} />}
  </main>;
}
