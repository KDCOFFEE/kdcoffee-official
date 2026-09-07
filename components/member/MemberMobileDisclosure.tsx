"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  eyebrow: string;
  title: string;
  summary: string;
  children: ReactNode;
  className?: string;
  id?: string;
};

/**
 * Keeps desktop sections open, while making large mobile dashboard areas
 * intentional entry points. Hash navigation opens the containing section.
 */
export default function MemberMobileDisclosure({ eyebrow, title, summary, children, className = "", id }: Props) {
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 700px)");
    const sync = () => setOpen(!query.matches);
    const revealHashTarget = () => {
      const target = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
      if (target && ref.current?.contains(target)) setOpen(true);
    };
    sync();
    revealHashTarget();
    query.addEventListener("change", sync);
    window.addEventListener("hashchange", revealHashTarget);
    return () => {
      query.removeEventListener("change", sync);
      window.removeEventListener("hashchange", revealHashTarget);
    };
  }, []);

  return (
    <details ref={ref} id={id} className={`member-mobile-disclosure ${className}`.trim()} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span><small>{eyebrow}</small><strong>{title}</strong><em>{summary}</em></span>
        <b>{open ? "收合" : "查看"}</b>
      </summary>
      <div className="member-mobile-disclosure-body">{children}</div>
    </details>
  );
}
