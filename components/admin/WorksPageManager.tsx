"use client";

import { useEffect, useMemo, useState } from "react";

import ImageLibraryPicker from "@/components/admin/ImageLibraryPicker";
import MediaUploader from "@/components/admin/MediaUploader";
import SmartLinkPicker, { SmartLinkEditingProvider } from "@/components/admin/SmartLinkPicker";
import WorksMotionStudio, { type WorksMotionPreviewTarget } from "@/components/admin/WorksMotionStudio";
import WorksPagePreview from "@/components/admin/WorksPagePreview";
import WorksVisualStylePanel from "@/components/admin/WorksVisualStylePanel";
import type { AssetRecord } from "@/lib/assets";
import type { CmsLinkProduct, CmsLinkValue, PublishedCmsPage } from "@/lib/cmsLinks";
import { localImageMedia, type MediaAsset } from "@/lib/media";
import type { WorksPreviewProduct } from "@/lib/worksPageAdminStore";
import {
  DEFAULT_WORKS_PAGE_CMS_CONFIG,
  resolveWorksPageCms,
  validateWorksPageCms,
  type ResolvedWorksPageCms,
  type WorksContentSource,
  type WorksHeroOverlayPreset,
  type WorksPageCmsConfig,
  type WorksPageMediaReference,
} from "@/lib/worksPageCms";
import styles from "./WorksPageManager.module.css";

type Payload = {
  version: number;
  hasSavedConfig: boolean;
  savedConfig: WorksPageCmsConfig | null;
  resolved: ResolvedWorksPageCms;
  live: { monthLabel: string; intro: string };
  assets: AssetRecord[];
  products: CmsLinkProduct[];
  previewProducts: WorksPreviewProduct[];
  publishedPages: PublishedCmsPage[];
};

type EditorHero = NonNullable<WorksPageCmsConfig["hero"]> & {
  enabled: boolean;
  eyebrowSource: WorksContentSource;
  customEyebrow: string;
  headlineLines: [string, string];
  descriptionSource: WorksContentSource;
  customDescription: string;
  primaryCta: { enabled: boolean; label: string; link: CmsLinkValue };
  secondaryCta: { enabled: boolean; label: string; link: CmsLinkValue };
  overlayPreset: WorksHeroOverlayPreset;
};
type EditorCatalog = NonNullable<WorksPageCmsConfig["catalog"]> & {
  introEnabled: boolean;
  countPrefix: string;
  countSuffix: string;
  helperText: string;
  emptyStateText: string;
  presentation: {
    showIndex: boolean;
    showArtist: boolean;
    showTag: boolean;
    showFlavors: boolean;
    showFacts: boolean;
    showCommerceSummary: boolean;
    cardPreset: "current" | "minimal" | "bordered";
  };
};
type EditorDraft = Omit<WorksPageCmsConfig, "hero" | "catalog"> & { hero: EditorHero; catalog: EditorCatalog };
type MediaSlot = "desktopMedia" | "mobileMedia";
type PickerTarget = MediaSlot | "seoShareImage";
type EditorTab = "content" | "media" | "visual" | "motion" | "seo" | "preview";
type ContentSection = "hero" | "cta" | "catalog" | "cards";

function editorDraft(payload: Pick<Payload, "savedConfig" | "resolved">): EditorDraft {
  const saved = structuredClone(payload.savedConfig || { schemaVersion: 1 }) as WorksPageCmsConfig;
  const resolved = payload.resolved;
  return {
    ...saved,
    schemaVersion: 1,
    hero: {
      ...(saved.hero || {}),
      enabled: saved.hero?.enabled ?? resolved.hero.enabled,
      eyebrowSource: saved.hero?.eyebrowSource ?? resolved.hero.eyebrowSource,
      customEyebrow: saved.hero?.customEyebrow ?? resolved.hero.customEyebrow,
      headlineLines: saved.hero?.headlineLines ? [...saved.hero.headlineLines] : [...resolved.hero.headlineLines],
      descriptionSource: saved.hero?.descriptionSource ?? resolved.hero.descriptionSource,
      customDescription: saved.hero?.customDescription ?? resolved.hero.customDescription,
      primaryCta: {
        enabled: saved.hero?.primaryCta?.enabled ?? resolved.hero.primaryCta.enabled,
        label: saved.hero?.primaryCta?.label ?? resolved.hero.primaryCta.label,
        link: saved.hero?.primaryCta?.link ?? resolved.hero.primaryCta.link,
      },
      secondaryCta: {
        enabled: saved.hero?.secondaryCta?.enabled ?? resolved.hero.secondaryCta.enabled,
        label: saved.hero?.secondaryCta?.label ?? resolved.hero.secondaryCta.label,
        link: saved.hero?.secondaryCta?.link ?? resolved.hero.secondaryCta.link,
      },
      desktopMedia: saved.hero?.desktopMedia ? structuredClone(saved.hero.desktopMedia) : resolved.hero.desktopMedia ? structuredClone(resolved.hero.desktopMedia) : undefined,
      mobileMedia: saved.hero?.mobileMedia ? structuredClone(saved.hero.mobileMedia) : resolved.hero.mobileMedia ? structuredClone(resolved.hero.mobileMedia) : undefined,
      overlayPreset: saved.hero?.overlayPreset ?? resolved.hero.overlayPreset,
    },
    catalog: {
      ...(saved.catalog || {}),
      introEnabled: saved.catalog?.introEnabled ?? resolved.catalog.introEnabled,
      countPrefix: saved.catalog?.countPrefix ?? resolved.catalog.countPrefix,
      countSuffix: saved.catalog?.countSuffix ?? resolved.catalog.countSuffix,
      helperText: saved.catalog?.helperText ?? resolved.catalog.helperText,
      emptyStateText: saved.catalog?.emptyStateText ?? resolved.catalog.emptyStateText,
      presentation: {
        showIndex: saved.catalog?.presentation?.showIndex ?? resolved.catalog.presentation.showIndex,
        showArtist: saved.catalog?.presentation?.showArtist ?? resolved.catalog.presentation.showArtist,
        showTag: saved.catalog?.presentation?.showTag ?? resolved.catalog.presentation.showTag,
        showFlavors: saved.catalog?.presentation?.showFlavors ?? resolved.catalog.presentation.showFlavors,
        showFacts: saved.catalog?.presentation?.showFacts ?? resolved.catalog.presentation.showFacts,
        showCommerceSummary: saved.catalog?.presentation?.showCommerceSummary ?? resolved.catalog.presentation.showCommerceSummary,
        cardPreset: saved.catalog?.presentation?.cardPreset ?? resolved.catalog.presentation.cardPreset,
      },
    },
  };
}

export default function WorksPageManager() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [baseline, setBaseline] = useState("");
  const [message, setMessage] = useState("讀取中…");
  const [saving, setSaving] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [pickerFor, setPickerFor] = useState<PickerTarget | null>(null);
  const [activeTab, setActiveTab] = useState<EditorTab>("content");
  const [contentSection, setContentSection] = useState<ContentSection>("hero");
  const [motionPreviewTarget, setMotionPreviewTarget] = useState<WorksMotionPreviewTarget>("hero");
  const [replayKey, setReplayKey] = useState(0);
  const dirty = Boolean(draft) && JSON.stringify(draft) !== baseline;

  useEffect(() => {
    fetch("/api/admin/works-page", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "頁面資料讀取失敗。");
        return result as Payload;
      })
      .then((result) => {
        const nextDraft = editorDraft(result);
        setPayload(result); setAssets(result.assets || []); setDraft(nextDraft);
        setBaseline(JSON.stringify(nextDraft)); setMessage("");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "頁面資料讀取失敗。"));
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const preview = useMemo(() => payload && draft ? resolveWorksPageCms(draft, payload.live) : null, [payload, draft]);

  function change(next: EditorDraft) { setDraft(next); if (message === "已儲存") setMessage(""); }
  function patchHero(next: Partial<EditorHero>) { if (draft) change({ ...draft, hero: { ...draft.hero, ...next } }); }
  function patchCatalog(next: Partial<EditorCatalog>) { if (draft) change({ ...draft, catalog: { ...draft.catalog, ...next } }); }
  function patchPresentation(next: Partial<EditorCatalog["presentation"]>) { if (draft) patchCatalog({ presentation: { ...draft.catalog.presentation, ...next } }); }
  function patchCta(key: "primaryCta" | "secondaryCta", next: Partial<EditorHero[typeof key]>) { if (draft) patchHero({ [key]: { ...draft.hero[key], ...next } }); }
  function patchMedia(key: MediaSlot, media: WorksPageMediaReference | undefined) { patchHero({ [key]: media }); }
  function patchColors(colors: ResolvedWorksPageCms["colors"]) { if (draft) change({ ...draft, colors }); }
  function patchMotion(motion: ResolvedWorksPageCms["motion"]) { if (draft) change({ ...draft, motion }); }
  function patchSeo(next: Partial<NonNullable<WorksPageCmsConfig["seo"]>>) { if (draft) change({ ...draft, seo: { ...(draft.seo || {}), ...next } }); }
  function replayMotion(target = motionPreviewTarget) { setMotionPreviewTarget(target); setReplayKey((current) => current + 1); }

  async function uploadImage(file: File) {
    const form = new FormData(); form.append("file", file);
    const response = await fetch("/api/admin/pages/images", { method: "POST", body: form });
    const data = await response.json() as { error?: string; asset?: AssetRecord; media?: MediaAsset };
    if (!response.ok || !data.asset || !data.media) throw new Error(data.error || "圖片上傳失敗。");
    setAssets((current) => current.some((asset) => asset.id === data.asset!.id) ? current : [data.asset!, ...current]);
    return data.media;
  }

  function chooseAsset(asset: AssetRecord) {
    if (!pickerFor || !draft) return;
    if (pickerFor === "seoShareImage") {
      const current = draft.seo?.shareImage;
      patchSeo({ shareImage: { media: localImageMedia(asset.path), alt: current?.alt || asset.alt || asset.name } });
    } else {
      const current = draft.hero[pickerFor];
      patchMedia(pickerFor, { media: localImageMedia(asset.path), alt: current?.alt || asset.alt || asset.name });
    }
    setPickerFor(null);
  }

  async function save() {
    if (!payload || !draft || !dirty) return;
    try {
      validateWorksPageCms(draft); setSaving(true); setMessage("儲存中…");
      const response = await fetch("/api/admin/works-page", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: payload.version, works: draft }),
      });
      const result = await response.json();
      if (response.status === 409) throw new Error("資料已被其他操作更新，請重新整理後再試一次。");
      if (!response.ok) throw new Error(result.error || "儲存失敗，請稍後再試。");
      const nextPayload: Payload = { ...payload, ...result, hasSavedConfig: true };
      const nextDraft = editorDraft(nextPayload);
      setPayload(nextPayload); setDraft(nextDraft); setBaseline(JSON.stringify(nextDraft)); setMessage("已儲存");
    } catch (error) {
      setMessage(`儲存失敗：${error instanceof Error ? error.message : "未知錯誤"}`);
    } finally { setSaving(false); }
  }

  function restoreDefaults() {
    if (!payload || !confirm("確定將目前編輯內容恢復為 Works 預設值？按下「儲存全部」前不會寫入資料。")) return;
    change(editorDraft({ savedConfig: null, resolved: resolveWorksPageCms(DEFAULT_WORKS_PAGE_CMS_CONFIG, payload.live) }));
    setMessage("已在編輯器恢復預設值，尚未儲存。");
  }

  if (!payload || !draft || !preview) return <p className="cms-message" role="status">{message}</p>;

  const tabs: Array<[EditorTab, string]> = [["content", "內容"], ["media", "素材"], ["visual", "視覺"], ["motion", "動畫"], ["seo", "SEO"], ["preview", "預覽"]];
  const contentTabs: Array<[ContentSection, string]> = [["hero", "首屏內容"], ["cta", "按鈕"], ["catalog", "作品列表"], ["cards", "商品卡顯示"]];

  return <SmartLinkEditingProvider pages={payload.publishedPages}>
    <div className="homepage-manager v3-admin">
      <div className={styles.toolbar}>
        <div className="cms-toolbar">
          <div><a href="/admin">← 返回營運中心</a><p className="eyebrow dark">WORKS PAGE</p><h1>全部咖啡 / Works</h1><p>固定公開網址：/works</p><div className={styles.toolbarStatus}><span className={styles.statusPill}>{payload.hasSavedConfig ? "已有自訂設定" : "目前使用預設版面"}</span><span className={`${styles.statusPill} ${dirty ? styles.dirtyPill : styles.savedPill}`}>{dirty ? "有尚未儲存的變更" : "所有變更已儲存"}</span>{message ? <span role="status">{message}</span> : null}</div></div>
          <div className="cms-toolbar-actions"><a href="/works" target="_blank" rel="noreferrer">預覽 /works ↗</a><button type="button" className="cms-secondary-button" onClick={restoreDefaults}>恢復預設值</button><button type="button" onClick={save} disabled={saving || !dirty}>{saving ? "儲存中…" : "儲存全部"}</button></div>
        </div>
      </div>

      <nav className={styles.majorTabs} aria-label="Works 編輯分類">{tabs.map(([tab, label]) => <button type="button" key={tab} className={activeTab === tab ? styles.activeTab : ""} aria-pressed={activeTab === tab} onClick={() => setActiveTab(tab)}>{label}</button>)}</nav>

      <div className={styles.workspace}>
        <main className={styles.editorPane}>
          {activeTab === "content" ? <section className={styles.studioPanel}>
            <header className={styles.panelIntro}><div><p>PAGE CONTENT</p><h2>頁面內容</h2><span>一次只專注一組內容，避免設定互相干擾。</span></div></header>
            <nav className={styles.subTabs} aria-label="內容區域">{contentTabs.map(([section, label]) => <button type="button" key={section} className={contentSection === section ? styles.activeSubTab : ""} onClick={() => setContentSection(section)}>{label}</button>)}</nav>
            {contentSection === "hero" ? <section className={styles.contentCard}><header><div><h3>首屏內容</h3><p>編輯頁面開場文字與顯示狀態。</p></div><VisibilityToggle label="顯示首屏內容" enabled={draft.hero.enabled} onChange={(enabled) => patchHero({ enabled })} /></header><div className={`cms-grid two ${styles.compactFields}`}><SourceField label="月份小標" value={draft.hero.eyebrowSource} onChange={(eyebrowSource) => patchHero({ eyebrowSource })} />{draft.hero.eyebrowSource === "custom" ? <label>自訂小標<input maxLength={120} value={draft.hero.customEyebrow} onChange={(event) => patchHero({ customEyebrow: event.target.value })} /></label> : <ReadOnlyLiveValue label="目前本月小標" value={payload.live.monthLabel} />}<label>主標題第一行<input maxLength={180} value={draft.hero.headlineLines[0]} onChange={(event) => patchHero({ headlineLines: [event.target.value, draft.hero.headlineLines[1]] })} /></label><label>主標題第二行<input maxLength={180} value={draft.hero.headlineLines[1]} onChange={(event) => patchHero({ headlineLines: [draft.hero.headlineLines[0], event.target.value] })} /></label><SourceField label="首屏說明" value={draft.hero.descriptionSource} onChange={(descriptionSource) => patchHero({ descriptionSource })} />{draft.hero.descriptionSource === "custom" ? <label className="span-two">自訂說明<textarea maxLength={1200} value={draft.hero.customDescription} onChange={(event) => patchHero({ customDescription: event.target.value })} /></label> : <ReadOnlyLiveValue label="目前本月說明" value={payload.live.intro} wide />}</div></section> : null}
            {contentSection === "cta" ? <div className="page-section-list"><CtaCard title="主要按鈕" value={draft.hero.primaryCta} products={payload.products} pages={payload.publishedPages} editorId="works-primary-cta" onChange={(next) => patchCta("primaryCta", next)} /><CtaCard title="次要按鈕" value={draft.hero.secondaryCta} products={payload.products} pages={payload.publishedPages} editorId="works-secondary-cta" onChange={(next) => patchCta("secondaryCta", next)} /></div> : null}
            {contentSection === "catalog" ? <section className={styles.contentCard}><header><div><h3>作品列表內容</h3><p>作品數量由系統自動計算。</p></div><VisibilityToggle label="顯示列表說明" enabled={draft.catalog.introEnabled} onChange={(introEnabled) => patchCatalog({ introEnabled })} /></header><div className={`cms-grid two ${styles.compactFields}`}><label>數量文字前綴<input maxLength={80} value={draft.catalog.countPrefix} onChange={(event) => patchCatalog({ countPrefix: event.target.value })} /></label><label>數量文字後綴<input maxLength={80} value={draft.catalog.countSuffix} onChange={(event) => patchCatalog({ countSuffix: event.target.value })} /></label><label className="span-two">列表說明文字<textarea maxLength={500} value={draft.catalog.helperText} onChange={(event) => patchCatalog({ helperText: event.target.value })} /></label><label className="span-two">沒有可顯示作品時的文字<textarea maxLength={500} value={draft.catalog.emptyStateText} onChange={(event) => patchCatalog({ emptyStateText: event.target.value })} /></label></div><div className={styles.authorityNote}><span>商品內容、排序、價格、庫存與卡片圖片由另一個管理區負責。</span><a href="/admin/products">前往作品與本月豆單 →</a></div></section> : null}
            {contentSection === "cards" ? <section className={styles.contentCard}><header><div><h3>商品卡顯示</h3><p>只控制顯示資訊，不改變商品內容或商務資料。</p></div></header><div className="owner-status-grid"><PresentationToggle label="作品編號" enabled={draft.catalog.presentation.showIndex} onChange={(showIndex) => patchPresentation({ showIndex })} /><PresentationToggle label="創作者" enabled={draft.catalog.presentation.showArtist} onChange={(showArtist) => patchPresentation({ showArtist })} /><PresentationToggle label="分類標籤" enabled={draft.catalog.presentation.showTag} onChange={(showTag) => patchPresentation({ showTag })} /><PresentationToggle label="風味" enabled={draft.catalog.presentation.showFlavors} onChange={(showFlavors) => patchPresentation({ showFlavors })} /><PresentationToggle label="作品資訊" enabled={draft.catalog.presentation.showFacts} onChange={(showFacts) => patchPresentation({ showFacts })} /><PresentationToggle label="價格與供應狀態" enabled={draft.catalog.presentation.showCommerceSummary} onChange={(showCommerceSummary) => patchPresentation({ showCommerceSummary })} /></div><label>卡片呈現<select value={draft.catalog.presentation.cardPreset} onChange={(event) => patchPresentation({ cardPreset: event.target.value as EditorCatalog["presentation"]["cardPreset"] })}><option value="current">目前版面</option><option value="minimal">簡潔版面</option><option value="bordered">框線版面</option></select></label></section> : null}
          </section> : null}

          {activeTab === "media" ? <section className={styles.studioPanel}><header className={styles.panelIntro}><div><p>MEDIA STUDIO</p><h2>首屏素材</h2><span>選擇、上傳與替換媒體；移除只解除本頁引用。</span></div></header><div className={styles.mediaStudio}><MediaCard title="桌機首屏素材" value={draft.hero.desktopMedia} uploadImage={uploadImage} onOpenLibrary={() => setPickerFor("desktopMedia")} onChange={(value) => patchMedia("desktopMedia", value)} /><MediaCard title="手機首屏素材（選填）" description={draft.hero.mobileMedia ? "已指定手機專用素材。" : "手機版目前使用桌機素材；不會另存重複引用。"} value={draft.hero.mobileMedia} uploadImage={uploadImage} onOpenLibrary={() => setPickerFor("mobileMedia")} onChange={(value) => patchMedia("mobileMedia", value)} /></div><section className={styles.contentCard}><header><div><h3>首屏遮罩</h3><p>經典 Works 漸層是安全預設，不會暴露 CSS 設定。</p></div></header><div className={styles.motionChoices}>{[["current-gradient", "經典 Works 漸層"], ["soft", "柔和遮罩"], ["strong", "較深遮罩"], ["none", "不使用遮罩"]].map(([value, label]) => <button type="button" key={value} className={draft.hero.overlayPreset === value ? styles.selectedMotion : ""} onClick={() => patchHero({ overlayPreset: value as WorksHeroOverlayPreset })}><strong>{label}</strong></button>)}</div></section></section> : null}

          {activeTab === "visual" ? <WorksVisualStylePanel value={preview.colors} onChange={patchColors} /> : null}
          {activeTab === "motion" ? <WorksMotionStudio value={preview.motion} onChange={patchMotion} onPreview={replayMotion} /> : null}
          {activeTab === "seo" ? <section className={styles.studioPanel}><header className={styles.panelIntro}><div><p>SEARCH & SHARE</p><h2>SEO 與分享</h2><span>控制 /works 在搜尋結果與社群分享時使用的標題、說明與圖片。</span></div></header><section className={styles.contentCard}><header><div><h3>搜尋結果</h3><p>留白時會使用 Works 安全預設值。</p></div></header><div className={`cms-grid two ${styles.compactFields}`}><label className="span-two">SEO 標題<input maxLength={70} value={draft.seo?.title ?? preview.seo.title} onChange={(event) => patchSeo({ title: event.target.value })} /><small>{(draft.seo?.title ?? preview.seo.title).length}/70</small></label><label className="span-two">SEO 說明<textarea maxLength={180} value={draft.seo?.description ?? preview.seo.description} onChange={(event) => patchSeo({ description: event.target.value })} /><small>{(draft.seo?.description ?? preview.seo.description).length}/180</small></label></div></section><section className={styles.contentCard}><header><div><h3>分享圖片</h3><p>只接受圖片；用於 Open Graph 與 X/Twitter 分享預覽。</p></div></header>{draft.seo?.shareImage ? <div className={styles.mediaAlt}><b>目前圖片</b><span>{draft.seo.shareImage.media.url}</span><label>替代文字（必填）<input maxLength={240} value={draft.seo.shareImage.alt} onChange={(event) => patchSeo({ shareImage: { ...draft.seo!.shareImage!, alt: event.target.value } })} /></label><div className={styles.mediaActions}><button type="button" className="cms-secondary-button" onClick={() => setPickerFor("seoShareImage")}>更換分享圖片</button><button type="button" onClick={() => patchSeo({ shareImage: undefined })}>移除分享圖片</button></div></div> : <div className={styles.mediaActions}><button type="button" className="cms-secondary-button" onClick={() => setPickerFor("seoShareImage")}>從素材庫選擇分享圖片</button></div>}</section></section> : null}
          {activeTab === "preview" ? <WorksPagePreview value={preview} draftHero={draft.hero} products={payload.previewProducts} device={previewDevice} onDevice={setPreviewDevice} target={motionPreviewTarget} replayKey={replayKey} onReplay={() => replayMotion()} /> : null}
        </main>

        {activeTab !== "preview" ? <aside className={styles.previewRail}><WorksPagePreview compact value={preview} draftHero={draft.hero} products={payload.previewProducts} device={previewDevice} onDevice={setPreviewDevice} target={motionPreviewTarget} replayKey={replayKey} onReplay={() => replayMotion()} /></aside> : null}
      </div>
      {pickerFor ? <ImageLibraryPicker title={pickerFor === "desktopMedia" ? "選擇桌機 Hero 圖片" : pickerFor === "mobileMedia" ? "選擇手機 Hero 圖片" : "選擇 Works 分享圖片"} assets={assets} onChoose={chooseAsset} onClose={() => setPickerFor(null)} /> : null}
    </div>
  </SmartLinkEditingProvider>;
}

function VisibilityToggle({ label, enabled, onChange }: { label: string; enabled: boolean; onChange: (enabled: boolean) => void }) {
  return <label className="owner-visibility-control"><input type="checkbox" checked={enabled} onChange={(event) => onChange(event.target.checked)} /><b>{label}</b></label>;
}

function SourceField({ label, value, onChange }: { label: string; value: WorksContentSource; onChange: (value: WorksContentSource) => void }) {
  return <fieldset className={styles.sourceChoice}><legend>{label}</legend><div><button type="button" className={value === "monthly-menu" ? styles.isSelected : ""} onClick={() => onChange("monthly-menu")}>跟隨本月豆單</button><button type="button" className={value === "custom" ? styles.isSelected : ""} onClick={() => onChange("custom")}>自訂內容</button></div></fieldset>;
}

function ReadOnlyLiveValue({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={`${styles.liveValue} ${wide ? "span-two" : ""}`}><small>{label}</small><p>{value || "目前沒有內容"}</p></div>;
}

function CtaCard({ title, value, products, pages, editorId, onChange }: { title: string; value: EditorHero["primaryCta"]; products: CmsLinkProduct[]; pages: PublishedCmsPage[]; editorId: string; onChange: (next: Partial<EditorHero["primaryCta"]>) => void }) {
  return <article className={styles.contentCard}>
    <header><div><h2>{title}</h2></div><VisibilityToggle label={`顯示${title}`} enabled={value.enabled} onChange={(enabled) => onChange({ enabled })} /></header>
    <label>按鈕文字<input maxLength={80} value={value.label} onChange={(event) => onChange({ label: event.target.value })} /></label>
    <SmartLinkPicker editorId={editorId} label={title} buttonText={value.label} value={value.link} products={products} pages={pages} onChange={(link) => onChange({ link })} />
  </article>;
}

function MediaCard({ title, description, value, uploadImage, onOpenLibrary, onChange }: { title: string; description?: string; value?: WorksPageMediaReference; uploadImage: (file: File) => Promise<MediaAsset>; onOpenLibrary: () => void; onChange: (value: WorksPageMediaReference | undefined) => void }) {
  return <article className={styles.mediaCard}>
    <header><div><h3>{title}</h3>{description ? <p>{description}</p> : null}</div></header>
    <MediaUploader label={`${title}預覽與替換`} value={value?.media} usage="hero" onImageUpload={uploadImage} imageActionLabel="上傳新圖片" videoActionLabel="上傳新影片" onChange={(media) => onChange({ media, alt: value?.alt || "" })} onRemove={value ? () => onChange(undefined) : undefined} />
    <div className={styles.mediaActions}><button type="button" className="cms-secondary-button" onClick={onOpenLibrary}>從素材庫選擇圖片</button></div>
    {value ? <label className={styles.mediaAlt}>替代文字{value.media.type === "image" ? "（必填）" : "（選填）"}<input maxLength={240} value={value.alt} onChange={(event) => onChange({ ...value, alt: event.target.value })} /></label> : <p>目前未指定媒體，可從素材庫選擇或上傳新素材。</p>}
    {value ? <div className={styles.referenceDanger}><span>只解除 Works 頁面引用，不會刪除原始素材。</span><button type="button" onClick={() => confirm("確定移除此頁面的媒體引用？素材庫與 Cloudinary 原檔不會被刪除。") && onChange(undefined)}>移除引用</button></div> : null}
  </article>;
}

function PresentationToggle({ label, enabled, onChange }: { label: string; enabled: boolean; onChange: (enabled: boolean) => void }) {
  return <button type="button" className={`owner-surface ${enabled ? "is-visible" : "is-hidden"}`} aria-pressed={enabled} onClick={() => onChange(!enabled)}><span>{label}</span><b>{enabled ? "顯示" : "隱藏"}</b></button>;
}
