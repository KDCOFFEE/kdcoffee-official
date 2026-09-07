"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cartItemKey, useCart } from "./CartProvider";

export default function FloatingCart() {
  const { count, items, removeItem, subtotal, ready } = useCart();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [headerCartVisible, setHeaderCartVisible] = useState(true);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => {
    const viewport = window.matchMedia("(max-width: 760px)");
    let observer: IntersectionObserver | null = null;
    let mountObserver: MutationObserver | null = null;
    let mountTimeout: number | null = null;
    const sync = () => {
      observer?.disconnect();
      if (!viewport.matches) {
        setHeaderCartVisible(false);
        return true;
      }
      const target = document.getElementById("site-header-cart");
      if (!target || !("IntersectionObserver" in window)) {
        setHeaderCartVisible(false);
        return false;
      }
      observer = new IntersectionObserver(([entry]) => setHeaderCartVisible(entry.isIntersecting), { threshold: 0.01 });
      observer.observe(target);
      return true;
    };
    if (!sync()) {
      mountObserver = new MutationObserver(() => {
        if (!sync()) return;
        mountObserver?.disconnect();
        if (mountTimeout !== null) window.clearTimeout(mountTimeout);
      });
      mountObserver.observe(document.body, { childList: true, subtree: true });
      mountTimeout = window.setTimeout(() => mountObserver?.disconnect(), 1500);
    }
    viewport.addEventListener("change", sync);
    return () => {
      observer?.disconnect();
      mountObserver?.disconnect();
      if (mountTimeout !== null) window.clearTimeout(mountTimeout);
      viewport.removeEventListener("change", sync);
    };
  }, []);

  if (!ready || pathname === "/cart" || pathname === "/checkout" || pathname.startsWith("/admin") || (count < 1 && !open)) return null;

  const pendingItem = pendingRemove ? items.find((item) => cartItemKey(item) === pendingRemove) : null;
  const specification = (item: typeof items[number]) => [
    item.optionLabel,
    item.optionDetail,
    item.preparationLabel,
    item.customRoast ? item.roastLevel || "專屬烘焙" : undefined,
  ].filter(Boolean).join(" · ");

  return (
    <div className={`floating-cart-wrap${headerCartVisible ? " is-header-cart-visible" : ""}`}>
      {count > 0 ? <button
        type="button"
        className="floating-cart"
        aria-label={`開啟購物車，共 ${count} 件商品`}
        aria-expanded={open}
        aria-controls="mini-cart-panel"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="floating-cart-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M3 4h2l2.1 10.1a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L20 8H7"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg></span>
        <b>{count}</b>
        <span className="floating-cart-label">購物車</span>
      </button> : null}

      {open ? <>
        <button type="button" className="mini-cart-backdrop" aria-label="關閉購物車" onClick={() => setOpen(false)} />
        <aside className="mini-cart-panel" id="mini-cart-panel" aria-label="迷你購物車">
          <header>
            <div><small>MINI CART</small><strong>購物車 <em>{count}</em></strong></div>
            <button type="button" aria-label="關閉購物車" onClick={() => setOpen(false)}>×</button>
          </header>
          <div className="mini-cart-items">
            {items.length ? items.map((item) => {
              const key = cartItemKey(item);
              return <article className="mini-cart-row" key={key}>
                <div><strong>{item.name}</strong><small>{specification(item)}</small><span>數量 {item.quantity}</span></div>
                <b>NT$ {(item.unitPrice * item.quantity).toLocaleString("zh-TW")}</b>
                <button type="button" className="mini-cart-remove" aria-label={`刪除 ${item.name}`} onClick={() => setPendingRemove(key)}>⌫</button>
              </article>;
            }) : <p className="mini-cart-empty">購物車目前是空的</p>}
          </div>
          {items.length ? <footer>
            <p>商品共 <b>{count}</b> 件 <strong>小計 NT$ {subtotal.toLocaleString("zh-TW")}</strong></p>
            <div><Link href="/cart" onClick={() => setOpen(false)}>查看購物車</Link><Link href="/checkout" onClick={() => setOpen(false)}>前往結帳</Link></div>
          </footer> : <footer className="mini-cart-empty-footer"><Link href="/works" onClick={() => setOpen(false)}>繼續選購</Link></footer>}
          {pendingItem ? <section className="mini-cart-confirm" role="dialog" aria-modal="true" aria-label="確認刪除商品">
            <p>確定要刪除「{pendingItem.name}」嗎？</p>
            <div><button type="button" onClick={() => setPendingRemove(null)}>取消</button><button type="button" onClick={() => { removeItem(pendingRemove!); setPendingRemove(null); }}>確定刪除</button></div>
          </section> : null}
        </aside>
      </> : null}
    </div>
  );
}
