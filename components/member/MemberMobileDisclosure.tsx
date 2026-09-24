"use client";

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
 */
export default function MemberMobileDisclosure({ eyebrow, title, summary, children, className = "", id, defaultOpen = false, actionLabel = "管理" }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const revealHashTarget = () => {
      const target = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
      if (target && ref.current?.contains(target)) setOpen(true);
    };
    revealHashTarget();
    window.addEventListener("hashchange", revealHashTarget);
    return () => window.removeEventListener("hashchange", revealHashTarget);
  }, []);

  return (
    <details ref={ref} id={id} className={`member-mobile-disclosure ${className}`.trim()} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span><small>{eyebrow}</small><strong>{title}</strong><em>{summary}</em></span>
        <b>{open ? "收合" : actionLabel}</b>
      </summary>
      <div className="member-mobile-disclosure-body">{children}</div>
    </details>
  );
}
