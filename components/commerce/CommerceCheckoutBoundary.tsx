"use client";

import Link from "next/link";
import { useCart } from "./CartProvider";
import { checkoutEligibilityMessage } from "@/lib/commerceCart";

export function CartRecoveryNotice() {
  const { migrationState, retryMigration, unresolved, discardUnresolved, notices, persistenceWarning } = useCart();
  return <>
    {migrationState === "PENDING" ? <p role="status">購物車資料正在更新，請稍候。</p> : null}
    {migrationState === "FAILED" ? <section role="alert">
      <p>購物車資料正在更新，暫時無法完成載入。</p>
      <button type="button" onClick={() => void retryMigration()}>重試</button>
    </section> : null}
    {unresolved.length ? <section role="alert">
      <p>部分舊購物項目已無法辨識，需要重新選購。</p>
      <button type="button" onClick={discardUnresolved}>移除無法辨識的項目</button>
    </section> : null}
    {notices.length ? <p role="status">部分商品價格已更新，購物車已套用目前價格。</p> : null}
    {persistenceWarning ? <section role="alert">
      <p>購物車尚未成功儲存，目前資料保留於此頁；請重試後再結帳。</p>
      <button type="button" onClick={() => void retryMigration()}>重試儲存</button>
    </section> : null}
  </>;
}
/** Block before mounting coffee checkout hooks/effects/submit handlers. */
export default function CommerceCheckoutBoundary({ children }: { children: React.ReactNode }) {
  const { checkoutEligibility } = useCart();
  if (checkoutEligibility === "ELIGIBLE") return <>{children}</>;
  return <main className="commerce-page">
    <header className="commerce-topbar"><Link href="/">KD COFFEE</Link><span>結帳</span><Link href="/cart">返回購物車</Link></header>
    <section className="commerce-shell">
      <h1>{checkoutEligibility === "EMPTY" ? "購物車目前是空的" : "請先確認購物車"}</h1>
      <p role={checkoutEligibility === "MIGRATION_PENDING" ? "status" : "alert"}>{checkoutEligibilityMessage(checkoutEligibility)}</p>
      <CartRecoveryNotice />
      <Link href="/cart">返回購物車</Link>
      {checkoutEligibility === "EMPTY" ? <p><Link href="/works">選購咖啡</Link> · <Link href="/store">逛逛商店</Link></p> : null}
    </section>
  </main>;
}
