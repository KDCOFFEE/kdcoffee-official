"use client";
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import HomepageV3, { type HomepageViewData } from "@/components/home/HomepageV3";
import HeaderNavigation from "@/components/layout/HeaderNavigation";
import { resolveHomepageNavigation, validateHomepagePresentation } from "@/lib/homepageCms";
import { HOMEPAGE_STUDIO_AREAS, homepageDraftSnapshot, type HomepageStudioArea } from "@/lib/homepageStudio";
import type { PublishedCmsPage } from "@/lib/cmsLinks";
import { HomepagePreviewProvider } from "@/components/home/HomepagePreviewContext";
type Props = { initial: HomepageViewData; products: Parameters<typeof HomepageV3>[0]["products"]; pages: PublishedCmsPage[]; logo?: { path: string; alt?: string }; footer: ReactNode };
class PreviewBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch() { window.parent.postMessage({ type: "kd-homepage-preview-error", message: "預覽資料尚未完整，請修正設定後重新載入預覽。" }, window.location.origin); }
  render() { return this.state.error ? <p role="alert">預覽資料尚未完整，請修正左側設定。</p> : this.props.children; }
}
export default function HomepageDraftPreview({ initial, products, pages, logo, footer }: Props) {
  const [homepage, setHomepage] = useState(initial), [area, setArea] = useState<HomepageStudioArea>("hero"), [replay, setReplay] = useState(0);
  const [replaying, setReplaying] = useState(false);
  const [prepared, setPrepared] = useState(false), [progress, setProgress] = useState("");
  const previewRoot = useRef<HTMLElement>(null);
  const replayComplete = useCallback(() => setReplaying(false), []);
  const lastHomepageSnapshot = useRef(homepageDraftSnapshot(initial));
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== window.location.origin) return;
      if (event.data?.type === "kd-homepage-replay") { setReplaying(true); setReplay(value => value + 1); return; }
      if (event.data?.type === "kd-homepage-focus") {
        if (HOMEPAGE_STUDIO_AREAS.some(item => item.key === event.data.area)) { setReplaying(false); setArea(event.data.area); }
        return;
      }
      if (event.data?.type !== "kd-homepage-draft" || !event.data.homepage?.hero || !Array.isArray(event.data.homepage.campaigns)) return;
      try {
        const snapshot = homepageDraftSnapshot(event.data.homepage);
        if (snapshot === lastHomepageSnapshot.current) return;
        validateHomepagePresentation(event.data.homepage.presentation);
        lastHomepageSnapshot.current = snapshot;
        setReplaying(false); setHomepage(event.data.homepage);
      } catch { window.parent.postMessage({ type: "kd-homepage-preview-error", message: "呈現設定尚未完整，請修正欄位。" }, window.location.origin); }
    };
    const preventNavigation = (event: MouseEvent) => { if ((event.target as Element)?.closest?.("a[href]")) event.preventDefault(); };
    const saveShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); window.parent.postMessage({ type: "kd-homepage-save" }, window.location.origin); }
    };
    const resize = () => setReplaying(false);
    window.addEventListener("message", receive); document.addEventListener("click", preventNavigation, true);
    window.addEventListener("keydown", saveShortcut);
    window.addEventListener("resize", resize);
    return () => { window.removeEventListener("message", receive); document.removeEventListener("click", preventNavigation, true); window.removeEventListener("keydown", saveShortcut); window.removeEventListener("resize", resize); };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    const prepare = async () => {
      const deadline = Date.now() + 120000;
      while (!abort.signal.aborted) {
        const images = Array.from(previewRoot.current?.querySelectorAll("img") || []);
        let complete = 0;
        const timer: { id?: ReturnType<typeof setTimeout> } = {};
        const loaded = await Promise.race([
          Promise.all(images.map(async image => {
            // Explicit private-route policy also covers native gallery/logo images.
            image.loading = "eager";
            if (!image.complete) await new Promise<void>(resolve => {
              image.addEventListener("load", () => resolve(), { once: true, signal: abort.signal });
              image.addEventListener("error", () => resolve(), { once: true, signal: abort.signal });
            });
            if (image.naturalWidth) { try { await image.decode(); } catch { /* Buffer keeps its fallback. */ } }
            complete++; if (!abort.signal.aborted) setProgress(`${complete} / ${images.length}`);
          })).then(() => true),
          new Promise<false>(resolve => { timer.id = setTimeout(() => resolve(false), Math.max(1, deadline - Date.now())); }),
        ]);
        if (timer.id) clearTimeout(timer.id);
        if (abort.signal.aborted) return;
        if (!loaded) { window.parent.postMessage({ type: "kd-homepage-preview-error", message: "媒體準備逾時，請重新載入預覽。" }, window.location.origin); return; }
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        if (!previewRoot.current?.querySelector('[data-studio-media-ready="false"]')) break;
      }
      if (!abort.signal.aborted) { setPrepared(true); window.parent.postMessage({ type: "kd-homepage-ready" }, window.location.origin); }
    };
    void prepare(); return () => abort.abort();
  }, []);
  useEffect(() => {
    const definition = HOMEPAGE_STUDIO_AREAS.find(item => item.key === area);
    document.querySelectorAll("[data-homepage-studio-focus]").forEach(node => node.removeAttribute("data-homepage-studio-focus"));
    const target = definition?.target ? document.getElementById(definition.target) : null;
    target?.setAttribute("data-homepage-studio-focus", "true");
  }, [area, homepage, replay]);
  // Highlight newly enabled/replayed content above; only navigation may scroll.
  useEffect(() => {
    const definition = HOMEPAGE_STUDIO_AREAS.find(item => item.key === area);
    const target = definition?.target ? document.getElementById(definition.target) : null;
    if (target) window.scrollTo({ top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - 96), behavior: "instant" });
    if (area === "navigation" || area === "visual") window.scrollTo(0, 0);
  }, [area]);
  const navigation = resolveHomepageNavigation(homepage.navigation).filter(item => item.enabled !== false && item.label.trim()).map(({ id, label, href }) => ({ id, label, href }));
  const mode = replaying ? "studio-replay" : "studio-stable";
  const sectionId = HOMEPAGE_STUDIO_AREAS.find(item => item.key === area)?.target || "top";
  return <HomepagePreviewProvider mode={mode} sectionId={sectionId} replay={replay} onReplayComplete={replayComplete}><main ref={previewRoot} data-homepage-preview={replaying ? "replay" : "stable"} data-homepage-preview-mode={mode}>
    <style>{`
      [data-homepage-studio-focus]{outline:2px solid #bc9866;outline-offset:-2px}
      /* Private iframe only. Only the explicitly replayed section may animate. */
      [data-homepage-preview] #top:not([data-studio-replay]),[data-homepage-preview] #top:not([data-studio-replay]) *{animation-delay:-999s!important;animation-play-state:paused!important}
      [data-homepage-preview] #top:not([data-studio-replay])::before{animation-delay:-999s!important;animation-play-state:paused!important}
      [data-homepage-preview] :is([data-home-reveal],[data-home-motion-part],[data-home-motion-item]):not([data-studio-replay],[data-studio-replay] *){opacity:1!important;transform:none!important;transition:none!important}
      [data-homepage-preview] [data-home-reveal="editorial-media"]:not([data-studio-replay],[data-studio-replay] *) .home-media-collection{clip-path:inset(0)!important;transform:none!important;transition:none!important}
      [data-studio-media-buffer]{display:block;width:100%;height:100%;overflow:hidden}
      [data-studio-media-buffer]:not(.v3-hero-video){position:relative}
      [data-studio-media-placeholder]{position:absolute;inset:0;display:grid;place-items:center;min-height:80px;background:#f5eee4;color:#755f47;font:14px/1.6 sans-serif;padding:16px;text-align:center}
      [data-studio-media-play],[data-studio-media-notice]{position:absolute;right:12px;bottom:12px;padding:8px 12px;background:#241d17e8;color:#fff8ee;border:1px solid #c8ae86;border-radius:4px;font:12px/1.5 sans-serif}
      [data-studio-preview-preparing]{position:fixed;inset:0;z-index:9999;display:grid;place-content:center;gap:12px;background:#fbf7ef;color:#755f47;font:16px/1.8 sans-serif;text-align:center}
    `}</style>
    <header className="v2-header"><a className={`brand ${logo?.path ? "brand-image" : ""}`} href="/#top" aria-label="KD Coffee 首頁">{logo?.path ? <img src={logo.path} alt={logo.alt || "KD Coffee 咖啡藝術工坊"} /> : <><span>KD</span><b>COFFEE</b></>}</a><HeaderNavigation items={navigation} products={products} pages={pages} /><div className="header-actions" aria-hidden="true">會員　購物車</div></header>
    <PreviewBoundary><HomepageV3 homepageData={homepage} products={products} pages={pages} previewMode={mode} /></PreviewBoundary>{footer}
    {!prepared ? <div data-studio-preview-preparing role="status">正在準備首頁圖片與影片預覽…<small>{progress}</small></div> : null}
  </main></HomepagePreviewProvider>;
}
