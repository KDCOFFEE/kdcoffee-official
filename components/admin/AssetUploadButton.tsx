"use client";

import { useRef, useState, type ChangeEvent } from "react";
import type { AssetRecord } from "@/lib/assets";

/** Shared Asset Library entry point. File rules and persistence stay in its API. */
export default function AssetUploadButton({ assetId, uploadUrl = "/api/admin/assets/upload", label = "上傳新圖片", className, accept = "image/*", disabled = false, onUploaded, onUploadingChange, onError }: {
  uploadUrl?: string; accept?: string;
  assetId?: string; label?: string; className?: string; disabled?: boolean;
  onUploaded: (asset: AssetRecord) => void | Promise<void>;
  onUploadingChange?: (uploading: boolean) => void;
  onError?: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null), lock = useRef(false);
  const [uploading, setUploading] = useState(false), [message, setMessage] = useState("");
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const control = event.currentTarget, file = control.files?.[0];
    if (!file || disabled || lock.current) return;
    lock.current = true; setUploading(true); setMessage("上傳中…"); onUploadingChange?.(true);
    try {
      const form = new FormData(); form.append("file", file);
      if (assetId) form.append("assetId", assetId); else form.append("create", "true");
      const response = await fetch(uploadUrl, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "上傳失敗");
      if (!result.asset?.path) throw new Error("上傳回應缺少素材資料，請更新素材庫確認。");
      await onUploaded(result.asset); setMessage("上傳成功");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "上傳失敗，請稍後再試。";
      setMessage(`上傳失敗：${detail}`); onError?.(detail);
    } finally {
      control.value = ""; lock.current = false; setUploading(false); onUploadingChange?.(false);
    }
  }
  return <span style={{ display: "inline-flex", flexDirection: "column", gap: 6, maxWidth: "100%" }}>
    <button type="button" className={className} style={{ minHeight: 42 }} disabled={disabled || uploading} onClick={() => input.current?.click()}>{uploading ? "上傳中…" : label}</button>
    <input ref={input} type="file" accept={accept} hidden disabled={disabled || uploading} aria-label={label} onChange={event => { void upload(event); }} />
    {message ? <span role="status" aria-live="polite">{message}</span> : null}
  </span>;
}
