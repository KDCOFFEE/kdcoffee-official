"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./MemberCenterExperience.module.css";

const items = [
  { id: "member-overview", label: "會員總覽", mobileLabel: "總覽" },
  { id: "account", label: "帳戶資料", mobileLabel: "帳戶" },
  { id: "subscription", label: "定期配送", mobileLabel: "配送" },
  { id: "referral", label: "推薦", mobileLabel: "推薦" },
  { id: "rewards", label: "回饋", mobileLabel: "回饋" },
  { id: "orders", label: "訂單", mobileLabel: "訂單" },
] as const;

export default function MemberSectionNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeId, setActiveId] = useState<(typeof items)[number]["id"]>("member-overview");
  const tabListRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<(typeof items)[number]["id"], HTMLAnchorElement | null>>>({});

  const activate = useCallback((requestedId: string) => {
    const normalizedId = requestedId === "credit" ? "rewards" : requestedId;
    const item = items.find((candidate) => candidate.id === normalizedId) ?? items[0];
    setActiveId(item.id);
    document.querySelectorAll<HTMLElement>("[data-member-section]").forEach((section) => {
      section.hidden = section.id !== item.id;
    });
    window.dispatchEvent(new CustomEvent("kd-member-section-activated", {
      detail: { id: item.id },
    }));
  }, []);

  useEffect(() => {
    const syncRoute = () => activate(window.location.hash.slice(1));
    syncRoute();
    window.addEventListener("hashchange", syncRoute);
    window.addEventListener("popstate", syncRoute);
    return () => {
      window.removeEventListener("hashchange", syncRoute);
      window.removeEventListener("popstate", syncRoute);
    };
  }, [activate, pathname, searchParams]);

  useEffect(() => {
    const tabList = tabListRef.current;
    const activeTab = tabRefs.current[activeId];
    if (!tabList || !activeTab || tabList.scrollWidth <= tabList.clientWidth) return;

    const centeredLeft = activeTab.offsetLeft - (tabList.clientWidth - activeTab.offsetWidth) / 2;
    const maximumLeft = tabList.scrollWidth - tabList.clientWidth;
    tabList.scrollTo({ left: Math.max(0, Math.min(centeredLeft, maximumLeft)), behavior: "smooth" });
  }, [activeId]);

  return (
    <nav className={`member-center-nav ${styles.navigation}`} aria-label="會員中心導覽">
      <div ref={tabListRef} className={styles.tabList} role="tablist" aria-label="會員中心功能">
        {items.map((item) => (
          <Link
            key={item.id}
            ref={(element) => { tabRefs.current[item.id] = element; }}
            href={`/member#${item.id}`}
            className={activeId === item.id ? "is-active" : undefined}
            role="tab"
            aria-selected={activeId === item.id}
            aria-controls={item.id}
            onClick={() => activate(item.id)}
          >
            <span className="member-nav-desktop-label">{item.label}</span>
            <span className="member-nav-mobile-label">{item.mobileLabel}</span>
          </Link>
        ))}
      </div>
      <Link href="/" className={styles.homeLink}>
        <span className={styles.homeIcon} aria-hidden="true">⌂</span>
        <span className={styles.homeLabelDesktop}>返回首頁</span>
        <span className={styles.homeLabelMobile}>首頁</span>
      </Link>
    </nav>
  );
}
