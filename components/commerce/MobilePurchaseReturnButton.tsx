"use client";

import { useEffect, useState } from "react";

type MobilePurchaseReturnButtonProps = {
  targetId?: string;
  sentinelId?: string;
};

export default function MobilePurchaseReturnButton({
  targetId = "purchase",
  sentinelId = "purchase-end-sentinel",
}: MobilePurchaseReturnButtonProps) {
  const [hasPassedPurchase, setHasPassedPurchase] = useState(false);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 760px)");
    const sentinel = document.getElementById(sentinelId);
    if (!sentinel) return;

    let observer: IntersectionObserver | undefined;
    const observePurchaseEnd = () => {
      observer?.disconnect();
      setHasPassedPurchase(false);
      if (!mobileQuery.matches) return;

      observer = new IntersectionObserver(([entry]) => {
        // A non-intersecting target may be below or above the viewport. Only
        // the latter means that the complete purchase section was passed.
        setHasPassedPurchase(
          !entry.isIntersecting && entry.boundingClientRect.top < 0,
        );
      }, { threshold: 0 });
      observer.observe(sentinel);
    };

    observePurchaseEnd();
    mobileQuery.addEventListener("change", observePurchaseEnd);
    return () => {
      observer?.disconnect();
      mobileQuery.removeEventListener("change", observePurchaseEnd);
    };
  }, [sentinelId]);

  function returnToPurchase() {
    const target = document.getElementById(targetId);
    if (!target) return;
    setHasPassedPurchase(false);
    target.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }

  return (
    <button
      type="button"
      className={`mobile-purchase-return${hasPassedPurchase ? " is-visible" : ""}`}
      aria-hidden={!hasPassedPurchase}
      aria-label="返回購買區"
      tabIndex={hasPassedPurchase ? 0 : -1}
      onClick={returnToPurchase}
    >
      選購 <span aria-hidden="true">↑</span>
    </button>
  );
}
