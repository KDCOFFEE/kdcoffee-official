"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useState } from "react";
import ImageLibraryPicker from "@/components/admin/ImageLibraryPicker";
import HeroMediaLibraryPicker from "@/components/admin/HeroMediaLibraryPicker";
import MediaUploader from "@/components/admin/MediaUploader";
import SmartLinkPicker, { SmartLinkEditingProvider } from "@/components/admin/SmartLinkPicker";
import { validateHomepageCampaigns } from "@/lib/homepageCampaignValidation";
import { home004IneligibilityReasons, resolveHome004Recommendations } from "@/lib/home004Recommendations";
import { HOMEPAGE_CARD_PRESENTATION_PRESETS, HOMEPAGE_COLLECTION_LIMIT, HOMEPAGE_HERO_OVERLAY_PRESETS, HOMEPAGE_MOTION_PRESETS, HOMEPAGE_PRODUCT_LIMIT, HOMEPAGE_SECTION_MOTION_DEFAULTS, PREMIUM_HERO_TIMING, homepageMotionCssVariables, resolveHeroTiming, resolveHomepageMotion, validateHomepageCms, type HeroTiming, type HomepageMediaReference, type HomepageMotionSectionKey, type HomepageSectionMotion, type HomepageVisualConfig } from "@/lib/homepageCms";
import type { AssetRecord } from "@/lib/assets";
import { VISUAL_COLOR_PRESETS, visualColorHex, type VisualColorValue } from "@/lib/pageBuilderVisualStyle";
import { localImageMedia, resolveMediaAsset, youtubeMedia, type MediaAsset } from "@/lib/media";
import { parseYouTubeUrl, youtubeWatchUrl } from "@/lib/youtubeMedia";

type ProductOption = { slug: string; name: string; active?: boolean; status?: string; purchasable: boolean; inMonthlyMenu: boolean; hasAvailableSku: boolean };
type AssetOption = AssetRecord;
type Payload = { homepage: Record<string, any>; products: ProductOption[]; assets: AssetOption[]; publishedPages: import("@/lib/cmsLinks").PublishedCmsPage[] };
type Path = Array<string | number>;
type SetPath = (path: Path, value: unknown) => void;
type UploadImage = (file: File, path: Path, assetId: string, seoName?: string, assetGroup?: string) => Promise<MediaAsset>;

const sectionNames: Record<string, string> = { home002: "品牌價值", home003: "咖啡時刻", home004: "推薦作品", home005: "咖啡製程", home006: "專屬烘焙", home007: "咖啡藝術", home008: "真實工作室", home009: "真實評價", home010: "最後購買引導" };

function stableId(prefix: string) { return `${prefix}-${globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`; }
function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const destination = index + direction;
  if (destination < 0 || destination >= items.length) return items;
  const next = [...items]; [next[index], next[destination]] = [next[destination], next[index]];
  return next.map((item, order) => typeof item === "object" && item ? { ...item, order } : item) as T[];
}
function confirmRemoval(message = "確定要從首頁移除此項目嗎？\n媒體素材本身不會從素材庫刪除。") { return window.confirm(message); }

export default function HomepageManager() {
  const [data, setData] = useState<Payload | null>(null);
  const [baseline, setBaseline] = useState("");
  const [message, setMessage] = useState("讀取中…");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"content" | "visual" | "seo">("content");
  const [seoPickerOpen, setSeoPickerOpen] = useState(false);
  const [heroPicker, setHeroPicker] = useState<"desktop" | "mobile" | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/homepage", { cache: "no-store" }).then(async (response) => { const value = await response.json(); if (!response.ok) throw new Error(value.error || "首頁讀取失敗"); return value; }),
      fetch("/api/admin/assets", { cache: "no-store" }).then(async (response) => { const value = await response.json(); if (!response.ok) throw new Error(value.error || "素材庫讀取失敗"); return value; }),
    ]).then(([homepagePayload, library]) => {
      const next = { ...homepagePayload, assets: Array.isArray(library.assets) ? library.assets : [] } as Payload;
      setData(next); setBaseline(JSON.stringify(next.homepage)); setMessage("");
    }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "讀取失敗"));
  }, []);

  const dirty = Boolean(data) && JSON.stringify(data?.homepage) !== baseline;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setPath: SetPath = (path, value) => setData((current) => {
    if (!current) return current;
    const next = structuredClone(current); let target: any = next.homepage;
    for (let index = 0; index < path.length - 1; index += 1) {
      const key = path[index];
      if (target[key] === undefined) target[key] = typeof path[index + 1] === "number" ? [] : {};
      target = target[key];
    }
    target[path[path.length - 1]] = value; return next;
  });

  const uploadImage: UploadImage = async (file, path, assetId, seoName, assetGroup) => {
    setMessage(`上傳 ${assetId}…`); const form = new FormData();
    form.append("file", file); form.append("desiredName", seoName || `kd-coffee-${assetId.toLowerCase()}`); form.append("artworkSlug", "homepage"); form.append("assetType", assetId.toLowerCase());
    if (assetGroup) form.append("assetGroup", assetGroup);
    const response = await fetch("/api/admin/homepage/upload", { method: "POST", body: form }); const result = await response.json();
    if (!response.ok) throw new Error(result.error || "上傳失敗");
    setPath(path, result.path); setMessage(`${assetId} 上傳完成，請按儲存。`); return localImageMedia(result.path);
  };

  const uploadHeroImage = async (file: File, assetId: string) => {
    setMessage(`上傳 ${assetId}…`); const form = new FormData();
    form.append("file", file); form.append("desiredName", `kd-coffee-${assetId.toLowerCase()}`); form.append("artworkSlug", "homepage"); form.append("assetType", assetId.toLowerCase());
    const response = await fetch("/api/admin/homepage/upload", { method: "POST", body: form }); const result = await response.json();
    if (!response.ok) throw new Error(result.error || "上傳失敗");
    setMessage(`${assetId} 上傳完成，請按儲存。`); return localImageMedia(result.path);
  };

  async function save() {
    if (!data) return;
    try {
      validateHomepageCms(data.homepage);
      const campaignError = validateHomepageCampaigns(data.homepage.campaigns); if (campaignError) throw new Error(campaignError);
      const resolution = resolveHome004Recommendations(data.homepage.home004?.productSlugs, data.products); if (!resolution.valid) throw new Error(resolution.errors[0]);
      setSaving(true); setMessage("儲存中…");
      const response = await fetch("/api/admin/homepage", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ homepage: data.homepage }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "儲存失敗");
      const nextHomepage = { ...data.homepage, version: result.version };
      setData((current) => current ? { ...current, homepage: nextHomepage } : current); setBaseline(JSON.stringify(nextHomepage)); setMessage("首頁設定已儲存");
    } catch (error) { setMessage(`儲存失敗：${error instanceof Error ? error.message : "未知錯誤"}`); } finally { setSaving(false); }
  }

  if (!data) return <p>{message}</p>;
  const h = data.homepage;
  return <SmartLinkEditingProvider pages={data.publishedPages}><div className="homepage-manager v3-admin">
    <div className="cms-toolbar"><div><p className="eyebrow dark">HOMEPAGE CMS 2.0</p><h1>管理我的首頁</h1><p>文字、順序與媒體都可視化管理；移除首頁引用不會刪除素材。</p></div><div className="cms-toolbar-actions"><a href="/" target="_blank">預覽首頁 ↗</a><button onClick={save} disabled={saving || !dirty}>{saving ? "儲存中…" : "儲存全部"}</button></div></div>
    {dirty ? <div className="cms-unsaved" role="status">有尚未儲存的變更</div> : null}{message ? <div className="cms-message" role="status">{message}</div> : null}
    <div className="cms-toolbar-actions" role="tablist" aria-label="首頁管理分類">
      <button type="button" role="tab" aria-selected={activeTab === "content"} onClick={() => setActiveTab("content")}>內容</button>
      <button type="button" role="tab" aria-selected={activeTab === "visual"} onClick={() => setActiveTab("visual")}>視覺</button>
      <button type="button" role="tab" aria-selected={activeTab === "seo"} onClick={() => setActiveTab("seo")}>SEO</button>
    </div>
    {activeTab === "content" ? <>
      <HomepageCtaVisibility homepage={h} setPath={setPath}/>
      <HeroEditor value={h.hero} products={data.products} setPath={setPath} uploadHeroImage={uploadHeroImage} onOpenLibrary={setHeroPicker} />
      <CampaignEditor section={h.campaignSection || {}} campaigns={h.campaigns || []} products={data.products} setPath={setPath} uploadImage={uploadImage} />
      <ContentSectionEditor sectionKey="home002" value={h.home002 || {}} collectionKey="cards" setPath={setPath} uploadImage={uploadImage} assets={data.assets} />
      <ContentSectionEditor sectionKey="home003" value={h.home003 || {}} collectionKey="cards" products={data.products} setPath={setPath} uploadImage={uploadImage} assets={data.assets} />
      <Home004Editor value={h.home004 || {}} products={data.products} setPath={setPath} />
      <ContentSectionEditor sectionKey="home005" value={h.home005 || {}} collectionKey="steps" setPath={setPath} uploadImage={uploadImage} assets={data.assets} />
      <Home006Editor value={h.home006 || {}} products={data.products} setPath={setPath} uploadImage={uploadImage} assets={data.assets} />
      <ContentSectionEditor sectionKey="home007" value={h.home007 || {}} collectionKey="cards" setPath={setPath} uploadImage={uploadImage} assets={data.assets} />
      <Home008Editor value={h.home008 || {}} setPath={setPath} uploadImage={uploadImage} assets={data.assets} />
      <ReviewsEditor value={h.home009 || {}} setPath={setPath} />
      <Home010Editor value={h.home010 || {}} products={data.products} setPath={setPath} />
    </> : null}
    {activeTab === "visual" ? <HomepageVisualEditor value={h.visual} setPath={setPath} /> : null}
    {activeTab === "seo" ? <HomepageSeoEditor value={h.seo} assets={data.assets} setPath={setPath} onOpenPicker={() => setSeoPickerOpen(true)} /> : null}
    {seoPickerOpen ? <ImageLibraryPicker assets={data.assets} title="選擇首頁 SEO 分享圖片" onClose={() => setSeoPickerOpen(false)} onChoose={(asset) => { setPath(["seo", "shareImage"], { media: localImageMedia(asset.path), alt: asset.alt || asset.name }); setSeoPickerOpen(false); }} /> : null}
    {heroPicker ? <HeroMediaLibraryPicker assets={data.assets} title={heroPicker === "desktop" ? "選擇桌機 Hero 素材" : "選擇手機 Hero 素材"} onClose={() => setHeroPicker(null)} onChoose={(media) => { setPath(["hero", heroPicker === "desktop" ? "desktopMedia" : "mobileMedia"], media); setHeroPicker(null); }} /> : null}
  </div></SmartLinkEditingProvider>;
}

const homepageVisualDefaults: Required<HomepageVisualConfig> = {
  colors: { pageBackground: "ivory", primaryText: "ink", secondaryText: "warm-gray", accent: "gold", lightSurface: "ivory", darkSurface: "coffee", onDark: "white", primaryButton: "ink", primaryButtonText: "white", border: "warm-gray" },
  heroOverlayPreset: "current",
  cardPresentationPreset: "current",
};

const homepageColorLabels: Array<[keyof Required<HomepageVisualConfig>["colors"], string, string]> = [
  ["pageBackground", "網站背景", "首頁主要底色"],
  ["primaryText", "主要文字", "標題與重要內容"],
  ["secondaryText", "次要文字", "說明與輔助內容"],
  ["accent", "品牌重點色", "眉題、重點與裝飾"],
  ["lightSurface", "淺色區塊", "淺色卡片與內容區"],
  ["darkSurface", "深色區塊", "深色章節與卡片"],
  ["onDark", "深色區塊文字", "深色背景上的文字"],
  ["primaryButton", "主要按鈕", "主要行動按鈕底色"],
  ["primaryButtonText", "按鈕文字", "主要按鈕上的文字"],
  ["border", "邊框", "卡片與分隔線"],
];

const homepageColorNames: Record<(typeof VISUAL_COLOR_PRESETS)[number], string> = {
  ink: "咖啡黑", coffee: "深咖啡", "warm-gray": "暖灰", ivory: "暖白", gold: "品牌金", white: "純白",
};

const homepageStylePresets: Array<{ id: string; name: string; description: string; colors: Required<HomepageVisualConfig>["colors"] }> = [
  { id: "kd-classic", name: "KD 經典", description: "保留目前品牌的暖白、咖啡黑與品牌金。", colors: homepageVisualDefaults.colors },
  { id: "warm-premium", name: "暖白精品", description: "明亮、柔和，適合大量商品與品牌內容。", colors: { ...homepageVisualDefaults.colors, pageBackground: "white", lightSurface: "ivory", secondaryText: "coffee", border: "ivory" } },
  { id: "dark-gallery", name: "深焙藝廊", description: "深色基調更有展覽感，重點色維持品牌金。", colors: { ...homepageVisualDefaults.colors, pageBackground: "coffee", primaryText: "white", secondaryText: "ivory", lightSurface: "ink", darkSurface: "ink", onDark: "white", primaryButton: "gold", primaryButtonText: "ink", border: "warm-gray" } },
  { id: "minimal", name: "極簡黑白", description: "降低裝飾色彩，讓影像與內容成為主角。", colors: { ...homepageVisualDefaults.colors, pageBackground: "white", primaryText: "ink", secondaryText: "warm-gray", accent: "ink", lightSurface: "white", darkSurface: "ink", onDark: "white", primaryButton: "ink", primaryButtonText: "white", border: "warm-gray" } },
];

const heroOverlayLabels: Record<string, string> = { current: "目前網站效果", soft: "柔和暗幕", strong: "精品深色", none: "無遮罩" };
const cardPresentationLabels: Record<string, string> = { current: "目前網站效果", minimal: "極簡留白", bordered: "精品細框" };

function HomepageVisualEditor({ value, setPath }: { value: HomepageVisualConfig | undefined; setPath: SetPath }) {
  const colors = { ...homepageVisualDefaults.colors, ...(value?.colors || {}) };
  const setColor = (key: keyof typeof colors, next: VisualColorValue) => setPath(["visual", "colors"], { ...colors, [key]: next });
  const applyPreset = (next: Required<HomepageVisualConfig>["colors"]) => setPath(["visual", "colors"], { ...next });
  const previewStyle = {
    "--home-preview-bg": visualColorHex(colors.pageBackground ?? "ivory"),
    "--home-preview-text": visualColorHex(colors.primaryText ?? "ink"),
    "--home-preview-muted": visualColorHex(colors.secondaryText ?? "warm-gray"),
    "--home-preview-accent": visualColorHex(colors.accent ?? "gold"),
    "--home-preview-surface": visualColorHex(colors.lightSurface ?? "ivory"),
    "--home-preview-dark": visualColorHex(colors.darkSurface ?? "coffee"),
    "--home-preview-on-dark": visualColorHex(colors.onDark ?? "white"),
    "--home-preview-button": visualColorHex(colors.primaryButton ?? "ink"),
    "--home-preview-button-text": visualColorHex(colors.primaryButtonText ?? "white"),
    "--home-preview-border": visualColorHex(colors.border ?? "warm-gray"),
  } as React.CSSProperties;

  return <Panel title="首頁視覺風格" description="用品牌色票與即時示意調整首頁風格；不需要理解程式色碼。" open>
    <div className="homepage-visual-studio">
      <section className="homepage-style-presets" aria-label="首頁風格快速套用">
        <div className="homepage-visual-heading"><div><span>01</span><h3>先選整體方向</h3></div><p>一鍵套用後仍可在下方微調每個位置。</p></div>
        <div className="homepage-style-preset-grid">
          {homepageStylePresets.map((preset) => <button type="button" key={preset.id} onClick={() => applyPreset(preset.colors)}>
            <span className="homepage-preset-swatches" aria-hidden="true">
              <i style={{ backgroundColor: visualColorHex(preset.colors.pageBackground ?? "ivory") }} />
              <i style={{ backgroundColor: visualColorHex(preset.colors.primaryText ?? "ink") }} />
              <i style={{ backgroundColor: visualColorHex(preset.colors.accent ?? "gold") }} />
            </span>
            <strong>{preset.name}</strong><small>{preset.description}</small>
          </button>)}
        </div>
      </section>

      <div className="homepage-visual-layout">
        <section className="homepage-color-controls">
          <div className="homepage-visual-heading"><div><span>02</span><h3>微調使用位置</h3></div><p>每一列都直接告訴你會影響首頁哪裡。</p></div>
          <div className="homepage-color-field-list">
            {homepageColorLabels.map(([key, label, help]) => <div className="homepage-color-field" key={key}>
              <div><strong>{label}</strong><small>{help}</small></div>
              <div className="homepage-color-swatches">
                {VISUAL_COLOR_PRESETS.map((preset) => <button type="button" key={preset} className={colors[key] === preset ? "is-selected" : ""} title={`${homepageColorNames[preset]} ${visualColorHex(preset).toUpperCase()}`} aria-label={`${label}：${homepageColorNames[preset]}`} onClick={() => setColor(key, preset)}>
                  <i style={{ backgroundColor: visualColorHex(preset) }} /><span>{homepageColorNames[preset]}</span>
                </button>)}
                <label className="homepage-custom-color" title="自訂顏色"><input aria-label={`${label}自訂色`} type="color" value={visualColorHex(colors[key] ?? "ivory")} onChange={(event) => setColor(key, event.target.value as `#${string}`)} /><span>自訂</span></label>
              </div>
            </div>)}
          </div>

          <div className="homepage-presentation-controls">
            <label><span><strong>Hero 影像遮罩</strong><small>控制首屏影像上的明暗層次</small></span><select value={value?.heroOverlayPreset ?? homepageVisualDefaults.heroOverlayPreset} onChange={(event) => setPath(["visual", "heroOverlayPreset"], event.target.value)}>{HOMEPAGE_HERO_OVERLAY_PRESETS.map((preset) => <option key={preset} value={preset}>{heroOverlayLabels[preset] || preset}</option>)}</select></label>
            <label><span><strong>卡片風格</strong><small>控制首頁內容卡片的呈現方式</small></span><select value={value?.cardPresentationPreset ?? homepageVisualDefaults.cardPresentationPreset} onChange={(event) => setPath(["visual", "cardPresentationPreset"], event.target.value)}>{HOMEPAGE_CARD_PRESENTATION_PRESETS.map((preset) => <option key={preset} value={preset}>{cardPresentationLabels[preset] || preset}</option>)}</select></label>
          </div>
        </section>

        <aside className="homepage-style-preview">
          <div className="homepage-visual-heading"><div><span>03</span><h3>即時風格示意</h3></div><p>這是配色示意，不會改動公開首頁。</p></div>
          <div className="homepage-style-preview-frame" style={previewStyle}>
            <div className="homepage-preview-hero">
              <small>KD COFFEE · 咖啡藝術工坊</small>
              <h4>為了理想的風味，<br />我們打造了自己的烘豆機。</h4>
              <p>從風味出發，找到真正適合自己的咖啡。</p>
              <div><b>開始挑咖啡</b><span>本月作品</span></div>
            </div>
            <div className="homepage-preview-surface">
              <small>OUR COFFEE</small><strong>每一杯，都有自己的性格。</strong>
              <div><i /><i /><i /></div>
            </div>
          </div>
          <p className="cms-help">目前 J.2B.3A 只改善後台操作與儲存；公開首頁套用會在後續獨立階段處理，避免一次改太多。</p>
        </aside>
      </div>
    </div>
  </Panel>;
}

function HomepageSeoEditor({ value, assets, setPath, onOpenPicker }: { value: any; assets: AssetOption[]; setPath: SetPath; onOpenPicker: () => void }) {
  const title = value?.title || ""; const description = value?.description || ""; const shareImage = value?.shareImage;
  return <Panel title="SEO 與社群分享" description="管理首頁搜尋標題、說明與分享圖片；這一階段只提供安全編輯與儲存。" open>
    <div className="cms-grid two">
      <label className="span-two">SEO 標題<input maxLength={70} value={title} onChange={(event) => setPath(["seo", "title"], event.target.value)} /><small>{title.length}/70</small></label>
      <label className="span-two">SEO 說明<textarea maxLength={180} value={description} onChange={(event) => setPath(["seo", "description"], event.target.value)} /><small>{description.length}/180</small></label>
    </div>
    <div className="cms-item-card"><h3>分享圖片</h3>{shareImage ? <><p>{shareImage.media?.url}</p><label>替代文字（必填）<input maxLength={240} value={shareImage.alt || ""} onChange={(event) => setPath(["seo", "shareImage"], { ...shareImage, alt: event.target.value })} /></label><div className="cms-toolbar-actions"><button type="button" onClick={onOpenPicker}>從素材庫更換</button><button type="button" onClick={() => setPath(["seo", "shareImage"], undefined)}>移除分享圖片</button></div></> : <button type="button" className="cms-secondary-button" disabled={!assets.length} onClick={onOpenPicker}>從素材庫選擇分享圖片</button>}</div>
    <p className="cms-help">分享圖片只接受素材庫中的圖片，影片不會出現在選擇器中。</p>
  </Panel>;
}

function Panel({ title, description, children, open = false, controls }: { title: string; description: string; children: React.ReactNode; open?: boolean; controls?: React.ReactNode }) {
  return <details className="cms-panel cms-collapsible" open={open}><summary><div><h2>{title}</h2><p>{description}</p></div><span>展開／收合</span></summary>{controls ? <div className="cms-panel-controls">{controls}</div> : null}<div className="cms-panel-body">{children}</div></details>;
}
function Visibility({ checked, onChange, label = "顯示此區塊" }: { checked: boolean; onChange: (checked: boolean) => void; label?: string }) { return <label className="cms-switch"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>; }

function HomepageCtaVisibility({ homepage, setPath }: { homepage: Record<string, any>; setPath: SetPath }) {
  const entries: Array<{ id: string; label: string; enabled: boolean; path: Path }> = [
    { id: "home001-primary", label: "HOME001 主要按鈕", enabled: homepage.hero?.primaryCtaEnabled !== false, path: ["hero", "primaryCtaEnabled"] },
    { id: "home001-secondary", label: "HOME001 次要按鈕", enabled: homepage.hero?.secondaryCtaEnabled !== false, path: ["hero", "secondaryCtaEnabled"] },
    ...(homepage.campaigns || []).flatMap((campaign: any, index: number) => [
      { id: `${campaign.id}-primary`, label: `${campaign.adminName || campaign.title || `活動 ${index + 1}`}主要按鈕`, enabled: campaign.ctaEnabled !== false, path: ["campaigns", index, "ctaEnabled"] },
      { id: `${campaign.id}-secondary`, label: `${campaign.adminName || campaign.title || `活動 ${index + 1}`}次要按鈕`, enabled: campaign.secondaryCtaEnabled !== false, path: ["campaigns", index, "secondaryCtaEnabled"] },
    ]),
    ...(homepage.home003?.cards || []).map((item: any, index: number) => ({ id: `${item.id}-cta`, label: `HOME003 ${item.title || `項目 ${index + 1}`}按鈕`, enabled: item.ctaEnabled !== false, path: ["home003", "cards", index, "ctaEnabled"] })),
    { id: "home006-cta", label: "HOME006 服務按鈕", enabled: homepage.home006?.ctaEnabled !== false, path: ["home006", "ctaEnabled"] },
    { id: "home010-cta", label: "HOME010 最後行動按鈕", enabled: homepage.home010?.ctaEnabled !== false, path: ["home010", "ctaEnabled"] },
  ];
  return <details className="cms-panel cms-collapsible homepage-cta-visibility"><summary><div><h2>首頁按鈕顯示狀態</h2><p>隱藏只停止前台顯示，文字與連結設定都會保留。</p></div><span>展開／收合</span></summary><div className="cms-panel-body owner-status-grid">{entries.map(entry=><article key={entry.id} className={`owner-surface ${entry.enabled ? "is-visible" : "is-hidden"}`}><strong>{entry.label}</strong><Visibility checked={entry.enabled} onChange={checked=>setPath(entry.path,checked)} label={entry.enabled?"顯示中":"已隱藏"}/></article>)}</div></details>;
}

function ItemActions({ visible, onVisibleChange, onMoveUp, onMoveDown, onRemove, removeLabel = "移除項目", disableUp, disableDown }: { visible?: boolean; onVisibleChange?: (visible: boolean) => void; onMoveUp: () => void; onMoveDown: () => void; onRemove: () => void; removeLabel?: string; disableUp: boolean; disableDown: boolean }) {
  return <div className="cms-item-actions"><div className="cms-item-actions-routine"><button type="button" onClick={onMoveUp} disabled={disableUp}>↑ 上移</button><button type="button" onClick={onMoveDown} disabled={disableDown}>↓ 下移</button>{onVisibleChange ? <Visibility checked={visible !== false} onChange={onVisibleChange} label={visible !== false ? "顯示中" : "已隱藏"} /> : null}</div><div className="cms-item-danger"><button type="button" className="danger-link" onClick={onRemove}>{removeLabel}</button></div></div>;
}

const motionPresetLabels: Record<string, [string, string]> = {
  none: ["無動畫", "內容立即顯示。"], fade: ["淡入", "只使用透明度柔和進場。"], "fade-up": ["由下淡入", "輕微上移並淡入。"],
  "slide-left": ["由左滑入", "從左側以克制距離進場。"], "slide-right": ["由右滑入", "從右側以克制距離進場。"],
  "scale-reveal": ["縮放揭示", "以細微縮放與淡入安定落位。"], editorial: ["精品敘事", "標題、內容與媒體依序揭示。"],
};

function SectionMotionEditor({ sectionKey, value, setPath }: { sectionKey: HomepageMotionSectionKey; value: unknown; setPath: SetPath }) {
  const motion = resolveHomepageMotion(value, sectionKey); const [previewKey, setPreviewKey] = useState(0);
  const update = (key: keyof HomepageSectionMotion, next: unknown) => setPath([sectionKey, "motion"], { ...motion, [key]: next });
  const seconds = (key: "delayMs" | "durationMs" | "staggerMs", minimum: number, maximum: number) => <span className="cms-motion-value"><input type="range" min={minimum} max={maximum} step="0.1" value={motion[key] / 1000} onChange={(event) => update(key, Math.round(Number(event.target.value) * 1000))} /><span>{(motion[key] / 1000).toFixed(1)} 秒</span></span>;
  return <section className="cms-motion-editor" aria-labelledby={`motion-${sectionKey}`}><div className="cms-subsection-head"><div><p className="eyebrow dark">MOTION</p><h3 id={`motion-${sectionKey}`}>動畫</h3><p>設定此區塊的進場節奏；訪客偏好減少動態時會自動停用。</p></div><Visibility checked={motion.enabled} onChange={(checked) => update("enabled", checked)} label={motion.enabled ? "動畫開啟" : "動畫關閉"} /></div><div className="cms-motion-controls"><label>進場方式<select value={motion.preset} onChange={(event) => update("preset", event.target.value)}>{HOMEPAGE_MOTION_PRESETS.map((preset) => <option key={preset} value={preset}>{motionPresetLabels[preset][0]}｜{motionPresetLabels[preset][1]}</option>)}</select></label><label>延遲{seconds("delayMs", 0, 10)}</label><label>動畫時間{seconds("durationMs", .1, 5)}</label><label>移動距離<span className="cms-motion-value"><input type="range" min="0" max="80" step="4" value={motion.distancePx} onChange={(event) => update("distancePx", Number(event.target.value))} /><span>{motion.distancePx} px</span></span></label><label>項目間隔{seconds("staggerMs", 0, 2)}</label></div><div className="cms-motion-preview-shell"><div key={previewKey} className="cms-motion-preview" data-home-motion={motion.activePreset} style={homepageMotionCssVariables(motion) as any}><small>KD COFFEE</small><strong>一段有節奏的精品敘事</strong><span>區塊內容與媒體會依目前未儲存的設定重播。</span><i aria-hidden="true" /></div></div><div className="cms-motion-actions"><button type="button" className="cms-secondary-button" onClick={() => setPreviewKey((key) => key + 1)}>預覽動畫</button><button type="button" className="cms-secondary-button" onClick={() => setPath([sectionKey, "motion"], { ...HOMEPAGE_SECTION_MOTION_DEFAULTS[sectionKey] })}>恢復此區塊預設動畫</button></div><p className="cms-help">預覽不會寫入資料；變更只會在按下「儲存全部」後套用至前台。</p></section>;
}

const timingLabels: Array<[keyof HeroTiming, string]> = [["mediaDuration", "烘豆機浮現時間"], ["eyebrowStart", "品牌文字開始"], ["headlineLine1Start", "主標第一行"], ["headlineLine2Start", "主標第二行"], ["leadStart", "說明文字"], ["primaryCtaStart", "主要按鈕"], ["secondaryCtaStart", "次要動作"], ["trustStart", "信任資訊"]];

function HeroEditor({ value, products, setPath, uploadHeroImage, onOpenLibrary }: { value: any; products: ProductOption[]; setPath: SetPath; uploadHeroImage: (file: File, assetId: string) => Promise<MediaAsset>; onOpenLibrary: (target: "desktop" | "mobile") => void }) {
  const timing = resolveHeroTiming(value.timing); const [previewKey, setPreviewKey] = useState(0);
  const updateTiming = (key: keyof HeroTiming, seconds: number) => setPath(["hero", "timing"], resolveHeroTiming({ ...timing, [key]: Math.round(Math.max(0, Math.min(10, Number.isFinite(seconds) ? seconds : 0)) * 10) * 100 }));
  const desktopMedia = resolveMediaAsset(value.desktopMedia) || resolveMediaAsset(value.media, value.poster);
  const mobileMedia = resolveMediaAsset(value.mobileMedia);
  return <Panel title="HOME001｜主視覺" description="桌機與手機可分別設定主視覺；手機未設定時會自動使用桌機／既有 Hero。" open controls={<Visibility checked={value.enabled !== false} onChange={(checked) => setPath(["hero", "enabled"], checked)} />}>
    <div className="cms-grid two"><label>品牌小標<input value={value.eyebrow || ""} onChange={(event) => setPath(["hero", "eyebrow"], event.target.value)} /></label><label>主要按鈕文字<input value={value.buttonLabel || ""} onChange={(event) => setPath(["hero", "buttonLabel"], event.target.value)} /></label><label>標題第一行<input value={value.titleLines?.[0] || ""} onChange={(event) => setPath(["hero", "titleLines"], [event.target.value, value.titleLines?.[1] || ""])} /></label><label>標題第二行<input value={value.titleLines?.[1] || ""} onChange={(event) => setPath(["hero", "titleLines"], [value.titleLines?.[0] || "", event.target.value])} /></label><label className="span-two">核心文案<textarea value={value.lead || ""} onChange={(event) => setPath(["hero", "lead"], event.target.value)} /></label><label>次要按鈕文字<input value={value.secondaryLabel || ""} onChange={(event) => setPath(["hero", "secondaryLabel"], event.target.value)} /></label><SmartLinkPicker editorId="hero-primary" label="主要按鈕" buttonText={value.buttonLabel} value={value.buttonHref} products={products} onChange={(link) => setPath(["hero", "buttonHref"], link)} /><SmartLinkPicker editorId="hero-secondary" label="次要按鈕" buttonText={value.secondaryLabel} value={value.secondaryHref} products={products} onChange={(link) => setPath(["hero", "secondaryHref"], link)} /><label className="span-two">信任資訊（每行一項）<textarea value={(value.trustCues || ["不用登入即可購買", "7-ELEVEN 取貨付款", "工作室自取"]).join("\n")} onChange={(event) => setPath(["hero", "trustCues"], event.target.value.split(/\r?\n/u).filter(Boolean))} /></label></div>
    <div className="cms-grid two hero-responsive-media-editor">
      <section className="cms-item-card"><div className="cms-subsection-head"><div><p className="eyebrow dark">DESKTOP HERO</p><h3>桌機 Hero 素材</h3><p>{value.desktopMedia ? "目前使用獨立桌機素材。" : "目前沿用既有 Hero 素材；不設定也不會讓原本 Hero 消失。"}</p></div></div><MediaUploader label="桌機 Hero 圖片／影片" usage="hero" value={desktopMedia} onImageUpload={(file) => uploadHeroImage(file, "IMG0001-DESKTOP")} onChange={(media) => setPath(["hero", "desktopMedia"], media)} onRemove={value.desktopMedia ? () => setPath(["hero", "desktopMedia"], undefined) : undefined} /><div className="cms-toolbar-actions"><button type="button" className="cms-secondary-button" onClick={() => onOpenLibrary("desktop")}>從素材庫選擇</button>{value.desktopMedia ? <button type="button" className="cms-secondary-button" onClick={() => setPath(["hero", "desktopMedia"], undefined)}>恢復原本 Hero</button> : null}</div></section>
      <section className="cms-item-card"><div className="cms-subsection-head"><div><p className="eyebrow dark">MOBILE HERO</p><h3>手機 Hero 素材（選填）</h3><p>{mobileMedia ? "手機會使用這個獨立素材。" : "未設定時會自動 fallback 使用桌機／既有 Hero。"}</p></div></div><MediaUploader label="手機 Hero 圖片／影片" usage="hero" value={mobileMedia} onImageUpload={(file) => uploadHeroImage(file, "IMG0001-MOBILE")} onChange={(media) => setPath(["hero", "mobileMedia"], media)} onRemove={mobileMedia ? () => setPath(["hero", "mobileMedia"], undefined) : undefined} /><div className="cms-toolbar-actions"><button type="button" className="cms-secondary-button" onClick={() => onOpenLibrary("mobile")}>從素材庫選擇</button>{mobileMedia ? <button type="button" className="cms-secondary-button" onClick={() => setPath(["hero", "mobileMedia"], undefined)}>清除手機素材</button> : null}</div></section>
    </div>
    <div className="hero-timing-editor"><div className="hero-timing-head"><Visibility checked={value.motionEnabled !== false} onChange={(checked) => setPath(["hero", "motionEnabled"], checked)} /><div><button type="button" className="cms-secondary-button" onClick={() => setPath(["hero", "timing"], { ...PREMIUM_HERO_TIMING })}>恢復精品預設值</button><button type="button" className="cms-secondary-button" onClick={() => setPreviewKey((key) => key + 1)}>預覽進場動畫</button></div></div><div className="hero-timing-grid">{timingLabels.map(([key, label]) => <label key={key}><span className="hero-timing-label">{label}</span><input type="range" min="0" max="10" step="0.1" value={timing[key] / 1000} onChange={(event) => updateTiming(key, Number(event.target.value))} /><span className="hero-timing-value"><input type="number" min="0" max="10" step="0.1" value={(timing[key] / 1000).toFixed(1)} onChange={(event) => updateTiming(key, Number(event.target.value))} /><span>秒</span></span></label>)}</div><div className="hero-timing-preview" key={previewKey} data-playing={previewKey > 0}><small style={{ animationDelay: `${timing.eyebrowStart}ms` }}>KD COFFEE</small><strong style={{ animationDelay: `${timing.headlineLine1Start}ms` }}>為了理想的風味，</strong><strong style={{ animationDelay: `${timing.headlineLine2Start}ms` }}>我們打造自己的烘豆機。</strong><span style={{ animationDelay: `${timing.leadStart}ms` }}>每一個細節，累積成一杯好咖啡。</span></div><p className="cms-help">預覽只會在這裡重播，不會儲存；按「儲存全部」後才會更新前台。</p></div>
  </Panel>;
}

function CampaignEditor({ section, campaigns, products, setPath, uploadImage }: { section: any; campaigns: any[]; products: ProductOption[]; setPath: SetPath; uploadImage: UploadImage }) {
  const add = () => setPath(["campaigns"], [...campaigns, { id: stableId("CAMPAIGN"), adminName: "新活動", enabled: false, sort: campaigns.length + 1, eyebrow: "LATEST AT KD COFFEE", title: "新活動", description: "", details: [], ctaLabel: "了解更多", ctaHref: "/works", startDate: "", endDate: "", placements: ["frontend_campaign_section", "product_pages"] }]);
  return <Panel title="Campaign｜本月活動" description="直接管理既有 canonical Campaign 實體，不建立第二份活動資料。" controls={<Visibility checked={section.enabled !== false} onChange={(checked) => setPath(["campaignSection", "enabled"], checked)} />}>
    <div className="cms-grid two"><label>區塊小標<input value={section.eyebrow || ""} onChange={(event) => setPath(["campaignSection", "eyebrow"], event.target.value)} /></label><label>區塊標題<input value={section.title || ""} onChange={(event) => setPath(["campaignSection", "title"], event.target.value)} /></label><label className="span-two">區塊說明<textarea value={section.intro || ""} onChange={(event) => setPath(["campaignSection", "intro"], event.target.value)} /></label><label>顯示數量上限<input type="number" min="0" max="20" value={section.displayLimit || 0} onChange={(event) => setPath(["campaignSection", "displayLimit"], Math.max(0, Number(event.target.value)))} /></label></div>
    <div className="cms-collection-head"><strong>{campaigns.length} 個活動</strong><button type="button" className="cms-secondary-button" onClick={add}>＋ 建立活動</button></div>
    <div className="cms-item-list">{campaigns.map((campaign, index) => <article className="cms-item-card" key={campaign.id}>
      <div className="cms-item-toolbar"><b>{campaign.adminName || campaign.title}</b><div><Visibility checked={campaign.enabled !== false} onChange={(checked) => setPath(["campaigns", index, "enabled"], checked)} /><label>排序 <input type="number" value={campaign.sort || 0} onChange={(event) => setPath(["campaigns", index, "sort"], Number(event.target.value))} /></label></div></div>
      <div className="cms-grid two"><label>管理名稱<input value={campaign.adminName || ""} onChange={(event) => setPath(["campaigns", index, "adminName"], event.target.value)} /></label><label>英文小標<input value={campaign.eyebrow || ""} onChange={(event) => setPath(["campaigns", index, "eyebrow"], event.target.value)} /></label><label>活動標題<input value={campaign.title || ""} onChange={(event) => setPath(["campaigns", index, "title"], event.target.value)} /></label><label className="span-two">活動說明<textarea value={campaign.description || ""} onChange={(event) => setPath(["campaigns", index, "description"], event.target.value)} /></label><label className="span-two">活動細節（每行一項）<textarea value={(campaign.details || []).join("\n")} onChange={(event) => setPath(["campaigns", index, "details"], event.target.value.split(/\r?\n/u).filter(Boolean))} /></label><label>主要 CTA<input value={campaign.ctaLabel || ""} onChange={(event) => setPath(["campaigns", index, "ctaLabel"], event.target.value)} /></label><SmartLinkPicker editorId={`campaign-${campaign.id}-primary`} label="主要按鈕" buttonText={campaign.ctaLabel} value={campaign.ctaHref} products={products} onChange={(link) => setPath(["campaigns", index, "ctaHref"], link)} /><label>次要 CTA（選填）<input value={campaign.secondaryLabel || ""} onChange={(event) => setPath(["campaigns", index, "secondaryLabel"], event.target.value)} /></label><SmartLinkPicker editorId={`campaign-${campaign.id}-secondary`} label="次要按鈕" buttonText={campaign.secondaryLabel} value={campaign.secondaryHref} products={products} onChange={(link) => setPath(["campaigns", index, "secondaryHref"], link)} /><label>開始日期<input type="date" value={campaign.startDate || ""} onChange={(event) => setPath(["campaigns", index, "startDate"], event.target.value)} /></label><label>結束日期<input type="date" value={campaign.endDate || ""} onChange={(event) => setPath(["campaigns", index, "endDate"], event.target.value)} /></label><div className="span-two"><MediaUploader label="Campaign 圖片／影片" usage="content" value={resolveMediaAsset(campaign.media, campaign.image)} onImageUpload={(file) => uploadImage(file, ["campaigns", index, "image"], `CAMPAIGN-${index + 1}`, `kdcoffee-campaign-${campaign.id}`, "campaign")} onChange={(media) => setPath(["campaigns", index, "media"], media)} onRemove={campaign.media ? () => setPath(["campaigns", index, "media"], undefined) : undefined} /></div></div>
    </article>)}</div>
    <SectionMotionEditor sectionKey="campaignSection" value={section.motion} setPath={setPath} />
  </Panel>;
}

function ContentSectionEditor({ sectionKey, value, collectionKey, products = [], setPath, uploadImage, assets }: { sectionKey: string; value: any; collectionKey: "cards" | "steps"; products?: ProductOption[]; setPath: SetPath; uploadImage: UploadImage; assets: AssetOption[] }) {
  const items: any[] = Array.isArray(value[collectionKey]) ? value[collectionKey] : [];
  const add = () => {
    if (items.length >= HOMEPAGE_COLLECTION_LIMIT) return;
    const prefix = sectionKey === "home005" ? "HOME005-STEP" : `${sectionKey.toUpperCase()}-ITEM`;
    const item: any = { id: stableId(prefix), enabled: true, order: items.length, title: "新項目", text: "", mediaItems: [] };
    if (sectionKey === "home003") Object.assign(item, { eyebrow: "", button: "開始", href: "/works" });
    setPath([sectionKey, collectionKey], [...items, item]);
  };
  return <Panel title={`${sectionKey.toUpperCase()}｜${sectionNames[sectionKey]}`} description={value.purpose || "管理區塊內容與項目。"} controls={<Visibility checked={value.enabled !== false} onChange={(checked) => setPath([sectionKey, "enabled"], checked)} />}>
    <div className="cms-grid two"><label>區塊標題<input value={value.title || ""} onChange={(event) => setPath([sectionKey, "title"], event.target.value)} /></label><label>區塊說明<textarea value={value.intro ?? value.text ?? ""} onChange={(event) => setPath([sectionKey, value.intro !== undefined ? "intro" : "text"], event.target.value)} /></label></div>
    <div className="cms-collection-head"><strong>{items.length} 個項目</strong><button type="button" className="cms-secondary-button" onClick={add}>＋ 新增項目</button></div>
    <div className="cms-item-list">{items.map((item, index) => <article className="cms-item-card" key={item.id}>
      <div className="cms-item-toolbar"><b>{String(index + 1).padStart(2, "0")}</b><ItemActions visible={item.enabled !== false} onVisibleChange={(checked) => setPath([sectionKey, collectionKey, index, "enabled"], checked)} onMoveUp={() => setPath([sectionKey, collectionKey], moveItem(items, index, -1))} onMoveDown={() => setPath([sectionKey, collectionKey], moveItem(items, index, 1))} disableUp={index === 0} disableDown={index === items.length - 1} onRemove={() => confirmRemoval() && setPath([sectionKey, collectionKey], items.filter((_, itemIndex) => itemIndex !== index))} /></div>
      <div className="cms-grid two">{sectionKey === "home003" ? <label>情境小標<input value={item.eyebrow || ""} onChange={(event) => setPath([sectionKey, collectionKey, index, "eyebrow"], event.target.value)} /></label> : null}<label>標題<input value={item.title || ""} onChange={(event) => setPath([sectionKey, collectionKey, index, "title"], event.target.value)} /></label><label className="span-two">內文<textarea value={item.text || ""} onChange={(event) => setPath([sectionKey, collectionKey, index, "text"], event.target.value)} /></label>{sectionKey === "home003" ? <><label>按鈕文字<input value={item.button || ""} onChange={(event) => setPath([sectionKey, collectionKey, index, "button"], event.target.value)} /></label><SmartLinkPicker editorId={`home003-${item.id}`} label="情境按鈕" buttonText={item.button} value={item.href} products={products} onChange={(link) => setPath([sectionKey, collectionKey, index, "href"], link)} /></> : null}</div>
      <NestedMediaEditor owner={item} path={[sectionKey, collectionKey, index]} setPath={setPath} uploadImage={uploadImage} assets={assets} label={`${sectionNames[sectionKey]} ${index + 1}`} />
    </article>)}</div><SectionMotionEditor sectionKey={sectionKey as HomepageMotionSectionKey} value={value.motion} setPath={setPath} />
  </Panel>;
}

function NestedMediaEditor({ owner, path, setPath, uploadImage, assets, label }: { owner: any; path: Path; setPath: SetPath; uploadImage: UploadImage; assets: AssetOption[]; label: string }) {
  const mediaItems: HomepageMediaReference[] | undefined = Array.isArray(owner.mediaItems) ? owner.mediaItems : undefined;
  const legacy = resolveMediaAsset(owner.media, owner.image);
  const beginCollection = () => {
    const initial: HomepageMediaReference[] = legacy ? [{ id: stableId("MEDIA"), enabled: true, primary: true, order: 0, image: owner.image, media: owner.media, alt: owner.alt || owner.title }] : [];
    setPath([...path, "mediaItems"], [...initial, { id: stableId("MEDIA"), enabled: true, primary: initial.length === 0, order: initial.length, alt: owner.alt || owner.title || "" }]);
  };
  if (!mediaItems) return <div className="cms-legacy-media"><MediaUploader label={`${label}｜目前媒體`} usage="content" value={legacy} onImageUpload={(file) => uploadImage(file, [...path, "image"], owner.imageId || stableId("IMG"))} onChange={(media) => setPath([...path, "media"], media)} onRemove={legacy ? () => { if (confirmRemoval()) { setPath([...path, "media"], undefined); setPath([...path, "image"], ""); } } : undefined} /><button type="button" className="cms-secondary-button" onClick={beginCollection}>＋ 新增另一個媒體</button></div>;
  return <MediaReferenceEditor items={mediaItems} path={[...path, "mediaItems"]} setPath={setPath} uploadImage={uploadImage} assets={assets} label={label} />;
}

function MediaReferenceEditor({ items, path, setPath, uploadImage, assets, label }: { items: HomepageMediaReference[]; path: Path; setPath: SetPath; uploadImage: UploadImage; assets: AssetOption[]; label: string }) {
  const addBlank = () => items.length < HOMEPAGE_COLLECTION_LIMIT && setPath(path, [...items, { id: stableId("MEDIA"), enabled: true, primary: items.length === 0, order: items.length, alt: label }]);
  const addAsset = (asset: AssetOption) => setPath(path, [...items, { id: stableId("MEDIA"), enabled: true, primary: items.length === 0, order: items.length, image: asset.path, media: localImageMedia(asset.path), alt: asset.alt || asset.name }]);
  return <div className="cms-media-editor"><div className="cms-collection-head"><strong>媒體內容（{items.length}）</strong><div><AssetPicker assets={assets} onAdd={addAsset} /><button type="button" className="cms-secondary-button" onClick={addBlank}>＋ 上傳／YouTube</button></div></div>{items.length === 0 ? <p className="cms-empty-state">目前還沒有媒體。零媒體會顯示純文字版面。</p> : <div className="cms-media-list">{items.map((item, index) => <article key={item.id} className={`cms-media-row ${item.primary ? "is-primary" : ""}`}>
    <div className="cms-media-row-head"><b>{String(index + 1).padStart(2, "0")} {item.media?.type === "youtube" ? "YouTube" : item.media?.type === "video" ? "影片" : "圖片"}</b><Visibility checked={item.enabled !== false} onChange={(checked) => setPath([...path, index, "enabled"], checked)} /></div>
    <MediaUploader label={label} usage="content" value={resolveMediaAsset(item.media, item.image)} onImageUpload={(file) => uploadImage(file, [...path, index, "image"], `HOME-MEDIA-${index + 1}`)} onChange={(media) => setPath([...path, index, "media"], media)} onRemove={resolveMediaAsset(item.media, item.image) ? () => { if (confirmRemoval()) { setPath([...path, index, "media"], undefined); setPath([...path, index, "image"], ""); } } : undefined} />
    <YouTubeField value={item.media} onChange={(media) => setPath([...path, index, "media"], media)} />
    <div className="cms-grid two"><label>替代文字<input value={item.alt || ""} onChange={(event) => setPath([...path, index, "alt"], event.target.value)} /></label><label>顯示標題<input value={item.title || ""} onChange={(event) => setPath([...path, index, "title"], event.target.value)} /></label><label className="span-two">圖片說明<input value={item.caption || ""} onChange={(event) => setPath([...path, index, "caption"], event.target.value)} /></label></div>
    <div className="cms-row-actions"><button type="button" onClick={() => setPath(path, moveItem(items, index, -1))} disabled={index === 0}>↑ 上移</button><button type="button" onClick={() => setPath(path, moveItem(items, index, 1))} disabled={index === items.length - 1}>↓ 下移</button><button type="button" onClick={() => setPath(path, items.map((entry, itemIndex) => ({ ...entry, primary: itemIndex === index })))}>★ 設為主媒體</button><button type="button" className="danger-link" onClick={() => confirmRemoval() && setPath(path, items.filter((_, itemIndex) => itemIndex !== index))}>移除引用</button></div>
  </article>)}</div>}</div>;
}

function AssetPicker({ assets, onAdd }: { assets: AssetOption[]; onAdd: (asset: AssetOption) => void }) {
  const available = useMemo(() => assets.filter((asset) => asset.path && asset.status === "active"), [assets]); const [selected, setSelected] = useState("");
  return <span className="cms-asset-picker"><select aria-label="從素材庫選擇" value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">從素材庫選擇…</option>{available.map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}</select><button type="button" className="cms-secondary-button" disabled={!selected} onClick={() => { const asset = available.find((entry) => entry.id === selected); if (asset) onAdd(asset); }}>＋ 從素材庫加入</button></span>;
}

function YouTubeField({ value, onChange }: { value?: MediaAsset; onChange: (media: MediaAsset) => void }) {
  const [url, setUrl] = useState(value?.type === "youtube" ? value.url : ""); const [error, setError] = useState("");
  return <div className="cms-youtube-field"><label>YouTube 網址<input value={url} placeholder="https://www.youtube.com/watch?v=…" onChange={(event) => setUrl(event.target.value)} /></label><button type="button" className="cms-secondary-button" onClick={() => { try { const videoId = parseYouTubeUrl(url); onChange(youtubeMedia(videoId, youtubeWatchUrl(videoId))); setError(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "YouTube 網址無效"); } }}>套用 YouTube</button>{error ? <small role="alert">{error}</small> : null}</div>;
}

function Home004Editor({ value, products, setPath }: { value: any; products: ProductOption[]; setPath: SetPath }) {
  const slugs: string[] = Array.isArray(value.productSlugs) ? value.productSlugs : []; const resolution = resolveHome004Recommendations(slugs, products); const selected = new Set(slugs);
  return <Panel title="HOME004｜推薦作品" description="只儲存商品引用；名稱、價格、庫存與媒體仍由商品系統提供。" controls={<Visibility checked={value.enabled !== false} onChange={(checked) => setPath(["home004", "enabled"], checked)} />}>
    <div className="cms-grid two"><label>區塊標題<input value={value.title || ""} onChange={(event) => setPath(["home004", "title"], event.target.value)} /></label><label>區塊說明<textarea value={value.intro || ""} onChange={(event) => setPath(["home004", "intro"], event.target.value)} /></label></div>
    {!resolution.valid ? <div className="cms-message" role="alert">{resolution.errors.join(" ")}</div> : null}
    <div className="cms-item-list">{slugs.map((slug, index) => <div className="cms-product-reference" key={`${slug}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b><select value={slug} onChange={(event) => setPath(["home004", "productSlugs"], slugs.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}>{products.map((product) => { const reasons = home004IneligibilityReasons(product); return <option key={product.slug} value={product.slug} disabled={(reasons.length > 0 || (selected.has(product.slug) && product.slug !== slug))}>{product.name}{reasons.length ? `｜${reasons.join("、")}` : ""}</option>; })}</select><button type="button" onClick={() => setPath(["home004", "productSlugs"], moveItem(slugs, index, -1))} disabled={index === 0}>↑</button><button type="button" onClick={() => setPath(["home004", "productSlugs"], moveItem(slugs, index, 1))} disabled={index === slugs.length - 1}>↓</button><button type="button" className="danger-link" onClick={() => confirmRemoval("確定要從首頁推薦移除此作品嗎？\n商品資料本身不會被刪除。") && setPath(["home004", "productSlugs"], slugs.filter((_, itemIndex) => itemIndex !== index))}>移除</button></div>)}</div>
    <button type="button" className="cms-secondary-button" disabled={slugs.length >= HOMEPAGE_PRODUCT_LIMIT || !products.some((product) => !selected.has(product.slug) && home004IneligibilityReasons(product).length === 0)} onClick={() => { const product = products.find((entry) => !selected.has(entry.slug) && home004IneligibilityReasons(entry).length === 0); if (product) setPath(["home004", "productSlugs"], [...slugs, product.slug]); }}>＋ 新增推薦作品</button>
    <SectionMotionEditor sectionKey="home004" value={value.motion} setPath={setPath} />
  </Panel>;
}

function Home006Editor({ value, products, setPath, uploadImage, assets }: { value: any; products: ProductOption[]; setPath: SetPath; uploadImage: UploadImage; assets: AssetOption[] }) {
  return <Panel title="HOME006｜專屬烘焙" description="管理既有服務說明；不改變商業規則。" controls={<Visibility checked={value.enabled !== false} onChange={(checked) => setPath(["home006", "enabled"], checked)} />}><div className="cms-grid two"><label>標題<input value={value.title || ""} onChange={(event) => setPath(["home006", "title"], event.target.value)} /></label><label>按鈕文字<input value={value.button || ""} onChange={(event) => setPath(["home006", "button"], event.target.value)} /></label><label className="span-two">說明<textarea value={value.text || ""} onChange={(event) => setPath(["home006", "text"], event.target.value)} /></label><label className="span-two">適用條件（每行一項）<textarea value={(value.points || []).join("\n")} onChange={(event) => setPath(["home006", "points"], event.target.value.split(/\r?\n/u).filter(Boolean))} /></label><SmartLinkPicker editorId="home006-cta" label="服務按鈕" buttonText={value.button} value={value.href} products={products} onChange={(link) => setPath(["home006", "href"], link)} /></div><NestedMediaEditor owner={value} path={["home006"]} setPath={setPath} uploadImage={uploadImage} assets={assets} label="專屬烘焙" /><SectionMotionEditor sectionKey="home006" value={value.motion} setPath={setPath} /></Panel>;
}

function Home008Editor({ value, setPath, uploadImage, assets }: { value: any; setPath: SetPath; uploadImage: UploadImage; assets: AssetOption[] }) {
  const key = Array.isArray(value.mediaItems) ? "mediaItems" : "images"; const items: HomepageMediaReference[] = Array.isArray(value[key]) ? value[key] : [];
  return <Panel title="HOME008｜工作室媒體收藏" description="Stage + Film Strip 可安全管理大量圖片、影片與 YouTube。" controls={<Visibility checked={value.enabled !== false} onChange={(checked) => setPath(["home008", "enabled"], checked)} />}><div className="cms-grid two"><label>標題<input value={value.title || ""} onChange={(event) => setPath(["home008", "title"], event.target.value)} /></label><label>說明<textarea value={value.text || ""} onChange={(event) => setPath(["home008", "text"], event.target.value)} /></label></div><MediaReferenceEditor items={items} path={["home008", key]} setPath={setPath} uploadImage={uploadImage} assets={assets} label="工作室" /><SectionMotionEditor sectionKey="home008" value={value.motion} setPath={setPath} /></Panel>;
}

function ReviewsEditor({ value, setPath }: { value: any; setPath: SetPath }) {
  const items: any[] = Array.isArray(value.items) ? value.items : [];
  return <Panel title="HOME009｜真實評價" description="只有姓名、內容與來源都完整的真實評價才會顯示。" controls={<Visibility checked={value.enabled !== false} onChange={(checked) => setPath(["home009", "enabled"], checked)} />}><div className="cms-grid two"><label>標題<input value={value.title || ""} onChange={(event) => setPath(["home009", "title"], event.target.value)} /></label><label>說明<input value={value.intro || ""} onChange={(event) => setPath(["home009", "intro"], event.target.value)} /></label></div><div className="cms-item-list">{items.map((item, index) => <article className="cms-item-card" key={item.id}><div className="cms-grid two"><label>姓名<input value={item.name || ""} onChange={(event) => setPath(["home009", "items", index, "name"], event.target.value)} /></label><label>來源<input value={item.source || ""} onChange={(event) => setPath(["home009", "items", index, "source"], event.target.value)} /></label><label className="span-two">評價內容<textarea value={item.text || ""} onChange={(event) => setPath(["home009", "items", index, "text"], event.target.value)} /></label></div><ItemActions onMoveUp={() => setPath(["home009", "items"], moveItem(items, index, -1))} onMoveDown={() => setPath(["home009", "items"], moveItem(items, index, 1))} disableUp={index === 0} disableDown={index === items.length - 1} onRemove={() => confirmRemoval() && setPath(["home009", "items"], items.filter((_, itemIndex) => itemIndex !== index))} /></article>)}</div><button type="button" className="cms-secondary-button" onClick={() => setPath(["home009", "items"], [...items, { id: stableId("REVIEW"), text: "", name: "", source: "" }])}>＋ 新增已驗證評價</button><SectionMotionEditor sectionKey="home009" value={value.motion} setPath={setPath} /></Panel>;
}

function Home010Editor({ value, products, setPath }: { value: any; products: ProductOption[]; setPath: SetPath }) {
  return <Panel title="HOME010｜最後購買引導" description="管理首頁結尾的購買行動。" controls={<Visibility checked={value.enabled !== false} onChange={(checked) => setPath(["home010", "enabled"], checked)} />}><div className="cms-grid two"><label>標題<input value={value.title || ""} onChange={(event) => setPath(["home010", "title"], event.target.value)} /></label><label>按鈕文字<input value={value.button || ""} onChange={(event) => setPath(["home010", "button"], event.target.value)} /></label><label className="span-two">說明<textarea value={value.text || ""} onChange={(event) => setPath(["home010", "text"], event.target.value)} /></label><SmartLinkPicker editorId="home010-cta" label="最後行動按鈕" buttonText={value.button} value={value.href} products={products} onChange={(link) => setPath(["home010", "href"], link)} /></div><SectionMotionEditor sectionKey="home010" value={value.motion} setPath={setPath} /></Panel>;
}
