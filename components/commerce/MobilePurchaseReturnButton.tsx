"use client";

import { useEffect, useState } from "react";

type MobilePurchaseReturnButtonProps = {
  targetId?: string;
};

export default function MobilePurchaseReturnButton({
  targetId = "purchase",
}: MobilePurchaseReturnButtonProps) {
  const [hasPassedPurchase, setHasPassedPurchase] = useState(false);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 760px)");
    const target = document.getElementById(targetId);
    if (!target) return;

    let observer: IntersectionObserver | undefined;
    const observePurchase = () => {
      observer?.disconnect();
      setHasPassedPurchase(false);
      if (!mobileQuery.matches) return;

      observer = new IntersectionObserver(([entry]) => {
        setHasPassedPurchase(entry.boundingClientRect.bottom <= 0);
      }, { threshold: 0 });
      observer.observe(target);
    };

    observePurchase();
    mobileQuery.addEventListener("change", observePurchase);
    return () => {
      observer?.disconnect();
      mobileQuery.removeEventListener("change", observePurchase);
    };
  }, [targetId]);

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
