"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cartItemKey, cartSkuKey, useCart } from "./CartProvider";
import { cartProductHref, cartSpecification, cartInventoryLimit, checkoutEligibilityMessage } from "@/lib/commerceCart";
import { CartRecoveryNotice } from "./CommerceCheckoutBoundary";

export default function FloatingCart() {
  const { count, items, removeItem, subtotal, updateQuantity, ready, unresolved, persistenceWarning, checkoutEligibility } = useCart();
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

  const recovery = !ready || unresolved.length > 0 || persistenceWarning;
  if (pathname === "/cart" || pathname === "/checkout" || pathname.startsWith("/admin") || (count < 1 && !open && !recovery)) return null;

  const pendingItem = pendingRemove ? items.find((item) => cartItemKey(item) === pendingRemove) : null;
  return (
    <div className={`floating-cart-wrap${headerCartVisible ? " is-header-cart-visible" : ""}`}>
      {count > 0 || recovery ? <button
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
            <CartRecoveryNotice />
            {items.length ? items.map((item) => {
              const key = cartItemKey(item);
              const stockLimit = cartInventoryLimit(items, item);
              const skuQuantity = items.reduce((sum, entry) => sum + (cartSkuKey(entry) === cartSkuKey(item) ? entry.quantity : 0), 0);
              const atStockLimit = skuQuantity >= stockLimit;
              return <article className="mini-cart-row" key={key}>
                <div className="mini-cart-line-head">
                  <strong><Link href={cartProductHref(item)} onClick={() => setOpen(false)}>{item.name}</Link></strong>
                  <button type="button" className="mini-cart-remove" aria-label={`刪除 ${item.name}`} onClick={() => setPendingRemove(key)}>刪除</button>
                </div>
                <div className="mini-cart-line-copy">
                  {cartSpecification(item) ? <small>{cartSpecification(item)}</small> : null}
                  {stockLimit === 0 ? <small role="status">目前無法購買</small> : null}
                  {item.domain === "store" ? <small>商店結帳整合尚未開放</small> : null}
                  <span>NT$ {item.unitPrice.toLocaleString("zh-TW")}</span>
                </div>
                <div className="mini-cart-line-actions">
                  <div className="mini-cart-quantity" aria-label={`${item.name} 數量`}>
                    <button type="button" aria-label={`減少 ${item.name} 數量`} disabled={item.quantity <= 1} onClick={() => updateQuantity(key, item.quantity - 1)}>−</button>
                    <span aria-live="polite">{item.quantity}</span>
                    <button type="button" aria-label={`增加 ${item.name} 數量`} disabled={atStockLimit} title={atStockLimit ? "已達現貨庫存上限" : undefined} onClick={() => updateQuantity(key, item.quantity + 1)}>＋</button>
                  </div>
                  <p>小計 <b>NT$ {(item.unitPrice * item.quantity).toLocaleString("zh-TW")}</b></p>
                </div>
              </article>;
            }) : ready && !unresolved.length && !persistenceWarning ? <p className="mini-cart-empty">購物車目前是空的</p> : null}
          </div>
          {items.length ? <footer>
            <p>商品總計（{count} 件） <strong>NT$ {subtotal.toLocaleString("zh-TW")}</strong></p>
            {checkoutEligibility !== "ELIGIBLE" ? <p role="status">{checkoutEligibilityMessage(checkoutEligibility)}</p> : null}
            <div><Link href="/cart" onClick={() => setOpen(false)}>查看購物車</Link>{checkoutEligibility === "ELIGIBLE" ? <Link href="/checkout" onClick={() => setOpen(false)}>前往結帳</Link> : <Link href="/cart" onClick={() => setOpen(false)}>確認購物車</Link>}</div>
          </footer> : <footer className="mini-cart-empty-footer"><Link href="/cart" onClick={() => setOpen(false)}>查看購物車</Link>{ready && !recovery ? <><Link href="/works" onClick={() => setOpen(false)}>選購咖啡</Link><Link href="/store" onClick={() => setOpen(false)}>逛逛商店</Link></> : null}</footer>}
          {pendingItem ? <section className="mini-cart-confirm" role="dialog" aria-modal="true" aria-label="確認刪除商品">
            <p>確定要刪除「{pendingItem.name}」嗎？</p>
            <div><button type="button" onClick={() => setPendingRemove(null)}>取消</button><button type="button" onClick={() => { removeItem(pendingRemove!); setPendingRemove(null); }}>確定刪除</button></div>
          </section> : null}
        </aside>
      </> : null}
    </div>
  );
}
