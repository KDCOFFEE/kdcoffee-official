"use client";

import { createContext, createElement, useContext, useEffect, useState, type ReactNode, type JSX } from "react";
import { usePathname } from "next/navigation";
import { normalizeMemberCopyOverrides, resolveMemberCopy, resolveMemberDisplayValue, type MemberCopyOverrides, type MemberCopyValues } from "@/lib/memberCenterCopy";

const CopyContext = createContext<{ overrides: MemberCopyOverrides; pointDisplayName?: string }>({ overrides: {} });
export default function MemberCenterCopyProvider({ initialOverrides, initialPointDisplayName, children }: { initialOverrides: MemberCopyOverrides; initialPointDisplayName?: string; children: ReactNode }) {
  const [overrides, setOverrides] = useState(initialOverrides);
  const [pointDisplayName, setPointDisplayName] = useState(initialPointDisplayName);
  const pathname = usePathname();
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      fetch("/api/member/display-copy", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => {
        if (active && data) { setOverrides(normalizeMemberCopyOverrides(data.overrides)); if (typeof data.pointDisplayName === "string") setPointDisplayName(data.pointDisplayName); }
      }).catch(() => undefined);
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("kd-member-display-copy") : null;
    if (channel) channel.onmessage = refresh;
    return () => { active = false; window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); channel?.close(); };
  }, [pathname]);
  return <CopyContext.Provider value={{ overrides, pointDisplayName }}>{children}</CopyContext.Provider>;
}

/** No DOM wrapper; existing layout and spacing are preserved. */
export function MemberCopyValue({ value }: { value: ReactNode }) {
  const { overrides, pointDisplayName } = useContext(CopyContext);
  if (typeof value !== "string") return value;
  const text = resolveMemberDisplayValue(overrides, value, pointDisplayName);
  return text !== value && text.includes("\n") ? <span style={{ whiteSpace: "pre-line" }}>{text}</span> : text;
}

/** Preserve the native element and props; resolve only accessible/display attributes. */
export function MemberCopyElement<T extends keyof JSX.IntrinsicElements>({ as, ...props }: { as: T } & JSX.IntrinsicElements[T]) {
  const { overrides, pointDisplayName } = useContext(CopyContext);
  const resolved = { ...props } as Record<string, unknown>;
  for (const key of ["aria-label", "placeholder", "title", "alt"]) {
    if (typeof resolved[key] === "string") resolved[key] = resolveMemberDisplayValue(overrides, resolved[key], pointDisplayName);
  }
  return createElement(as, resolved);
}

export function MemberCopyText({ copyKey, values, fallback }: { copyKey: string; values?: MemberCopyValues; fallback?: string }) {
  const { overrides, pointDisplayName } = useContext(CopyContext);
  return resolveMemberCopy(overrides, copyKey, values, fallback, pointDisplayName);
}

export function useMemberCopy() {
  const { overrides, pointDisplayName } = useContext(CopyContext);
  return (value: string) => resolveMemberDisplayValue(overrides, value, pointDisplayName);
}

export function useMemberCopyKey() {
  const { overrides, pointDisplayName } = useContext(CopyContext);
  return (key: string, values: MemberCopyValues = {}) => resolveMemberCopy(overrides, key, values, "", pointDisplayName);
}

/** Business-rule name wins; copy overrides never define a second point name. */
export function useMemberPointDisplayName(configured: string) {
  const { pointDisplayName } = useContext(CopyContext);
  return pointDisplayName || configured || "KD點";
}

/** Internal reward/source codes are presentation keys, never member labels. */
export function MemberRewardCopyValue({ value }: { value: string }) {
  const copy = useMemberCopyKey();
  const keys: Record<string, string> = {
    admin_grant: "credit.passbook.adminGrant", admin_deduct: "credit.passbook.adminDeduction",
    referral_reward: "credit.passbook.referral", referral: "credit.passbook.referral",
    retail_promotion: "credit.passbook.retailReward", member_reward: "credit.passbook.memberReward",
    self_purchase: "member.selfPurchase.title", credit_release: "credit.passbook.creditIssued",
    pending: "member.referral.reward.dc9160b21b", released: "member.referral.reward.6bd122e2dd",
    cancelled: "member.dashboard.button.a5ffdc95ee", reversed: "member.rewards.label.2c0a067be7",
  };
  if (keys[value]) return copy(keys[value]);
  if (/^[a-z][a-z0-9]*_[a-z0-9_]+$/u.test(value)) return copy("credit.reward.unknownStatus");
  return <MemberCopyValue value={value} />;
}
