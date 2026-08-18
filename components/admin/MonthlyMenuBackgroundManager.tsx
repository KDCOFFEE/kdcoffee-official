"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  DEFAULT_MONTHLY_MENU_BACKGROUND,
  getMonthlyMenuBackgroundPrompt,
  getTaiwanMonthlyTheme,
  type MonthlyMenuBackground,
} from "@/lib/monthlyMenuBackground";

type Payload = { background: MonthlyMenuBackground; monthKey?: string };

const cssPositions: Record<MonthlyMenuBackground["position"], string> = {
  auto: "center", center: "center", "top-left": "left top", "top-right": "right top",
  "bottom-left": "left bottom", "bottom-right": "right bottom",
};

export default function MonthlyMenuBackgroundManager() {
  const [background, setBackground] = useState<MonthlyMenuBackground>(DEFAULT_MONTHLY_MENU_BACKGROUND);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("讀取中…");
  const [monthKey, setMonthKey] = useState<string | undefined>();
  const recommendation = useMemo(() => getTaiwanMonthlyTheme(monthKey), [monthKey]);
  const prompt = useMemo(() => getMonthlyMenuBackgroundPrompt(monthKey), [monthKey]);

  useEffect(() => {
    fetch("/api/admin/monthly-menu", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "讀取失敗");
        return payload as Payload;
      })
.then((payload) => { setBackground(payload.background); setMonthKey(payload.monthKey); setMessage(""); })
      .catch((error) => setMessage(error instanceof Error ? error.message : "讀取失敗"))
      .finally(() => setLoading(false));
  }, []);

  function patch(value: Partial<MonthlyMenuBackground>) {
    setBackground((current) => ({ ...current, ...value }));
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
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
      patch({ image: payload.path });
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
        <div><p className="eyebrow dark">MONTHLY THEME ARTWORK</p><h1>本月主題視覺</h1><p>同一張 artwork 會融入公開 A4 豆單 Header 與下載圖片。</p></div>
        <div className="cms-toolbar-actions">
          <a href="/monthly-menu" target="_blank">預覽豆單 ↗</a>
          <button type="button" onClick={save} disabled={saving || uploading}>{saving ? "儲存中…" : "儲存主題視覺"}</button>
        </div>
      </div>
      {message ? <div className="cms-message" role="status">{message}</div> : null}

      {recommendation ? (
        <section className="cms-panel">
          <div className="cms-panel-head">
            <div><h2>AI 建議主題</h2><p>{monthKey} · 依台灣季節與節慶情境自動產生，主題名稱會直接包含在生成 artwork 裡。</p></div>
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
            {background.image ? <span style={{
              backgroundImage: `url(${background.image})`,
              backgroundPosition: cssPositions[background.position],
              backgroundSize: background.fit,
              opacity: 1,
            }} /> : null}
            <div><small>KD COFFEE · MONTHLY SELECTION</small><strong>本月豆單</strong><i /><i /><i /></div>
          </div>

          <div className="cms-grid two monthly-background-fields">
            <div className="monthly-background-upload span-two">
              <b>Theme artwork</b>
              <div>
                <label className="upload-label">{uploading ? "上傳中…" : background.image ? "更換圖片" : "上傳圖片"}<input type="file" accept="image/webp,image/jpeg,image/png,.webp,.jpg,.jpeg,.png" disabled={uploading} onChange={upload} /></label>
                <button type="button" className="cms-secondary-button" disabled={!background.image || uploading} onClick={() => patch({ image: undefined })}>清除圖片</button>
              </div>
              <small>接受 WebP、JPG、JPEG、PNG；上限 20MB，上傳後會最佳化為 WebP。圖片內應直接包含主題名稱。</small>
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
