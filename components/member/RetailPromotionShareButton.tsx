"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { isRetailPromotionShareablePath, retailPromotionShareUrl } from "@/lib/retailPromotionRoutes";

type ShareIdentity = {
  referralCode: string;
  settings: { enabled: boolean };
};

export default function RetailPromotionShareButton() {
  const pathname = usePathname();
  const [identity, setIdentity] = useState<ShareIdentity | null>(null);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!isRetailPromotionShareablePath(pathname)) return;
    let active = true;
    void fetch("/api/member/retail-promotion", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<ShareIdentity> : null)
      .then((result) => { if (active && result?.settings.enabled) setIdentity(result); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [pathname]);

  if (!identity || !isRetailPromotionShareablePath(pathname)) return null;

  async function shareCurrentPage() {
    try {
      const url = retailPromotionShareUrl(window.location.href, identity!.referralCode);
      if (navigator.share) {
        await navigator.share({ title: document.title, text: "和你分享 KD Coffee", url });
        setFeedback("分享完成");
      } else {
        await navigator.clipboard.writeText(url);
        setFeedback("分享連結已複製");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFeedback("暫時無法分享，請稍後再試");
    }
    window.setTimeout(() => setFeedback(""), 2400);
  }

  return (
    <aside className="retail-promotion-share" aria-live="polite">
      <button type="button" onClick={() => void shareCurrentPage()}>分享目前頁面</button>
      {feedback ? <span>{feedback}</span> : null}
    </aside>
  );
}
