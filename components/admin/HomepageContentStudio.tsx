"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";
import { HomepagePresentationEditor, HomepagePresentationProvider } from "./HomepagePresentationEditor";
import { HeroEditor, CampaignEditor, ContentSectionEditor, Home004Editor, Home006Editor, Home008Editor, ReviewsEditor, Home010Editor, HomepageSectionOrderEditor, HomepageNavigationEditor, HomepageCtaVisibility, HomepageVisualEditor, HomepageSeoEditor } from "./HomepageEditors";
import ImageLibraryPicker from "./ImageLibraryPicker";
import HeroMediaLibraryPicker from "./HeroMediaLibraryPicker";
import { SmartLinkEditingProvider } from "./SmartLinkPicker";
import { updateHomepageBasePresentation, updateHomepageMobilePresentation, updateHomepageMobileEnabled, type HomepageBasePresentationEdit } from "@/lib/homepagePresentationAdmin";
import { HOMEPAGE_STUDIO_AREAS, homepageAreaSnapshot, homepageDraftSnapshot, isHomepagePresentationArea, type HomepageStudioArea, type HomepageStudioDevice } from "@/lib/homepageStudio";
import { validateHomepageCms } from "@/lib/homepageCms";
import { validateHomepageCampaigns } from "@/lib/homepageCampaignValidation";
import { resolveHome004Recommendations } from "@/lib/home004Recommendations";
import type { HomepagePresentationKey } from "@/lib/homepagePresentation";
import type { AssetRecord } from "@/lib/assets";
import { localImageMedia, type MediaAsset } from "@/lib/media";
import styles from "./HomepageStudio.module.css";

type Payload = { homepage: Record<string, any>; products: any[]; assets: AssetRecord[]; publishedPages: import("@/lib/cmsLinks").PublishedCmsPage[] };
export default function HomepageContentStudio() {
  const [data, setData] = useState<Payload | null>(null), [baseline, setBaseline] = useState("");
  const [message, setMessage] = useState(""), [loadingError, setLoadingError] = useState("");
  const [saving, setSaving] = useState(false), [presentationInvalid, setPresentationInvalid] = useState(false);
  const [area, setArea] = useState<HomepageStudioArea>("hero"), [device, setDevice] = useState<HomepageStudioDevice>("desktop");
  const [group, setGroup] = useState<"content" | "presentation">("content");
  const [seoPicker, setSeoPicker] = useState(false), [heroPicker, setHeroPicker] = useState<"desktop" | "mobile" | null>(null);
  const [ready, setReady] = useState(false), [previewError, setPreviewError] = useState("");
  const frame = useRef<HTMLIFrameElement>(null), saveLock = useRef(false), toolbar = useRef<HTMLElement>(null), saveAction = useRef<() => void>(() => {});
  const [toolbarHeight, setToolbarHeight] = useState(130), [previewWidth, setPreviewWidth] = useState(0);
  const previewBox = useRef<HTMLDivElement>(null), previewHost = useRef<HTMLDivElement>(null);
  const latest = useRef(data); latest.current = data;
  const latestArea = useRef(area); latestArea.current = area;
  const lastSentDraft = useRef(""), lastSentArea = useRef("");
  const dirty = Boolean(data) && (JSON.stringify(data?.homepage) !== baseline || presentationInvalid);
  const currentArea = HOMEPAGE_STUDIO_AREAS.find(item => item.key === area)!;
  const sendDraft = useCallback(() => {
    const homepage = latest.current?.homepage, target = frame.current?.contentWindow;
    if (!homepage || !target) return;
    const snapshot = homepageDraftSnapshot(homepage);
    if (snapshot === lastSentDraft.current) return;
    target.postMessage({ type: "kd-homepage-draft", homepage }, window.location.origin);
    lastSentDraft.current = snapshot;
  }, []);
  const sendFocus = useCallback(() => {
    const target = frame.current?.contentWindow;
    if (!target || lastSentArea.current === latestArea.current) return;
    target.postMessage({ type: "kd-homepage-focus", area: latestArea.current }, window.location.origin);
    lastSentArea.current = latestArea.current;
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    Promise.all(["/api/admin/homepage", "/api/admin/assets"].map(async url => {
      const response = await fetch(url, { cache: "no-store", signal: abort.signal }), payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "首頁讀取失敗");
      return payload;
    })).then(([payload, library]) => {
      const next = { ...payload, assets: library.assets || [] }; setData(next); setBaseline(JSON.stringify(next.homepage));
    }).catch(error => { if (!abort.signal.aborted) setLoadingError(String(error.message || error)); });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    const node = toolbar.current; if (!node) return;
    const observer = new ResizeObserver(() => setToolbarHeight(node.getBoundingClientRect().height));
    observer.observe(node); return () => observer.disconnect();
  }, [Boolean(data)]);
  useEffect(() => {
    const node = previewHost.current, scroll = previewBox.current; if (!node || !scroll) return;
    // The observed width must not depend on the child's scrollbars. Preserve
    // fractional layout width, then round down so the iframe cannot overflow it.
    const observer = new ResizeObserver(([entry]) => {
      const style = getComputedStyle(scroll);
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const gutter = scroll.offsetWidth - scroll.clientWidth;
      const width = Math.max(1, Math.floor(entry.contentRect.width - padding - gutter));
      setPreviewWidth(previous => previous === width ? previous : width);
    });
    observer.observe(node); return () => observer.disconnect();
  }, [Boolean(data)]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "kd-homepage-ready") {
        // A new document (initial load or explicit error recovery) needs a handshake.
        lastSentDraft.current = ""; lastSentArea.current = "";
        setReady(true); setPreviewError(""); sendDraft(); sendFocus();
      }
      if (event.data?.type === "kd-homepage-preview-error") setPreviewError(event.data.message || "預覽無法顯示");
      if (event.data?.type === "kd-homepage-save") saveAction.current();
    };
    window.addEventListener("message", receive); return () => window.removeEventListener("message", receive);
  }, [sendDraft, sendFocus]);
  useEffect(() => { if (ready) sendDraft(); }, [data?.homepage, ready, sendDraft]);
  useEffect(() => { if (ready) sendFocus(); }, [area, ready, sendFocus]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    const navigate = (event: MouseEvent) => {
      const anchor = (event.target as Element)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!dirty || !anchor || anchor.target === "_blank") return;
      const destination = new URL(anchor.href);
      const sameDocument = destination.origin === window.location.origin && destination.pathname === window.location.pathname && destination.search === window.location.search;
      if (!(sameDocument && destination.hash) && !window.confirm("尚有未儲存變更，確定離開首頁工作室？")) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", navigate, true); };
  }, [dirty]);
  const setPath = (path: Array<string | number>, value: unknown) => setData(current => {
    if (!current) return current;
    const homepage = structuredClone(current.homepage); let target = homepage;
    for (let i = 0; i < path.length - 1; i++) target = target[path[i]] ??= typeof path[i + 1] === "number" ? [] : {};
    if (value === undefined) delete target[path[path.length - 1]]; else target[path[path.length - 1]] = value;
    return { ...current, homepage };
  });
  const editPresentation = (key: HomepagePresentationKey, edit: HomepageBasePresentationEdit) => setData(current => current ? { ...current, homepage: updateHomepageBasePresentation(current.homepage, key, edit) } : current);
  const editMobile = (key: HomepagePresentationKey, edit: HomepageBasePresentationEdit) => setData(current => {
    if (!current) return current;
    const homepage = updateHomepageMobilePresentation(current.homepage, key, edit);
    return { ...current, homepage: edit.value !== undefined ? updateHomepageMobileEnabled(homepage, key, true) : homepage };
  });
  const toggleMobile = (key: HomepagePresentationKey, enabled: boolean) => setData(current => current ? { ...current, homepage: updateHomepageMobileEnabled(current.homepage, key, enabled) } : current);
  const uploadHeroImage = async (file: File, assetId: string, seoName?: string, assetGroup?: string): Promise<MediaAsset> => {
    const form = new FormData();
    form.append("file", file); form.append("desiredName", seoName || `kd-coffee-${assetId.toLowerCase()}`);
    form.append("artworkSlug", "homepage"); form.append("assetType", assetId.toLowerCase());
    if (assetGroup) form.append("assetGroup", assetGroup);
    const response = await fetch("/api/admin/homepage/upload", { method: "POST", body: form }), result = await response.json();
    if (!response.ok) throw new Error(result.error || "上傳失敗");
    setMessage("素材已上傳，首頁引用尚未儲存。"); return localImageMedia(result.path);
  };
  const uploadImage = async (file: File, path: Array<string | number>, id: string, name?: string, assetGroup?: string) => {
    const media = await uploadHeroImage(file, id, name, assetGroup); setPath(path, media.url); return media;
  };
  const save = useCallback(async () => {
    const submitted = latest.current;
    if (!submitted || saveLock.current || JSON.stringify(submitted.homepage) === baseline) return;
    if (presentationInvalid) { setMessage("儲存失敗：請先修正呈現設定。"); return; }
    try {
      validateHomepageCms(submitted.homepage);
      const error = validateHomepageCampaigns(submitted.homepage.campaigns); if (error) throw new Error(error);
      const resolution = resolveHome004Recommendations(submitted.homepage.home004?.productSlugs, submitted.products);
      if (!resolution.valid) throw new Error(resolution.errors[0]);
      saveLock.current = true; setSaving(true); setMessage("儲存中…");
      const response = await fetch("/api/admin/homepage", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ homepage: submitted.homepage }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "儲存失敗");
      // The baseline is the submitted snapshot; later local edits must stay dirty.
      setBaseline(JSON.stringify({ ...submitted.homepage, version: result.version }));
      setData(current => current ? { ...current, homepage: { ...current.homepage, version: result.version } } : current);
      setMessage("首頁設定已儲存");
    } catch (error) { setMessage(`儲存失敗：${error instanceof Error ? error.message : "未知錯誤"}`); }
    finally { saveLock.current = false; setSaving(false); }
  }, [baseline, presentationInvalid]);
  saveAction.current = () => { void save(); };
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); } };
    window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut);
  }, [save]);
  if (!data) return <div role={loadingError ? "alert" : "status"}>{loadingError || "正在載入首頁工作室…"}{loadingError ? <button onClick={() => window.location.reload()}>重新載入</button> : null}</div>;
  const h = data.homepage, original = baseline ? JSON.parse(baseline) : {};
  const common = { setPath, uploadImage, assets: data.assets, products: data.products };
  const editor = area === "hero" ? <HeroEditor value={h.hero} products={data.products} setPath={setPath} uploadHeroImage={uploadHeroImage} onOpenLibrary={setHeroPicker} />
    : area === "campaignSection" ? <CampaignEditor section={h.campaignSection || {}} campaigns={h.campaigns || []} {...common} />
    : area === "home004" ? <Home004Editor value={h.home004 || {}} {...common} />
    : area === "home006" ? <Home006Editor value={h.home006 || {}} {...common} />
    : area === "home008" ? <Home008Editor value={h.home008 || {}} {...common} />
    : area === "home009" ? <ReviewsEditor value={h.home009 || {}} {...common} />
    : area === "home010" ? <Home010Editor value={h.home010 || {}} {...common} />
    : ["home002", "home003", "home005", "home007"].includes(area) ? <ContentSectionEditor sectionKey={area as HomepagePresentationKey} value={h[area] || {}} collectionKey={area === "home005" ? "steps" : "cards"} {...common} />
    : area === "sections" ? <HomepageSectionOrderEditor homepage={h} setPath={setPath} />
    : area === "navigation" ? <HomepageNavigationEditor value={h.navigation} products={data.products} pages={data.publishedPages} setPath={setPath} />
    : area === "visual" ? <HomepageVisualEditor value={h.visual} setPath={setPath} />
    : <HomepageSeoEditor value={h.seo} assets={data.assets} setPath={setPath} onOpenPicker={() => setSeoPicker(true)} />;
  return <SmartLinkEditingProvider pages={data.publishedPages}><HomepagePresentationProvider presentation={h.presentation} device={device} content={{ homepage: h, products: data.products, pages: data.publishedPages, draft: dirty }} onEdit={editPresentation} onMobileEdit={editMobile} onMobileToggle={toggleMobile} onValidityChange={setPresentationInvalid}>
    <div className={styles.studio} style={{ "--homepage-toolbar-height": `${toolbarHeight}px` } as React.CSSProperties}>
      <header className={styles.toolbar} ref={toolbar}>
        <div><small>HOMEPAGE CONTENT STUDIO</small><h1>首頁內容工作室</h1><span>{currentArea.label}</span></div>
        <div className={styles.actions}><div role="group" aria-label="編輯與預覽裝置">{(["desktop", "mobile"] as const).map(mode => <button key={mode} type="button" aria-pressed={device === mode} disabled={presentationInvalid} onClick={() => setDevice(mode)}>{mode === "desktop" ? "Desktop 桌機" : "Mobile 手機"}</button>)}</div><a href="/" target="_blank" rel="noopener noreferrer">開啟正式首頁 ↗</a><button className={styles.save} type="button" onClick={() => void save()} disabled={saving || !dirty || presentationInvalid}>{saving ? "儲存中…" : "儲存全部"}</button></div>
        <p className={styles.status} role="status" aria-live="polite">{message.startsWith("儲存失敗") ? message : saving ? "儲存中…" : dirty ? "● 尚有未儲存變更" : "✓ 已儲存"}{message && !message.startsWith("儲存失敗") && !saving ? ` · ${message}` : ""}</p>
      </header>
      <div className={styles.workspace}>
        <nav className={styles.navigation} aria-label="首頁編輯區域"><p>我要修改哪一區？</p>{HOMEPAGE_STUDIO_AREAS.map((item, index) => <button key={item.key} type="button" aria-current={area === item.key ? "true" : undefined} disabled={presentationInvalid} onClick={() => { setArea(item.key); setMessage(""); }}><small>{index < 11 ? String(index + 1).padStart(2, "0") : "設定"}</small><span>{item.label}</span>{homepageAreaSnapshot(h, item.key) !== homepageAreaSnapshot(original, item.key) ? <i aria-label="未儲存">●</i> : null}</button>)}</nav>
        <section className={styles.editor} aria-label={`${currentArea.label}編輯器`}>
          <div className={styles.editorHead}><h2>{currentArea.label}</h2><p>{device === "mobile" ? "手機模式 · 內容共用，呈現設定可獨立自訂。" : "桌機模式 · 呈現設定作為手機繼承的基礎。"}</p>{isHomepagePresentationArea(area) ? <div className={styles.actions} role="group" aria-label="編輯類型"><button aria-pressed={group === "content"} disabled={presentationInvalid} onClick={() => setGroup("content")}>內容與媒體</button><button aria-pressed={group === "presentation"} disabled={presentationInvalid} onClick={() => setGroup("presentation")}>字體・留白・動畫</button></div> : null}</div>
          <div className={`${styles.fields} homepage-manager v3-admin`} key={area}>{group === "presentation" && isHomepagePresentationArea(area) ? <HomepagePresentationEditor sectionKey={area} /> : <>{editor}{isHomepagePresentationArea(area) ? <HomepageCtaVisibility homepage={h} setPath={setPath} area={area} /> : null}</>}</div>
        </section>
        <aside className={styles.preview} aria-label="即時首頁預覽">
          <div className={styles.previewHead}><strong>Live Preview · {device === "desktop" ? "桌機" : "手機"}</strong><span>未儲存草稿 · {currentArea.label}</span><button type="button" onClick={() => { frame.current?.contentWindow?.postMessage({ type: "kd-homepage-replay" }, window.location.origin); }}>重播動畫</button></div>
          {!ready ? <p role="status">正在載入真實首頁預覽…</p> : null}
          {previewError ? <p role="alert">{previewError} <button onClick={() => { setReady(false); frame.current?.contentWindow?.location.reload(); }}>重新載入預覽</button></p> : null}
          <div className={styles.previewViewport} ref={previewHost}><div className={styles.previewScroll} ref={previewBox}>{previewWidth > 0 ? <iframe ref={frame} title="首頁未儲存即時預覽" src="/admin/homepage/preview" className={device === "mobile" ? styles.mobileFrame : styles.desktopFrame} style={{ zoom: Math.min(1, previewWidth / (device === "mobile" ? 390 : 1280)), height: `calc((100dvh - ${toolbarHeight + 165}px) / ${Math.min(1, previewWidth / (device === "mobile" ? 390 : 1280))})` }} /> : null}</div></div>
          <p className={styles.note}>採用公開首頁元件。隱藏、未開始或缺少內容的區塊依正式規則隱藏；SEO 資料請在左側確認。</p>
        </aside>
      </div>
      {seoPicker ? <ImageLibraryPicker assets={data.assets} title="選擇首頁 SEO 分享圖片" onClose={() => setSeoPicker(false)} onChoose={asset => { setPath(["seo", "shareImage"], { media: localImageMedia(asset.path), alt: asset.alt || asset.name }); setSeoPicker(false); }} /> : null}
      {heroPicker ? <HeroMediaLibraryPicker assets={data.assets} title={heroPicker === "desktop" ? "選擇桌機 Hero 素材" : "選擇手機 Hero 素材"} onClose={() => setHeroPicker(null)} onChoose={media => { setPath(["hero", heroPicker === "desktop" ? "desktopMedia" : "mobileMedia"], media); setHeroPicker(null); }} /> : null}
    </div>
  </HomepagePresentationProvider></SmartLinkEditingProvider>;
}
