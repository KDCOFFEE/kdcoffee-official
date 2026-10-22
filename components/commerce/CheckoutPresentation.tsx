import Link from "next/link";
import { useRef, type ReactNode, type RefObject } from "react";
import styles from "./CheckoutPresentation.module.css";

/** Presentation only: commerce state, calculations and submission stay with each adapter. */
export function CheckoutShell({ children, title = "選擇配送方式", description = "一般訂購可選 7-ELEVEN 取貨付款、KD Coffee 工作室自取或宅配。" }: { children: ReactNode; title?: string; description?: string | null }) {
  return <main className="commerce-page">
    <header className="commerce-topbar"><Link href="/">KD COFFEE</Link><span>結帳</span><Link href="/cart">返回購物車</Link></header>
    <section className="checkout-shell">
      <div className="commerce-title"><p className="eyebrow dark">CHECKOUT</p><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>
      {children}
    </section>
  </main>;
}

export function CheckoutContactNotice({ member, memberLoaded, memberMessage = "已自動帶入常用聯絡資料與門市；本次修改後會同步更新會員資料。" }: { member: { displayName: string } | null; memberLoaded: boolean; memberMessage?: string }) {
  return <>{memberLoaded && (member ? (
              <div className="delivery-notice checkout-member-notice">
                <strong>已登入會員：{member.displayName || "KD Coffee 會員"}</strong>
                <p>{memberMessage}</p>
              </div>
            ) : (
              <div className="checkout-auth-intro">
                <div>
                  <strong>登入會員，結帳更快速</strong>
                  <p>可保存聯絡資料、常用門市與訂單紀錄。不登入也可以直接以訪客身分購買。</p>
                </div>
                <div className="checkout-login-options">
                  <a className="line-login-button" href="/api/auth/line/login?returnTo=/checkout">使用 LINE 登入／註冊</a>
                  <Link className="email-login-button" href="/member?returnTo=/checkout">Email 登入／註冊</Link>
                </div>
                <div className="checkout-guest-divider" aria-hidden="true"><span>或</span></div>
                <div className="checkout-guest-intro">
                  <strong>訪客直接購買</strong>
                  <p>無需登入，填寫以下資料即可完成結帳。</p>
                </div>
              </div>
            ))}</>;
}

export function CheckoutDeliveryOptions({ mode, onChange }: { mode: "711_cod" | "studio_pickup" | "home_delivery"; onChange: (mode: "711_cod" | "studio_pickup" | "home_delivery") => void }) {
  return <section className="form-card"><div className="form-card-head"><span>02</span><h2>取貨方式</h2></div><div className="delivery-mode-grid">
            <label className={mode === "711_cod" ? "delivery-mode active" : "delivery-mode"}><input type="radio" name="orderMode" value="711_cod" checked={mode === "711_cod"} onChange={()=>onChange("711_cod")} /><b>7-ELEVEN 取貨付款</b><span>商品到店後再付款取貨</span></label>
            <label className={mode === "studio_pickup" ? "delivery-mode active" : "delivery-mode"}><input type="radio" name="orderMode" value="studio_pickup" checked={mode === "studio_pickup"} onChange={()=>onChange("studio_pickup")} /><b>到工作室取貨</b><span>免運費，由工作室確認取貨時間</span></label>
            <label className={mode === "home_delivery" ? "delivery-mode active" : "delivery-mode"}><input type="radio" name="orderMode" value="home_delivery" checked={mode === "home_delivery"} onChange={()=>onChange("home_delivery")} /><b>宅配</b><span>配送到指定地址</span></label>
          </div></section>;
}

export function CheckoutSummary({ children }: { children: ReactNode }) {
  return <aside className="checkout-summary"><h2>訂單摘要</h2>{children}</aside>;
}


/** Shared native HTML dialog with KD presentation; showModal supplies focus and background locking. */
export function CheckoutModal({ dialogRef, id, title, children, actions }: {
  dialogRef: RefObject<HTMLDialogElement | null>; id: string; title: string; children: ReactNode; actions: ReactNode;
}) {
  return <dialog ref={dialogRef} className={styles.infoDialog} aria-labelledby={id + "-title"} aria-describedby={id + "-copy"}>
    <h2 id={id + "-title"}>{title}</h2>
    <div id={id + "-copy"}>{children}</div>
    <div className={styles.dialogActions}>{actions}</div>
  </dialog>;
}

/** Invoked only after the branded confirmation; canonical mutation and the empty-cart destination stay unchanged. */
export function removeCheckoutItem(key: string, items: readonly unknown[], removeItem: (key: string) => void, router: { push: (url: string) => void }) {
  removeItem(key);
  if (items.length === 1) router.push("/works");
}

export function CheckoutCartControls({ lineKey, cartLineCount, name, quantity, atStockLimit, onDecrease, onIncrease, onRemove, disabled }: {
  lineKey: string; cartLineCount: number; name: string; quantity: number; atStockLimit: boolean;
  onDecrease: () => void; onIncrease: () => void; onRemove: () => void; disabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const requestRemoval = () => { if (!disabled) dialog.current?.showModal(); };
  const confirmRemoval = () => {
    if (disabled || !dialog.current?.open) return;
    dialog.current.close();
    onRemove();
    // The removed trigger cannot receive focus; continue at the remaining summary when needed.
    window.requestAnimationFrame?.(() => {
      if (document.activeElement === document.body) {
        document.querySelector<HTMLButtonElement>("aside.checkout-summary button:not(:disabled)")?.focus();
      }
    });
  };
  return <>
    <div className="quantity-control">
      <button type="button" aria-label={`減少 ${name} 數量`} {...(disabled ? { disabled: true } : {})} onClick={() => quantity <= 1 ? requestRemoval() : onDecrease()}>−</button>
      <span>{quantity}</span>
      <button type="button" aria-label={`增加 ${name} 數量`} disabled={!!disabled || atStockLimit} title={atStockLimit ? "已達現貨庫存上限" : undefined} onClick={onIncrease}>＋</button>
    </div>
    <button type="button" className="cart-remove-button" {...(disabled ? { disabled: true } : {})} onClick={requestRemoval}>刪除此商品</button>
    <CheckoutModal dialogRef={dialog} id={"checkout-remove-" + encodeURIComponent(lineKey)} title="移除此商品？" actions={<>
      <button type="button" onClick={() => dialog.current?.close()}>保留商品</button>
      <button type="button" className={styles.primaryAction} onClick={confirmRemoval}>確認移除</button>
    </>}>
      {cartLineCount === 1 ? <>
        <p>這是訂單中的最後一項商品。</p>
        <p>移除後購物車將變成空的，您可以再回到作品區或商店重新選購。</p>
      </> : <>
        <p>這項商品將從您的訂單中移除。</p>
        <p>確認後，訂單金額與相關優惠將依目前購物車內容重新計算。</p>
      </>}
    </CheckoutModal>
  </>;
}
