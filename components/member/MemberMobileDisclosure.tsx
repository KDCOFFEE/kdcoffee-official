"use client";

import { MemberCopyValue } from "@/components/member/MemberCenterCopyProvider";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  eyebrow: string;
  title: string;
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  defaultOpen?: boolean;
  actionLabel?: string;
};

/**
 * Keeps complete member tools behind an intentional second layer on every
 * viewport. Hash navigation still reveals the requested section.
 *
 * Native <details> state can be restored by the browser before React
 * hydration. Keep React as the canonical state after hydration while
 * suppressing only that known native open-attribute mismatch.
 */
export default function MemberMobileDisclosure({
  eyebrow,
  title,
  summary,
  children,
  className = "",
  id,
  defaultOpen = false,
  actionLabel = "管理",
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLDetailsElement>(null);

  /**
   * Browsers may restore the native <details open> state before React
   * hydrates. After hydration, explicitly synchronize the DOM back to the
   * canonical React state so the disclosure and its label cannot disagree.
   */
  useEffect(() => {
    const details = ref.current;
    if (!details) return;

    if (details.open !== open) {
      details.open = open;
    }
  }, [open]);

  useEffect(() => {
    const revealHashTarget = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;

      const target = document.getElementById(hash);

      if (target && ref.current?.contains(target)) {
        setOpen(true);
      }
    };

    revealHashTarget();

    window.addEventListener("hashchange", revealHashTarget);

    return () => {
      window.removeEventListener("hashchange", revealHashTarget);
    };
  }, []);

  return (
    <details
      ref={ref}
      id={id}
      className={`member-mobile-disclosure ${className}`.trim()}
      open={open}
      suppressHydrationWarning
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>
          <small><MemberCopyValue value={eyebrow} /></small>
          <strong><MemberCopyValue value={title} /></strong>
          <em>{summary}</em>
        </span>

        <b><MemberCopyValue value={open ? "收合" : actionLabel} /></b>
      </summary>

      <div className="member-mobile-disclosure-body">
        {children}
      </div>
    </details>
  );
}
