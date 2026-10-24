"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./GiftCmsEditor.module.css";
const frameHtml = '<!doctype html><html lang="zh-Hant"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>KD Coffee 即時預覽</title></head><body style="margin:0"></body></html>';
/** Local React portal, like the Works preview: no draft endpoint or persisted token. */
export default function GiftLivePreview({ children, device, replay }: { children: ReactNode; device: "desktop" | "mobile"; replay: number }) {
  const frame = useRef<HTMLIFrameElement>(null), box = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null), [available, setAvailable] = useState(600), [height, setHeight] = useState(1200);
  const width = device === "mobile" ? 390 : 1100, scale = Math.min(1, available / width);
  useEffect(() => { if (!box.current) return; const observer = new ResizeObserver(entries => setAvailable(entries[0].contentRect.width)); observer.observe(box.current); return () => observer.disconnect(); }, []);
  useEffect(() => { if (!body) return; const observer = new ResizeObserver(() => setHeight(Math.max(500, body.scrollHeight))); observer.observe(body); const stop = (event: MouseEvent) => { const target = (event.target as Element)?.closest?.("a"); if (!target) return; event.preventDefault(); const href = target.getAttribute("href"); if (href?.startsWith("#")) body.ownerDocument.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth" }); }; body.addEventListener("click", stop, true); return () => { observer.disconnect(); body.removeEventListener("click", stop, true); }; }, [body]);
  function initializeFrame() {
    const doc=frame.current?.contentDocument;if(!doc?.body)return;
    doc.documentElement.className=document.documentElement.className;doc.body.className=document.body.className;
    for(const old of doc.head.querySelectorAll('[data-studio-style]'))old.remove();
    for(const sheet of document.querySelectorAll('style,link[rel="stylesheet"]')){const clone=sheet.cloneNode(true) as Element;clone.setAttribute('data-studio-style','');doc.head.appendChild(clone);}
    setBody(doc.body);
  }
  useEffect(()=>{if(frame.current?.contentDocument?.readyState==='complete')initializeFrame();},[replay]);
  return <div ref={box} className={styles.previewViewport}><div style={{ height: height * scale, width: width * scale, margin: "0 auto" }}><iframe key={replay} ref={frame} title={device === "mobile" ? "手機即時預覽" : "桌面即時預覽"} srcDoc={frameHtml} sandbox="allow-same-origin" style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left", border: 0 }} onLoad={initializeFrame} />{body && createPortal(children, body)}</div></div>;
}
