"use client";

import Link from "next/link";
import { useState } from "react";
import { cartItemKey, cartSkuKey, useCart } from "@/components/commerce/CartProvider";
import { CartRecoveryNotice } from "@/components/commerce/CommerceCheckoutBoundary";
import { cartProductHref, cartSpecification, coffeeRoastEligible, cartInventoryLimit, checkoutEligibilityMessage } from "@/lib/commerceCart";
import { ALLOWED_ROAST_LEVELS } from "@/lib/checkoutRules";

export default function CartPage() {
  const { items, subtotal, updateQuantity, removeItem, updateCustomRoast, ready, unresolved, persistenceWarning, checkoutEligibility } = useCart();
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  return <main className="commerce-page">
    <header className="commerce-topbar"><Link href="/">KD COFFEE</Link><span>購物車</span><Link href="/works">繼續選購</Link></header>
    <section className="commerce-shell">
      <div className="commerce-title"><p className="eyebrow dark">YOUR SELECTION</p><h1>購物車</h1><p>確認商品、規格與數量後，再前往填寫取貨資料。</p></div>
      <CartRecoveryNotice />
      {ready && items.length === 0 && !unresolved.length && !persistenceWarning ? <div className="empty-cart">
        <h2>購物車目前是空的</h2><p>選一杯咖啡，或逛逛日常器物。</p>
        <Link href="/works">選購咖啡</Link> · <Link href="/store">逛逛商店</Link>
      </div> : items.length ? <div className="cart-layout">
        <div className="cart-list">{items.map((item) => {
          const key = cartItemKey(item);
          const coffee = item.domain === "coffee" ? item.coffeeOptions : null;
          const eligible = coffeeRoastEligible(item);
          const note = draftNotes[key] ?? coffee?.roastNote ?? "";
          const stockLimit = cartInventoryLimit(items, item);
          const skuQuantity = items.reduce((sum, entry) => sum + (cartSkuKey(entry) === cartSkuKey(item) ? entry.quantity : 0), 0);
          const atStockLimit = skuQuantity >= stockLimit;
          return <article className="cart-row" key={key}>
            <div className="cart-row-copy">
              <h2><Link href={cartProductHref(item)}>{item.name}</Link></h2>
              {cartSpecification(item) ? <p>{cartSpecification(item)}</p> : null}
              {coffee && (eligible || coffee.customRoast) ? <section className="cart-roast-editor">
                <div className="cart-roast-editor-head"><strong>{eligible ? "已達 2 磅，可選專屬烘焙" : "請確認專屬烘焙數量"}</strong><span>選填</span></div>
                <label className="cart-roast-switch"><input type="checkbox" checked={coffee.customRoast} onChange={e => updateCustomRoast(key, { enabled: e.target.checked, roastLevel: e.target.checked ? (coffee.roastLevel || "淺中焙") : undefined, roastNote: note })} /><span>我要使用專屬烘焙服務</span></label>
                {coffee.customRoast ? <div className="cart-roast-options">
                  <div className="cart-roast-levels">{ALLOWED_ROAST_LEVELS.map(level => <button type="button" className={coffee.roastLevel === level ? "active" : ""} key={level} onClick={() => updateCustomRoast(key, { enabled: true, roastLevel: level, roastNote: note })}>{level}</button>)}</div>
                  <label>風味需求或備註<textarea value={note} maxLength={160} rows={2} placeholder="例如：希望甜感明顯、酸感柔和" onChange={e => setDraftNotes(v => ({ ...v, [key]: e.target.value }))} onBlur={() => {
                    if (updateCustomRoast(key, { enabled: true, roastLevel: coffee.roastLevel || "淺中焙", roastNote: note })) {
                      setDraftNotes(v => { const next = { ...v }; delete next[key]; return next; });
                    }
                  }} /></label>
                </div> : null}
              </section> : null}
              {stockLimit === 0 ? <small role="status">目前無法購買</small> : item.domain === "coffee" && item.quantityLimit !== undefined ? <small>現貨購買上限：此規格共 {stockLimit} 包{atStockLimit ? "（已達上限）" : ""}</small> : null}
              {item.domain === "store" ? <small>商店結帳整合尚未開放</small> : null}
              <button className="cart-remove-button" type="button" onClick={() => removeItem(key)}>刪除此商品</button>
            </div>
            <div className="quantity-control">
              <button type="button" aria-label={`減少 ${item.name} 數量`} onClick={() => item.quantity <= 1 ? removeItem(key) : updateQuantity(key, item.quantity - 1)}>−</button>
              <span aria-live="polite">{item.quantity}</span>
              <button type="button" aria-label={`增加 ${item.name} 數量`} disabled={atStockLimit} title={atStockLimit ? "已達現貨庫存上限" : undefined} onClick={() => updateQuantity(key, item.quantity + 1)}>＋</button>
            </div>
            <strong>NT$ {(item.unitPrice * item.quantity).toLocaleString("zh-TW")}</strong>
          </article>;
        })}</div>
        <aside className="cart-summary"><p>商品小計</p><strong>NT$ {subtotal.toLocaleString("zh-TW")}</strong><small>運費將在結帳頁依設定計算。</small>
          {checkoutEligibility === "ELIGIBLE" ? <Link href="/checkout">前往結帳</Link> : <p role="alert">{checkoutEligibilityMessage(checkoutEligibility)}</p>}
        </aside>
      </div> : null}
    </section>
  </main>;
}
