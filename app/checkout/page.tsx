"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/commerce/CartProvider";
import StoreSelector from "@/components/commerce/StoreSelector";
import {
  addDateOnlyDays,
  getDateOnlyInTimeZone,
  isDateOnlyOnOrAfter,
  isValidDateOnly,
  PICKUP_TIMES,
} from "@/lib/checkoutRules";

type OrderMode = "711_cod" | "studio_pickup";
type Member = { displayName:string; pickupName?:string; phone?:string; email?:string; favoriteStore?:{id:string;name:string;address:string;city?:string;district?:string} };
const IDEMPOTENCY_STORAGE_KEY = "kdcoffee-checkout-idempotency-key";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getOrCreateIdempotencyKey() {
  const existing = sessionStorage.getItem(IDEMPOTENCY_STORAGE_KEY);
  if (existing && UUID_PATTERN.test(existing)) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(IDEMPOTENCY_STORAGE_KEY, created);
  return created;
}

export default function CheckoutPage() {
  const { items, subtotal, clearCart, ready } = useCart();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [mode, setMode] = useState<OrderMode>("711_cod");
  const [member, setMember] = useState<Member|null>(null);
  const [memberLoaded, setMemberLoaded] = useState(false);
  const [name,setName]=useState(""); const [phone,setPhone]=useState(""); const [email,setEmail]=useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [joinSubscription, setJoinSubscription] = useState(false);
  const [subscriptionInterval, setSubscriptionInterval] = useState(30);
  const [subscriptionStartDate, setSubscriptionStartDate] = useState("");
  const shipping = mode === "711_cod" && subtotal < 1500 ? 60 : 0;
  const today = getDateOnlyInTimeZone(new Date());
  const hasCustomRoast = items.some(item => item.customRoast);
  const earliestPickupDate = addDateOnlyDays(today, hasCustomRoast ? 3 : 0);

  useEffect(()=>{
    fetch("/api/member/me",{cache:"no-store"}).then(r=>r.json()).then(({member})=>{
      if(member){ setMember(member); setName(member.pickupName||member.displayName||""); setPhone(member.phone||""); setEmail(member.email||""); }
    }).finally(()=>setMemberLoaded(true));
  },[]);

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setWarning("");
    if (!items.length) return setError("購物車沒有商品。");
    const form = new FormData(event.currentTarget);
    if (mode === "studio_pickup") {
      const pickupDate = String(form.get("pickupDate") || "");
      const pickupTime = String(form.get("pickupTime") || "");
      if (!pickupDate) return setError("請選擇工作室自取日期。");
      if (!isValidDateOnly(pickupDate)) return setError("工作室自取日期不正確。");
      if (!isDateOnlyOnOrAfter(pickupDate, earliestPickupDate)) return setError(hasCustomRoast ? `訂單含專屬烘焙，最早可選 ${earliestPickupDate} 取貨。` : "工作室自取日期不可早於今天。");
      if (!(PICKUP_TIMES as readonly string[]).includes(pickupTime)) return setError("請選擇下午 2:00 至晚上 8:00 的取貨時間。");
    }
    setSubmitting(true);
    try {
      const idempotencyKey = getOrCreateIdempotencyKey();
      const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        idempotencyKey,
        orderMode: mode,
        customer: { name, phone, email, note: form.get("note") },
        store: mode === "711_cod" ? { id: form.get("storeId"), name: form.get("storeName"), address: form.get("storeAddress") } : null,
        studioPickup: mode === "studio_pickup" ? { preferredDate: form.get("pickupDate"), preferredTime: form.get("pickupTime") } : null,
        corporateGift: null,
        subscriptionIntent: member && joinSubscription ? { consent: true, intervalDays: subscriptionInterval, firstRenewalDate: subscriptionStartDate } : null,
        items: items.map(({ slug, optionId, optionLabel, unitPrice, preparationLabel, customRoast, roastLevel, roastNote, quantity }) => ({ slug, optionId, optionLabel, quotedUnitPrice: unitPrice, preparationLabel, customRoast, roastLevel, roastNote, quantity })),
      }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "訂單送出失敗");
      if (result.orderNumber && result.orderAccessToken) {
        sessionStorage.setItem(
          `kdcoffee-order-access:${result.orderNumber}`,
          result.orderAccessToken,
        );
      }
      if (response.status === 202) {
        setWarning(result.warning || "訂單正在確認中，請保留本頁並使用相同內容重試；系統不會重複扣庫存。");
        return;
      }
      if(result.warning) setWarning(result.warning);
      const orderAccessToken = result.orderAccessToken || (
        result.orderNumber
          ? sessionStorage.getItem(`kdcoffee-order-access:${result.orderNumber}`)
          : ""
      );
      sessionStorage.removeItem(IDEMPOTENCY_STORAGE_KEY);
      clearCart(); sessionStorage.setItem("kdcoffee-last-order", JSON.stringify(result));
      router.push(`/order-complete?order=${encodeURIComponent(result.orderNumber)}&line=${result.lineNotification?.sent?"sent":"pending"}&mode=${mode}${orderAccessToken ? `#token=${encodeURIComponent(orderAccessToken)}` : ""}`);
    } catch (e) { setError(e instanceof Error ? e.message : "訂單送出失敗"); }
    finally { setSubmitting(false); }
  }

  return <main className="commerce-page">
    <header className="commerce-topbar"><Link href="/">KD COFFEE</Link><span>結帳</span><Link href="/cart">返回購物車</Link></header>
    <section className="checkout-shell">
      <div className="commerce-title"><p className="eyebrow dark">CHECKOUT</p><h1>選擇最方便的取貨方式</h1><p>一般訂購可選 7-ELEVEN 取貨付款或到 KD Coffee 工作室自取。</p></div>
      <form className="checkout-grid" onSubmit={submitOrder}>
        <div className="checkout-form">
          <section className="form-card">
            <div className="form-card-head"><span>01</span><h2>聯絡人資料</h2></div>
            {memberLoaded && (member ? (
              <div className="delivery-notice checkout-member-notice">
                <strong>已登入會員：{member.displayName || "KD Coffee 會員"}</strong>
                <p>已自動帶入常用聯絡資料與門市；本次修改後會同步更新會員資料。</p>
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
            ))}
            <label>姓名<input name="name" value={name} onChange={e=>setName(e.target.value)} required maxLength={20} autoComplete="name" placeholder="請填寫真實姓名" /></label>
            <label>手機號碼<input name="phone" value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,"").slice(0,10))} required inputMode="tel" pattern="09[0-9]{8}" autoComplete="tel" placeholder="例如 0912345678" /></label>
            <label>Email <small>選填</small><input name="email" value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="email" placeholder="name@example.com" /><span className="field-help">用於訂單相關通知</span></label>
          </section>
          <section className="form-card"><div className="form-card-head"><span>02</span><h2>取貨方式</h2></div><div className="delivery-mode-grid">
            <label className={mode === "711_cod" ? "delivery-mode active" : "delivery-mode"}><input type="radio" name="orderMode" value="711_cod" checked={mode === "711_cod"} onChange={()=>setMode("711_cod")} /><b>7-ELEVEN 取貨付款</b><span>商品到店後再付款取貨</span></label>
            <label className={mode === "studio_pickup" ? "delivery-mode active" : "delivery-mode"}><input type="radio" name="orderMode" value="studio_pickup" checked={mode === "studio_pickup"} onChange={()=>setMode("studio_pickup")} /><b>到工作室取貨</b><span>免運費，由工作室確認取貨時間</span></label>
          </div></section>
          {mode === "711_cod" && <section className="form-card"><div className="form-card-head"><span>03</span><h2>7-ELEVEN 取貨門市</h2></div><div className="delivery-notice"><strong>門市取貨付款</strong><p>選到行政區後會顯示該區所有門市，也可用路名、店名、地址或店號搜尋。</p></div><StoreSelector initialStore={member?.favoriteStore} /></section>}
          {mode === "studio_pickup" && <section className="form-card"><div className="form-card-head"><span>03</span><h2>工作室自取</h2></div><div className="delivery-notice"><strong>KD Coffee 咖啡藝術工坊自取</strong><p>自取時間為下午 2:00 至晚上 8:00。{hasCustomRoast ? `本訂單含專屬烘焙，需預留製作時間，最早可於 ${earliestPickupDate} 取貨。` : "請選擇日期與時段，送出後工作室仍會再與你確認。"}</p></div><div className="store-selector-grid"><label>希望取貨日期<input type="date" name="pickupDate" min={earliestPickupDate} value={pickupDate} onChange={event=>setPickupDate(event.target.value)} required /></label><label>希望取貨時間<select name="pickupTime" required defaultValue=""><option value="" disabled>請選擇時間</option>{PICKUP_TIMES.map(time=><option value={time} key={time}>{time}</option>)}</select></label></div></section>}
          <section className="form-card"><div className="form-card-head"><span>04</span><h2>備註</h2></div><label>其他說明 <small>選填</small><textarea name="note" maxLength={300} rows={4} placeholder="有需要我們特別注意的事項，請寫在這裡" /></label></section>
          {member && <section className="form-card subscription-enrollment-card"><div className="form-card-head"><span>05</span><h2>從這次開始定期配送</h2></div><label className="terms-check"><input type="checkbox" checked={joinSubscription} onChange={(event) => setJoinSubscription(event.target.checked)} />我想在這筆訂單成功取貨後，開始定期配送</label>{joinSubscription && <div className="subscription-enrollment-fields"><div className="delivery-notice"><strong>這筆仍以一般原價購買</strong><p>成功取貨後才啟動；第一次續訂起享定期價格。開啟或返回此頁都不會自動建立訂單。</p></div><label>配送週期<select value={subscriptionInterval} onChange={(event) => setSubscriptionInterval(Number(event.target.value))}><option value={30}>每 30 天</option><option value={45}>每 45 天</option><option value={60}>每 60 天</option></select></label><label>希望第一次續訂日期<input type="date" value={subscriptionStartDate} min={addDateOnlyDays(today, 7)} onChange={(event) => setSubscriptionStartDate(event.target.value)} required={joinSubscription} /></label><div className="subscription-enrollment-summary"><strong>加入內容確認</strong><span>{items.length} 組作品・每 {subscriptionInterval} 天</span><span>首筆原價 {`NT$ ${subtotal.toLocaleString("zh-TW")}`}；取貨成功後才生效</span></div></div>}</section>}
          <label className="terms-check"><input type="checkbox" required />我已確認聯絡資料正確，並同意 KD Coffee 為處理本次訂購而聯絡我。</label>
          {error && <p className="form-error">{error}</p>}{warning && <p className="form-error">{warning}</p>}
        </div>
        <aside className="checkout-summary"><h2>訂單摘要</h2>{items.map(item=><div className="summary-item" key={`${item.slug}-${item.optionLabel}-${item.roastLevel || "standard"}`}><span>{item.name}<small>{item.optionLabel}{item.preparationLabel ? ` · ${item.preparationLabel}` : ""} × {item.quantity}</small>{item.customRoast ? <div className="summary-custom-roast"><strong>專屬烘焙｜{item.roastLevel || "待確認"}</strong>{item.roastNote ? <em>{item.roastNote}</em> : null}</div> : null}</span><b>NT$ {(item.unitPrice*item.quantity).toLocaleString("zh-TW")}</b></div>)}<div className="summary-line"><span>商品小計</span><b>NT$ {subtotal.toLocaleString("zh-TW")}</b></div><div className="summary-line"><span>{mode === "studio_pickup" ? "工作室自取" : "7-ELEVEN 運費"}</span><b>{shipping ? `NT$ ${shipping}` : "免運"}</b></div><div className="summary-total"><span>{mode === "studio_pickup" ? "訂單總額" : "取貨付款總額"}</span><strong>NT$ {(subtotal+shipping).toLocaleString("zh-TW")}</strong></div><button type="submit" disabled={submitting||!ready||!items.length}>{submitting?"資料傳送中…":"確認並傳送訂單"}</button><p>系統會先保存訂單，再傳送至 KD Coffee 的 LINE 訂單群組。</p></aside>
      </form>
    </section>
  </main>;
}
