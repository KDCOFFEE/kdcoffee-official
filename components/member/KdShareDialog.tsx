"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";

import { retailPromotionShareUrl } from "@/lib/retailPromotionRoutes";

type Props = {
  open: boolean;
  referralCode: string;
  onClose: () => void;
};

const defaultShareText = "最近喝到一家我很喜歡的咖啡，想分享給你 ☕\n\nKD Coffee 是自己烘焙的精品咖啡，每款都有不同的風味。有空可以逛逛，說不定會找到你喜歡的那一杯。";

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("copy_failed");
}

export default function KdShareDialog({ open, referralCode, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [shareText, setShareText] = useState(defaultShareText);
  const [feedback, setFeedback] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const canonicalShareUrl = () => retailPromotionShareUrl(`${window.location.origin}/`, referralCode);
  const qrUrl = qrOpen ? `https://quickchart.io/qr?size=640&margin=2&text=${encodeURIComponent(canonicalShareUrl())}` : "";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function showFeedback(value: string) {
    setFeedback(value);
    window.setTimeout(() => setFeedback(""), 2400);
  }

  async function share() {
    try {
      const shareUrl = canonicalShareUrl();
      if (navigator.share) {
        await navigator.share({ title: "KD Coffee", text: shareText, url: shareUrl });
        showFeedback("分享完成");
      } else {
        await copyText(`${shareText}\n\n${shareUrl}`);
        showFeedback("分享內容已複製，可以直接貼給朋友");
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      showFeedback("暫時無法分享，請稍後再試");
    }
  }

  async function copyLink() {
    try {
      await copyText(canonicalShareUrl());
      showFeedback("分享連結已複製");
    } catch {
      showFeedback("複製失敗，請選取連結後手動複製");
    }
  }

  async function downloadQr() {
    try {
      const response = await fetch(qrUrl);
      if (!response.ok) throw new Error("qr_download_failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `KD-Coffee-${referralCode}-QR.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      showFeedback("QR Code 圖片已下載");
    } catch {
      window.open(qrUrl, "_blank", "noopener,noreferrer");
      showFeedback("已開啟 QR Code 圖片，可長按或另存圖片");
    }
  }

  return (
    <dialog ref={dialogRef} className="kd-share-dialog" aria-labelledby="kd-share-dialog-title" onClose={onClose}>
      <div className="kd-share-dialog-shell">
        <header>
          <div><p className="eyebrow dark">SHARE KD COFFEE</p><h2 id="kd-share-dialog-title">分享 KD Coffee</h2></div>
          <button type="button" aria-label="關閉分享視窗" onClick={() => dialogRef.current?.close()}>×</button>
        </header>
        <div className="kd-share-dialog-body">
          <p className="kd-share-dialog-intro">把你喜歡的 KD Coffee 分享給朋友。連結會保留你的分享來源，朋友仍可自由瀏覽與選購。</p>
          <label className="kd-share-copy-editor">
            <span>分享文字</span>
            <textarea value={shareText} maxLength={400} rows={6} onChange={(event) => setShareText(event.target.value)} />
          </label>
          <div className="kd-share-url"><span>分享連結</span><strong>KD Coffee 首頁＋你的分享碼</strong></div>
          <div className="kd-share-actions">
            <button className="kd-share-primary" type="button" onClick={() => void share()}>分享出去</button>
            <button type="button" onClick={() => void copyLink()}>複製連結</button>
            <button type="button" aria-expanded={qrOpen} onClick={() => setQrOpen((current) => !current)}>{qrOpen ? "收起 QR Code" : "顯示 QR Code"}</button>
          </div>
          {qrOpen ? <section className="kd-share-qr" aria-label="分享 QR Code">
            <img width="220" height="220" alt="KD Coffee 分享 QR Code" src={qrUrl} />
            <button type="button" onClick={() => void downloadQr()}>下載 QR Code</button>
          </section> : null}
          <details className="kd-share-explanation"><summary>分享如何計算？</summary><p>朋友從這個連結進入 KD Coffee 後，以訪客身分完成有效訂單，可列入你的推廣零售；若朋友完成會員註冊，推薦關係會由系統自動記錄。已登入會員購買仍屬於該會員自己的消費。</p></details>
          <p className="kd-share-feedback" role="status" aria-live="polite">{feedback}</p>
        </div>
      </div>
    </dialog>
  );
}
