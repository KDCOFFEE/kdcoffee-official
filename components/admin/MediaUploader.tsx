"use client";

import { ChangeEvent, useRef, useState } from "react";
import {
  CUSTOM_SECTION_IMAGE_LIMITS,
  isAllowedImageUpload,
  isAllowedVideoUpload,
  type CloudinaryMediaUsage,
  type MediaAsset,
  VIDEO_UPLOAD_LIMITS,
} from "@/lib/media";
import { filterCustomSectionMediaReservedPublicIds } from "@/lib/customSectionMediaNaming";

type MediaUploaderProps = {
  label?: string;
  value?: MediaAsset | null;
  usage?: CloudinaryMediaUsage;
  disabled?: boolean;
  showPreview?: boolean;
  imageActionLabel?: string;
  videoActionLabel?: string;
  productMediaNaming?: {
    productSlug: string;
    mediaPurpose: "clean-roasting" | "custom-section";
    sectionId?: string;
    reservedPublicIds?: string[];
  };
  onChange: (media: MediaAsset) => void;
  onImageSelect?: (file: File) => void;
  onImageUpload?: (file: File) => Promise<MediaAsset>;
  onRemove?: () => void;
};

type SignedUploadResponse = {
  apiKey: string;
  uploadUrl: string;
  signature: string;
  usage: CloudinaryMediaUsage;
  params: Record<string, string | number>;
};

type CloudinaryUploadResponse = { public_id?: string; done?: boolean };

const CHUNK_SIZE = 10 * 1024 * 1024;
const SINGLE_UPLOAD_LIMIT = 95 * 1024 * 1024;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "媒體上傳失敗，請稍後再試。";
}

function uploadRequest({
  file,
  signed,
  start,
  end,
  total,
  uploadId,
  onProgress,
  onRequest,
}: {
  file: Blob;
  signed: SignedUploadResponse;
  start?: number;
  end?: number;
  total?: number;
  uploadId?: string;
  onProgress: (loaded: number) => void;
  onRequest: (request: XMLHttpRequest | null) => void;
}) {
  return new Promise<CloudinaryUploadResponse>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    form.append("api_key", signed.apiKey);
    form.append("signature", signed.signature);
    for (const [key, value] of Object.entries(signed.params)) {
      form.append(key, String(value));
    }

    request.open("POST", signed.uploadUrl);
    if (uploadId && start !== undefined && end !== undefined && total) {
      request.setRequestHeader("X-Unique-Upload-Id", uploadId);
      request.setRequestHeader("Content-Range", `bytes ${start}-${end - 1}/${total}`);
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    request.onerror = () => reject(new Error("網路連線中斷，請重新上傳。"));
    request.onabort = () => reject(new Error("已取消影片上傳。"));
    request.onload = () => {
      onRequest(null);
      if (request.status < 200 || request.status >= 300) {
        reject(new Error("Cloudinary 無法接收媒體，請確認格式與大小後重試。"));
        return;
      }
      try {
        resolve(JSON.parse(request.responseText) as CloudinaryUploadResponse);
      } catch {
        reject(new Error("媒體上傳回應格式錯誤。"));
      }
    };
    onRequest(request);
    request.send(form);
  });
}

async function directUpload(
  file: File,
  signed: SignedUploadResponse,
  onProgress: (percent: number) => void,
  onRequest: (request: XMLHttpRequest | null) => void,
  isCancelled: () => boolean,
) {
  if (file.size <= SINGLE_UPLOAD_LIMIT) {
    return uploadRequest({
      file,
      signed,
      onProgress: (loaded) => onProgress(Math.round((loaded / file.size) * 100)),
      onRequest,
    });
  }

  const uploadId = globalThis.crypto.randomUUID();
  let finalResult: CloudinaryUploadResponse = {};
  for (let start = 0; start < file.size; start += CHUNK_SIZE) {
    if (isCancelled()) throw new Error("已取消影片上傳。");
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end, file.type);
    let lastError: unknown;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        finalResult = await uploadRequest({
          file: chunk,
          signed,
          start,
          end,
          total: file.size,
          uploadId,
          onProgress: (loaded) =>
            onProgress(Math.round(((start + loaded) / file.size) * 100)),
          onRequest,
        });
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if (isCancelled()) throw error;
      }
    }
    if (lastError) throw lastError;
  }
  return finalResult;
}

export default function MediaUploader({
  label = "媒體",
  value,
  usage = "content",
  disabled = false,
  showPreview = true,
  imageActionLabel = "選擇圖片",
  videoActionLabel,
  productMediaNaming,
  onChange,
  onImageSelect,
  onImageUpload,
  onRemove,
}: MediaUploaderProps) {
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [lastVideo, setLastVideo] = useState<File | null>(null);
  const activeRequest = useRef<XMLHttpRequest | null>(null);
  const cancelled = useRef(false);

  async function uploadCloudinary(file: File, mediaType: "image" | "video") {
    const limits = mediaType === "image" ? CUSTOM_SECTION_IMAGE_LIMITS : VIDEO_UPLOAD_LIMITS[usage];
    const allowed = mediaType === "image"
      ? isAllowedImageUpload(file.name, file.type)
      : isAllowedVideoUpload(file.name, file.type);
    if (!allowed) {
      setMessage(mediaType === "image" ? "圖片格式僅支援 JPG、PNG 或 WebP。" : "影片格式僅支援 MP4、MOV 或 WebM。");
      return;
    }
    if (file.size <= 0 || file.size > limits.maxBytes) {
      setMessage(`${mediaType === "image" ? "圖片" : "影片"}大小不得超過 ${Math.round(limits.maxBytes / 1024 / 1024)} MB。`);
      return;
    }

    if (mediaType === "video") setLastVideo(file);
    setUploading(true);
    setProgress(0);
    setMessage("準備安全上傳授權…");
    cancelled.current = false;

    try {
      const namingContext = productMediaNaming?.mediaPurpose === "custom-section" && productMediaNaming.sectionId
        ? {
            ...productMediaNaming,
            reservedPublicIds: filterCustomSectionMediaReservedPublicIds({
              publicIds: productMediaNaming.reservedPublicIds || [],
              productSlug: productMediaNaming.productSlug,
              sectionId: productMediaNaming.sectionId,
              mediaType,
            }),
          }
        : productMediaNaming;
      const signResponse = await fetch("/api/admin/media/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usage,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          mediaType,
          ...(namingContext || {}),
        }),
      });
      const signed = (await signResponse.json()) as SignedUploadResponse & { error?: string };
      if (!signResponse.ok) throw new Error(signed.error || "無法取得影片上傳授權。");
      if (cancelled.current) throw new Error("已取消影片上傳。");

      setMessage(`${mediaType === "image" ? "圖片" : "影片"}正直接上傳至 Cloudinary…`);
      const uploaded = await directUpload(
        file,
        signed,
        setProgress,
        (request) => { activeRequest.current = request; },
        () => cancelled.current,
      );
      if (!uploaded.public_id) throw new Error("Cloudinary 未回傳完整媒體資料。");

      setMessage("正在驗證媒體資料…");
      const finalizeResponse = await fetch("/api/admin/media/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId: uploaded.public_id, usage, mediaType, ...(namingContext || {}) }),
      });
      const finalized = (await finalizeResponse.json()) as { error?: string; media?: MediaAsset };
      if (!finalizeResponse.ok || !finalized.media) {
        throw new Error(finalized.error || "媒體驗證失敗，請稍後再試。");
      }

      onChange(finalized.media);
      setProgress(100);
      setMessage(`${mediaType === "image" ? "圖片" : "影片"}已上傳並完成驗證。請儲存頁面變更。`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      activeRequest.current = null;
      setUploading(false);
    }
  }

  async function uploadVideo(file: File) {
    await uploadCloudinary(file, "video");
  }

  async function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (onImageSelect) {
      onImageSelect(file);
      return;
    }
    if (!onImageUpload && productMediaNaming?.mediaPurpose === "custom-section") {
      await uploadCloudinary(file, "image");
      return;
    }
    if (!onImageUpload) {
      setMessage("此位置尚未連接既有圖片上傳流程。");
      return;
    }
    setUploading(true);
    setMessage("圖片上傳中…");
    try {
      onChange(await onImageUpload(file));
      setMessage("圖片上傳完成。請儲存頁面變更。");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  function chooseVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void uploadVideo(file);
  }

  function cancelUpload() {
    cancelled.current = true;
    activeRequest.current?.abort();
  }

  return (
    <section className="kd-media-uploader" aria-busy={uploading}>
      <header>
        <div><strong>{label}</strong><small>{productMediaNaming?.mediaPurpose === "custom-section" ? "圖片與影片皆使用 Cloudinary 安全上傳並完成伺服器驗證。" : "圖片沿用既有上傳；影片直接上傳 Cloudinary。"}</small></div>
        {value && onRemove ? (
          <button type="button" className="kd-media-remove" onClick={onRemove} disabled={uploading || disabled}>移除目前媒體</button>
        ) : null}
      </header>

      {value && showPreview ? (
        <div className="kd-media-upload-preview">
          {value.type === "video" ? (
            <video src={value.url} poster={value.posterUrl} controls playsInline preload="metadata" />
          ) : (
            <img src={value.url} alt={`${label}預覽`} />
          )}
        </div>
      ) : null}

      <div className="kd-media-upload-actions">
        <label>{imageActionLabel}<input type="file" accept="image/*" onChange={chooseImage} disabled={uploading || disabled} /></label>
        <label>{videoActionLabel || (value?.type === "video" ? "更換影片" : "選擇影片")}<input type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" onChange={chooseVideo} disabled={uploading || disabled} /></label>
        {uploading ? (
          <button type="button" onClick={cancelUpload}>取消上傳</button>
        ) : lastVideo && progress < 100 ? (
          <button type="button" onClick={() => void uploadVideo(lastVideo)}>重新上傳</button>
        ) : null}
      </div>

      {uploading || progress > 0 ? (
        <div className="kd-media-upload-progress" aria-label={`上傳進度 ${progress}%`}><span style={{ width: `${progress}%` }} /></div>
      ) : null}
      {message ? <p className="kd-media-upload-message" role="status">{message}</p> : null}
    </section>
  );
}
