"use client";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import HomepageV3, { type HomepageViewData } from "@/components/home/HomepageV3";
import HeaderNavigation from "@/components/layout/HeaderNavigation";
import { resolveHomepageNavigation, validateHomepagePresentation } from "@/lib/homepageCms";
import { HOMEPAGE_STUDIO_AREAS, type HomepageStudioArea } from "@/lib/homepageStudio";
import type { PublishedCmsPage } from "@/lib/cmsLinks";
type Props = { initial: HomepageViewData; products: Parameters<typeof HomepageV3>[0]["products"]; pages: PublishedCmsPage[]; logo?: { path: string; alt?: string }; footer: ReactNode };
class PreviewBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch() { window.parent.postMessage({ type: "kd-homepage-preview-error", message: "預覽資料尚未完整，請修正設定後重新載入預覽。" }, window.location.origin); }
  render() { return this.state.error ? <p role="alert">預覽資料尚未完整，請修正左側設定。</p> : this.props.children; }
}
export default function HomepageDraftPreview({ initial, products, pages, logo, footer }: Props) {
  const [homepage, setHomepage] = useState(initial), [area, setArea] = useState<HomepageStudioArea>("hero"), [replay, setReplay] = useState(0);
  const previousArea = useRef("");
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== window.location.origin) return;
      if (event.data?.type === "kd-homepage-replay") { setReplay(value => value + 1); return; }
      if (event.data?.type !== "kd-homepage-draft" || !event.data.homepage?.hero || !Array.isArray(event.data.homepage.campaigns)) return;
      try {
        validateHomepagePresentation(event.data.homepage.presentation); setHomepage(event.data.homepage);
        if (HOMEPAGE_STUDIO_AREAS.some(item => item.key === event.data.area)) setArea(event.data.area);
      } catch { window.parent.postMessage({ type: "kd-homepage-preview-error", message: "呈現設定尚未完整，請修正欄位。" }, window.location.origin); }
    };
    const preventNavigation = (event: MouseEvent) => { if ((event.target as Element)?.closest?.("a[href]")) event.preventDefault(); };
    const saveShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); window.parent.postMessage({ type: "kd-homepage-save" }, window.location.origin); }
    };
    window.addEventListener("message", receive); document.addEventListener("click", preventNavigation, true);
    window.addEventListener("keydown", saveShortcut);
    window.parent.postMessage({ type: "kd-homepage-ready" }, window.location.origin);
    return () => { window.removeEventListener("message", receive); document.removeEventListener("click", preventNavigation, true); window.removeEventListener("keydown", saveShortcut); };
  }, []);
  useEffect(() => {
    const definition = HOMEPAGE_STUDIO_AREAS.find(item => item.key === area);
    document.querySelectorAll("[data-homepage-studio-focus]").forEach(node => node.removeAttribute("data-homepage-studio-focus"));
    const target = definition?.target ? document.getElementById(definition.target) : null;
    target?.setAttribute("data-homepage-studio-focus", "true");
    if (previousArea.current !== area) {
      if (target) window.scrollTo({ top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - 96), behavior: "instant" });
      if (area === "navigation" || area === "visual") window.scrollTo(0, 0);
    }
    previousArea.current = area;
  }, [area, homepage, replay]);
  const navigation = resolveHomepageNavigation(homepage.navigation).filter(item => item.enabled !== false && item.label.trim()).map(({ id, label, href }) => ({ id, label, href }));
  const motionKey = JSON.stringify([homepage.hero.timing, homepage.hero.motionEnabled, Object.fromEntries(Object.entries(homepage.presentation?.sections || {}).map(([key, value]) => [key, [value.base?.animation, value.mobile?.overrideEnabled, value.mobile?.overrides?.animation]]))]);
  return <main>
    <style>{"[data-homepage-studio-focus]{outline:2px solid #bc9866;outline-offset:-2px}"}</style>
    <header className="v2-header"><a className={`brand ${logo?.path ? "brand-image" : ""}`} href="/#top" aria-label="KD Coffee 首頁">{logo?.path ? <img src={logo.path} alt={logo.alt || "KD Coffee 咖啡藝術工坊"} /> : <><span>KD</span><b>COFFEE</b></>}</a><HeaderNavigation items={navigation} products={products} pages={pages} /><div className="header-actions" aria-hidden="true">會員　購物車</div></header>
    <PreviewBoundary key={replay}><HomepageV3 key={motionKey + replay} homepageData={homepage} products={products} pages={pages} /></PreviewBoundary>{footer}
  </main>;
}
