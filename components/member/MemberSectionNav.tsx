"use client";

import { useEffect, useState } from "react";

const items = [
  { id: "member-overview", label: "會員總覽" },
  { id: "account", label: "帳戶資料" },
  { id: "subscription", label: "定期配送" },
  { id: "referral", label: "推薦與回饋" },
  { id: "orders", label: "訂單" },
] as const;

export default function MemberSectionNav() {
  const [activeId, setActiveId] = useState<(typeof items)[number]["id"]>("member-overview");

  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((section): section is HTMLElement => Boolean(section));

    if (!sections.length || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top));
        if (visible[0]) setActiveId(visible[0].target.id as (typeof items)[number]["id"]);
      },
      { rootMargin: "-18% 0px -68% 0px", threshold: 0 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="member-center-nav" aria-label="會員中心導覽">
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={activeId === item.id ? "is-active" : undefined}
          aria-current={activeId === item.id ? "location" : undefined}
          onClick={() => setActiveId(item.id)}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
