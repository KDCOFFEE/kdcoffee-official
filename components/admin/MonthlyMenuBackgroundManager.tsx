"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_MONTHLY_MENU_BACKGROUND,
  getMonthlyMenuBackgroundPrompt,
  getTaiwanMonthlyTheme,
  isArtworkFromAnotherMonth,
  type MonthlyMenuBackground,
} from "@/lib/monthlyMenuBackground";
import MediaUploader from "@/components/admin/MediaUploader";
import type { MonthlyMenuPeriod } from "@/lib/monthlyMenuPeriod";

type Payload = { background: MonthlyMenuBackground; currentMonth: MonthlyMenuPeriod };

const cssPositions: Record<MonthlyMenuBackground["position"], string> = {
  auto: "center", center: "center", "top-left": "left top", "top-right": "right top",
  "bottom-left": "left bottom", "bottom-right": "right bottom",
};

export default function MonthlyMenuBackgroundManager() {
  const [background, setBackground] = useState<MonthlyMenuBackground>(DEFAULT_MONTHLY_MENU_BACKGROUND);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("讀取中…");
  const [currentMonth, setCurrentMonth] = useState<MonthlyMenuPeriod | null>(null);
  const recommendation = useMemo(() => currentMonth ? getTaiwanMonthlyTheme(currentMonth.monthKey) : undefined, [currentMonth]);
  const prompt = useMemo(() => currentMonth ? getMonthlyMenuBackgroundPrompt(currentMonth.monthKey) : "", [currentMonth]);
  const artworkMonthWarning = currentMonth && isArtworkFromAnotherMonth(background, currentMonth.monthKey);

  useEffect(() => {
    fetch("/api/admin/monthly-menu", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "讀取失敗");
        return payload as Payload;
      })
      .then((payload) => { setBackground(payload.background); setCurrentMonth(payload.currentMonth); setMessage(""); })
      .catch((error) => setMessage(error instanceof Error ? error.message : "讀取失敗"))
      .finally(() => setLoading(false));
  }, []);

  function patch(value: Partial<MonthlyMenuBackground>) {
    setBackground((current) => ({ ...current, ...value }));
  }

  async function upload(file: File) {
    if (!file) return;
    if (!["image/webp", "image/jpeg", "image/png"].includes(file.type)) {
      setMessage("只接受 WebP、JPG、JPEG 或 PNG 圖片。");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setMessage("豆單背景圖片不可超過 20MB。");
      return;
    }

    setUploading(true);
    setMessage("主題視覺上傳中…");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("desiredName", "kdcoffee-monthly-menu-background");
      form.append("artworkSlug", "monthly-menu");
      form.append("assetType", "background");
      form.append("assetGroup", "monthly-menu");
      const response = await fetch("/api/admin/homepage/upload", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "上傳失敗");
      patch({ image: payload.path, media: undefined });
      setMessage("主題視覺上傳完成，請按「儲存主題視覺」。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上傳失敗");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    setMessage("儲存中…");
    try {
      const response = await fetch("/api/admin/monthly-menu", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ background }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "儲存失敗");
      setBackground(payload.background);
      if (payload.currentMonth) setCurrentMonth(payload.currentMonth);
      setMessage("本月主題視覺已儲存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage("AI 主題視覺提示詞已複製。");
    } catch {
      setMessage("無法自動複製，請手動選取提示詞內容。");
    }
  }

  if (loading) return <p>{message}</p>;

  return (
    <div className="homepage-manager monthly-menu-background-manager">
      <div className="cms-toolbar">
        <div><p className="eyebrow dark">MONTHLY THEME ARTWORK</p><h1>本月主題視覺</h1><p>主題圖片或影片會融入公開 A4 豆單 Header；下載使用圖片或影片海報。</p></div>
        <div className="cms-toolbar-actions">
          <a href="/monthly-menu" target="_blank">預覽豆單 ↗</a>
          <button type="button" onClick={save} disabled={saving || uploading || videoUploading}>{saving ? "儲存中…" : "儲存主題視覺"}</button>
        </div>
      </div>
      {message ? <div className="cms-message" role="status">{message}</div> : null}
      {currentMonth ? <section className="cms-panel"><b>目前月份</b><p>{currentMonth.monthKey} · {currentMonth.selectionLabel}</p></section> : null}
      {artworkMonthWarning ? <div className="cms-message" role="status">目前為 {currentMonth.monthKey}，但主視覺仍為 {background.artworkMonthKey} 保存內容。可重新產生或上傳本月主視覺。</div> : null}

      {recommendation ? (
        <section className="cms-panel">
          <div className="cms-panel-head">
            <div><h2>AI 建議主題</h2><p>{currentMonth?.monthKey} · 依台灣季節與節慶情境自動產生。圖內只包含主題名稱，月份由網站排版顯示。</p></div>
          </div>
          <div className="cms-grid two">
            <div><b>推薦主題</b><p>{recommendation.title}</p></div>
            <div><b>推薦關鍵字</b><p>{recommendation.keywords}</p></div>
            <div className="span-two"><b>推薦視覺方向</b><p>{recommendation.visualDirection}</p></div>
          </div>
        </section>
      ) : null}

      <section className="cms-panel">
        <div className="cms-panel-head"><div><h2>主題 Artwork 上傳與預覽</h2><p>建議 1600 × 700 px、橫式約 16:7；左側保留安靜區，主視覺與圖內主題文字集中於中央至右側。</p></div></div>
        <div className="monthly-background-layout">
          <div className="monthly-background-preview" aria-label="豆單背景效果預覽">
            {background.media ? <video src={background.media.url} poster={background.media.posterUrl} controls playsInline preload="metadata" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: background.fit, objectPosition: cssPositions[background.position], zIndex: 1 }} /> : background.image ? <span style={{
              backgroundImage: `url(${background.image})`,
              backgroundPosition: cssPositions[background.position],
              backgroundSize: background.fit,
              opacity: 1,
            }} /> : null}
            <div><small>KD COFFEE · MONTHLY SELECTION</small><strong>本月豆單</strong><i /><i /><i /></div>
          </div>

          <div className="cms-grid two monthly-background-fields">
            <div className="monthly-background-upload span-two">
              <b>Theme artwork · {background.media ? "VIDEO 影片" : background.image ? "IMAGE 圖片" : "尚未選擇"}</b>
              <MediaUploader label="圖片／影片" usage="hero" value={background.media} disabled={saving || uploading}
                onUploadingChange={setVideoUploading}
                onImageSelect={file => { void upload(file); }}
                onChange={media => patch({ media, image: undefined })}
                onRemove={() => patch({ media: undefined, image: undefined })} />
              <button type="button" className="cms-secondary-button" disabled={(!background.image && !background.media) || uploading || saving || videoUploading} onClick={() => patch({ image: undefined, media: undefined })}>清除媒體</button>
              <small>圖片接受 WebP、JPG、PNG，上限 20MB，沿用 WebP 最佳化。影片接受 MP4、MOV、WebM，上限 200MB、60 秒；下載使用影片海報。舊影片依既有素材清理流程處理。</small>
            </div>
          </div>
        </div>
      </section>

      <section className="cms-panel monthly-prompt-panel">
        <div className="cms-panel-head"><div><h2>AI 豆單背景提示詞</h2><p>不會呼叫任何 AI API；請複製後貼到你使用的圖片生成工具。</p></div><button type="button" className="cms-secondary-button" onClick={copyPrompt}>複製提示詞</button></div>
        <textarea readOnly value={prompt} aria-label="AI 豆單背景提示詞完整內容" />
      </section>
    </div>
  );
}
