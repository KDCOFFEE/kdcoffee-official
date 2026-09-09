"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

const REFERRAL_CODE_PATTERN = /^KD[A-F0-9]{10}$/;

export default function ReferralAttributionCapture() {
  const searchParams = useSearchParams();
  const lastSubmitted = useRef("");

  const referralCode =
    searchParams.get("ref")?.trim().toUpperCase() ?? "";

  useEffect(() => {
    if (
      !REFERRAL_CODE_PATTERN.test(referralCode) ||
      lastSubmitted.current === referralCode
    ) {
      return;
    }

    lastSubmitted.current = referralCode;

    void fetch("/api/referral-attribution", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      keepalive: true,
      body: JSON.stringify({
        referralCode,
      }),
    }).catch(() => {
      lastSubmitted.current = "";
    });
  }, [referralCode]);

  return null;
}
