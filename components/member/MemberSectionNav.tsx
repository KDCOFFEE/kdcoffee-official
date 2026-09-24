"use client";

import { useCallback, useEffect, useState } from "react";

const items = [
  { id: "member-overview", label: "會員總覽", mobileLabel: "總覽" },
  { id: "account", label: "帳戶資料", mobileLabel: "帳戶" },
  { id: "subscription", label: "定期配送", mobileLabel: "配送" },
  { id: "referral", label: "推薦與回饋", mobileLabel: "回饋" },
  { id: "orders", label: "訂單", mobileLabel: "訂單" },
] as const;

export default function MemberSectionNav() {
  const [activeId, setActiveId] = useState<(typeof items)[number]["id"]>("member-overview");

  const activate = useCallback((requestedId: string) => {
    const item = items.find((candidate) => candidate.id === requestedId) ?? items[0];
    setActiveId(item.id);
    document.querySelectorAll<HTMLElement>("[data-member-section]").forEach((section) => {
      section.hidden = section.id !== item.id;
    });
  }, []);

  useEffect(() => {
    const syncHash = () => activate(window.location.hash.slice(1));
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [activate]);

  return (
    <nav className="member-center-nav" aria-label="會員中心導覽" role="tablist">
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={activeId === item.id ? "is-active" : undefined}
          role="tab"
          aria-selected={activeId === item.id}
          aria-controls={item.id}
          onClick={() => activate(item.id)}
        >
          <span className="member-nav-desktop-label">{item.label}</span>
          <span className="member-nav-mobile-label">{item.mobileLabel}</span>
        </a>
      ))}
    </nav>
  );
}
