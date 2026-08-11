"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const navigationItems = [
  { href: "/#home003", label: "第一次怎麼選" },
  { href: "/#home004", label: "本月推薦" },
  { href: "/works", label: "全部咖啡" },
  { href: "/#home002", label: "為什麼是 KD" },
  { href: "/#home003", label: "耳掛與送禮" },
];

const mobileNavigationId = "mobile-primary-navigation";

export default function HeaderNavigation() {
  const pathname = usePathname();
  const navigationRef = useRef<HTMLDivElement>(null);
  const [menuState, setMenuState] = useState({ isOpen: false, pathname });
  const isOpen = menuState.isOpen && menuState.pathname === pathname;

  const closeMenu = () => setMenuState({ isOpen: false, pathname });

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuState({ isOpen: false, pathname });
    };
    const handleOutsideClick = (event: PointerEvent) => {
      if (!navigationRef.current?.contains(event.target as Node)) {
        setMenuState({ isOpen: false, pathname });
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("pointerdown", handleOutsideClick);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("pointerdown", handleOutsideClick);
    };
  }, [isOpen, pathname]);

  return (
    <div className="header-navigation" ref={navigationRef}>
      <nav className="desktop-navigation" aria-label="主要導覽">
        {navigationItems.map((item) => <Link key={`${item.href}-${item.label}`} href={item.href}>{item.label}</Link>)}
      </nav>

      <button
        type="button"
        className={`mobile-menu-button ${isOpen ? "is-open" : ""}`}
        aria-label={isOpen ? "關閉主選單" : "開啟主選單"}
        aria-expanded={isOpen}
        aria-controls={mobileNavigationId}
        onClick={() => setMenuState({ isOpen: !isOpen, pathname })}
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </button>

      <div className="mobile-navigation-panel" hidden={!isOpen}>
        <nav id={mobileNavigationId} aria-label="手機主要導覽">
          {navigationItems.map((item) => (
            <Link key={`${item.href}-${item.label}`} href={item.href} onClick={closeMenu}>{item.label}</Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
