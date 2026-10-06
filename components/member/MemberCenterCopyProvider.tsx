"use client";

import { createContext, createElement, useContext, useEffect, useState, type ReactNode, type JSX } from "react";
import { usePathname } from "next/navigation";
import { normalizeMemberCopyOverrides, resolveMemberCopy, resolveMemberDisplayValue, type MemberCopyOverrides, type MemberCopyValues } from "@/lib/memberCenterCopy";

const CopyContext = createContext<MemberCopyOverrides>({});
export default function MemberCenterCopyProvider({ initialOverrides, children }: { initialOverrides: MemberCopyOverrides; children: ReactNode }) {
  const [overrides, setOverrides] = useState(initialOverrides);
  const pathname = usePathname();
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      fetch("/api/member/display-copy", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => {
        if (active && data) setOverrides(normalizeMemberCopyOverrides(data.overrides));
      }).catch(() => undefined);
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("kd-member-display-copy") : null;
    if (channel) channel.onmessage = refresh;
    return () => { active = false; window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); channel?.close(); };
  }, [pathname]);
  return <CopyContext.Provider value={overrides}>{children}</CopyContext.Provider>;
}

/** No DOM wrapper; existing layout and spacing are preserved. */
export function MemberCopyValue({ value }: { value: ReactNode }) {
  const overrides = useContext(CopyContext);
  if (typeof value !== "string") return value;
  const text = resolveMemberDisplayValue(overrides, value);
  return text !== value && text.includes("\n") ? <span style={{ whiteSpace: "pre-line" }}>{text}</span> : text;
}

/** Preserve the native element and props; resolve only accessible/display attributes. */
export function MemberCopyElement<T extends keyof JSX.IntrinsicElements>({ as, ...props }: { as: T } & JSX.IntrinsicElements[T]) {
  const overrides = useContext(CopyContext);
  const resolved = { ...props } as Record<string, unknown>;
  for (const key of ["aria-label", "placeholder", "title", "alt"]) {
    if (typeof resolved[key] === "string") resolved[key] = resolveMemberDisplayValue(overrides, resolved[key]);
  }
  return createElement(as, resolved);
}

export function MemberCopyText({ copyKey, values, fallback }: { copyKey: string; values?: MemberCopyValues; fallback?: string }) {
  const overrides = useContext(CopyContext);
  return resolveMemberCopy(overrides, copyKey, values, fallback);
}

export function useMemberCopy() {
  const overrides = useContext(CopyContext);
  return (value: string) => resolveMemberDisplayValue(overrides, value);
}

export function useMemberCopyKey() {
  const overrides = useContext(CopyContext);
  return (key: string, values: MemberCopyValues = {}) => resolveMemberCopy(overrides, key, values);
}
