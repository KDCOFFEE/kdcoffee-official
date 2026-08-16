"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  DEFAULT_MONTHLY_MENU_BACKGROUND,
  getMonthlyMenuBackgroundPrompt,
  type MonthlyMenuBackground,
} from "@/lib/monthlyMenuBackground";

type Payload = { background: MonthlyMenuBackground };

const positionLabels: Record<MonthlyMenuBackground["position"], string> = {
  auto: "自動", center: "置中", "top-left": "左上", "top-right": "右上",
  "bottom-left": "左下", "bottom-right": "右下",
};

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
  const prompt = useMemo(() => getMonthlyMenuBackgroundPrompt(background.theme), [background.theme]);

  useEffect(() => {
    fetch("/api/admin/monthly-menu", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "讀取失敗");
        return payload as Payload;
      })
      .then((payload) => { setBackground(payload.background); setMessage(""); })
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
    setMessage("背景圖片上傳中…");
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
      setMessage("背景圖片上傳完成，請按「儲存背景設定」。");
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
      setMessage("本月豆單背景已儲存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage("AI 豆單背景提示詞已複製。");
    } catch {
      setMessage("無法自動複製，請手動選取提示詞內容。");
    }
  }

  if (loading) return <p>{message}</p>;

  return (
    <div className="homepage-manager monthly-menu-background-manager">
      <div className="cms-toolbar">
        <div><p className="eyebrow dark">MONTHLY MENU ART DIRECTION</p><h1>本月豆單背景</h1><p>同一組設定會套用到公開豆單與下載的 WebP 圖片。</p></div>
        <div className="cms-toolbar-actions">
          <a href="/monthly-menu" target="_blank">預覽豆單 ↗</a>
          <button type="button" onClick={save} disabled={saving || uploading}>{saving ? "儲存中…" : "儲存背景設定"}</button>
        </div>
      </div>
      {message ? <div className="cms-message" role="status">{message}</div> : null}

      <section className="cms-panel">
        <div className="cms-panel-head"><div><h2>背景圖片與呈現</h2><p>圖片會保持在文字、價格與作品縮圖下方；建議使用直式低對比構圖。</p></div></div>
        <div className="monthly-background-layout">
          <div className="monthly-background-preview" aria-label="豆單背景效果預覽">
            {background.image ? <span style={{
              backgroundImage: `url(${background.image})`,
              backgroundPosition: cssPositions[background.position],
              backgroundSize: background.fit,
              opacity: background.opacity,
            }} /> : null}
            <div><small>KD COFFEE · MONTHLY SELECTION</small><strong>本月豆單</strong><i /><i /><i /></div>
          </div>

          <div className="cms-grid two monthly-background-fields">
            <div className="monthly-background-upload span-two">
              <b>豆單背景圖片</b>
              <div>
                <label className="upload-label">{uploading ? "上傳中…" : background.image ? "更換圖片" : "上傳圖片"}<input type="file" accept="image/webp,image/jpeg,image/png,.webp,.jpg,.jpeg,.png" disabled={uploading} onChange={upload} /></label>
                <button type="button" className="cms-secondary-button" disabled={!background.image || uploading} onClick={() => patch({ image: undefined })}>清除圖片</button>
              </div>
              <small>接受 WebP、JPG、JPEG、PNG；上限 20MB，上傳後會最佳化為 WebP。</small>
            </div>

            <label className="span-two monthly-opacity-field"><span>背景濃度 <b>{Math.round(background.opacity * 100)}%</b></span><input type="range" min="0" max="20" step="1" value={Math.round(background.opacity * 100)} onChange={(event) => patch({ opacity: Number(event.target.value) / 100 })} /></label>
            <label>背景位置<select value={background.position} onChange={(event) => patch({ position: event.target.value as MonthlyMenuBackground["position"] })}>{Object.entries(positionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>背景呈現<select value={background.fit} onChange={(event) => patch({ fit: event.target.value as MonthlyMenuBackground["fit"] })}><option value="cover">Cover</option><option value="contain">Contain</option></select></label>
            <label className="span-two">本月背景主題（最多 80 字）<input value={background.theme} maxLength={80} placeholder="盛夏午後、暖金、柔和日光" onChange={(event) => patch({ theme: event.target.value })} /><small>{background.theme.length} / 80</small></label>
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
