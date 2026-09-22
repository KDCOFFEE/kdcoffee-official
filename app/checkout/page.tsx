"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cartItemKey, cartSkuKey, useCart } from "@/components/commerce/CartProvider";
import StoreSelector from "@/components/commerce/StoreSelector";
import {
  addDateOnlyDays,
  getDateOnlyInTimeZone,
  isDateOnlyOnOrAfter,
  isValidDateOnly,
} from "@/lib/checkoutRules";
import { subscriptionShippingFee, subscriptionShippingSaving } from "@/lib/shippingRules";

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
  const {
    items,
    subtotal,
    clearCart,
    ready,
    updateQuantity,
    removeItem,
  } = useCart();
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
  const [subscriptionIntervalMode, setSubscriptionIntervalMode] = useState<"preset" | "custom">("preset");
  const [subscriptionStartDate, setSubscriptionStartDate] = useState("");
  const [operationalRules, setOperationalRules] = useState<{ pickup: { earliestStandardDate: string; earliestCustomRoastDate: string; blockedDates: string[] }; shipping: { subscriptionFreeShipping: boolean; subscriptionShippingFee: number; sevenElevenShippingFee: number; homeDeliveryShippingFee: number; subscriptionShippingDiscount: number }; money: { roundingMode: string }; subscription: { discountPercent: number; intervalsDays: number[]; customCycleEnabled: boolean; customCycleMinDays: number; customCycleMaxDays: number; earliestDate: string }; credit: { uiMode: "amount-and-maximum" | "use-or-not" | "automatic-maximum" | "custom-amount"; showAmountInput: boolean; showMaximumButton: boolean; automaticallyUseMaximum: boolean; allowZeroTotal: boolean; appliesToShipping: boolean } } | null>(null);
  const [creditQuote, setCreditQuote] = useState<{ availableBalance: number; maximumUsable: number; minimumPayable: number } | null>(null);
  const [requestedCredit, setRequestedCredit] = useState(0);
  const [useCredit, setUseCredit] = useState(false);
  const shipping = mode === "711_cod" && subtotal < 1500 ? 60 : 0;
  const today = getDateOnlyInTimeZone(new Date());
  const hasCustomRoast = items.some(item => item.customRoast);
  const earliestPickupDate = operationalRules ? (hasCustomRoast ? operationalRules.pickup.earliestCustomRoastDate : operationalRules.pickup.earliestStandardDate) : addDateOnlyDays(today, hasCustomRoast ? 3 : 0);

  const subscriptionDiscountPercent =
    operationalRules?.subscription.discountPercent ?? null;

  const subscriptionDiscountLabel =
    subscriptionDiscountPercent == null
      ? "目前定期購優惠"
      : subscriptionDiscountPercent >= 100
        ? "目前定期購價格"
        : subscriptionDiscountPercent % 10 === 0
          ? `${subscriptionDiscountPercent / 10} 折`
          : `${subscriptionDiscountPercent} 折`;

  function applyConfiguredPercentage(
    amount: number,
    percent: number,
  ) {
    const numerator = amount * percent;

    if (numerator % 100 === 0) {
      return numerator / 100;
    }

    const roundingMode =
      operationalRules?.money.roundingMode;

    if (roundingMode === "round-down") {
      return Math.floor(numerator / 100);
    }

    if (roundingMode === "round-up") {
      return Math.ceil(numerator / 100);
    }

    return Math.floor((numerator + 50) / 100);
  }

  const subscriptionRenewalProductTotal =
    subscriptionDiscountPercent == null
      ? subtotal
      : applyConfiguredPercentage(
          subtotal,
          subscriptionDiscountPercent,
        );

  const subscriptionProductSavings =
    Math.max(
      0,
      subtotal - subscriptionRenewalProductTotal,
    );

  const subscriptionRenewalShipping = operationalRules
    ? subscriptionShippingFee(mode, operationalRules)
    : 0;

  const subscriptionShippingSavings = operationalRules
    ? subscriptionShippingSaving(mode, operationalRules)
    : 0;

  const subscriptionRenewalTotal =
    subscriptionRenewalProductTotal +
    subscriptionRenewalShipping;

  const subscriptionTotalSavings =
    subscriptionProductSavings +
    subscriptionShippingSavings;

  useEffect(()=>{
    fetch("/api/member/me",{cache:"no-store"}).then(r=>r.json()).then(({member})=>{
      if(member){ setMember(member); setName(member.pickupName||member.displayName||""); setPhone(member.phone||""); setEmail(member.email||""); }
    }).finally(()=>setMemberLoaded(true));
  },[]);
  useEffect(() => {
    fetch("/api/commerce/operational-rules", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((result) => {
      if (!result) return;
      setOperationalRules(result);
      if (
        Array.isArray(result.subscription?.intervalsDays) &&
        result.subscription.intervalsDays.length
      ) {
        const defaultInterval = result.subscription.intervalsDays.includes(30)
          ? 30
          : result.subscription.intervalsDays[0];
        setSubscriptionIntervalMode("preset");
        setSubscriptionInterval(defaultInterval);
      }
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!member) return;
    fetch(`/api/member/credit/quote?subtotal=${subtotal}&shipping=${shipping}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((quote) => {
      if (!quote) return;
      setCreditQuote(quote);
      setRequestedCredit((current) => operationalRules?.credit.automaticallyUseMaximum ? quote.maximumUsable : Math.min(current, quote.maximumUsable));
      if (operationalRules?.credit.automaticallyUseMaximum) setUseCredit(quote.maximumUsable > 0);
    }).catch(() => undefined);
  }, [member, operationalRules?.credit.automaticallyUseMaximum, shipping, subtotal]);

  function requestCheckoutItemRemoval(key: string) {
    if (items.length === 1) {
      const confirmed = window.confirm(
        "這是訂單最後一項商品。\n\n移除後購物車會變成空的，並返回作品區重新選購。\n\n確定要移除嗎？",
      );

      if (!confirmed) {
        return;
      }

      removeItem(key);
      router.push("/works");
      return;
    }

    removeItem(key);
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setWarning("");
    if (!items.length) return setError("購物車沒有商品。");
    const form = new FormData(event.currentTarget);
    if (mode === "studio_pickup") {
      const pickupDate = String(form.get("pickupDate") || "");
      if (!pickupDate) return setError("請選擇工作室自取日期。");
      if (!isValidDateOnly(pickupDate)) return setError("工作室自取日期不正確。");
      if (!isDateOnlyOnOrAfter(pickupDate, earliestPickupDate)) return setError(hasCustomRoast ? `訂單含專屬烘焙，最早可選 ${earliestPickupDate} 取貨。` : "工作室自取日期不可早於今天。");
      if (operationalRules?.pickup.blockedDates.includes(pickupDate)) return setError("這一天工作室暫停自取，請選擇其他日期。");
    }
    setSubmitting(true);
    try {
      const idempotencyKey = getOrCreateIdempotencyKey();
      const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        idempotencyKey,
        orderMode: mode,
        customer: { name, phone, email, note: form.get("note") },
        store: mode === "711_cod" ? { id: form.get("storeId"), name: form.get("storeName"), address: form.get("storeAddress") } : null,
        studioPickup: mode === "studio_pickup" ? { preferredDate: form.get("pickupDate") } : null,
        corporateGift: null,
        subscriptionIntent: member && joinSubscription ? { consent: true, intervalDays: subscriptionInterval, firstRenewalDate: subscriptionStartDate } : null,
        requestedCredit: member ? requestedCredit : 0,
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
          {mode === "studio_pickup" && <section className="form-card"><div className="form-card-head"><span>03</span><h2>工作室自取</h2></div><div className="delivery-notice"><strong>KD Coffee 咖啡藝術工坊自取</strong><p>{hasCustomRoast ? `本訂單含專屬烘焙，需預留製作時間，最早可於 ${earliestPickupDate} 取貨。` : `最早可於 ${earliestPickupDate} 取貨。請選擇希望日期，工作室確認後會通知你。`}</p></div><div className="store-selector-grid"><label>希望取貨日期<input type="date" name="pickupDate" min={earliestPickupDate} value={pickupDate} onChange={event=>setPickupDate(event.target.value)} required /><span className="field-help">第一版只需選日期，不需要選上午／下午時段。</span></label></div></section>}
          {member && creditQuote && creditQuote.availableBalance > 0 && <section className="form-card"><div className="form-card-head"><span>04</span><h2>會員抵用金</h2></div><div className="delivery-notice"><strong>目前可用 NT$ {creditQuote.availableBalance.toLocaleString("zh-TW")}</strong><p>本次最多可折 NT$ {creditQuote.maximumUsable.toLocaleString("zh-TW")}；系統會優先使用較早到期的額度。</p></div>{operationalRules?.credit.uiMode === "use-or-not" ? <label className="terms-check"><input type="checkbox" checked={useCredit} onChange={(event) => { setUseCredit(event.target.checked); setRequestedCredit(event.target.checked ? creditQuote.maximumUsable : 0); }} />使用本次可折抵的最高金額</label> : operationalRules?.credit.uiMode === "automatic-maximum" ? <p className="member-notice">已自動套用最大折抵 NT$ {creditQuote.maximumUsable.toLocaleString("zh-TW")}</p> : <div className="subscription-enrollment-fields"><label>本次折抵金額<input type="number" min={0} max={creditQuote.maximumUsable} value={requestedCredit} onChange={(event) => setRequestedCredit(Math.min(creditQuote.maximumUsable, Math.max(0, Number(event.target.value) || 0)))} /></label>{operationalRules?.credit.showMaximumButton && <button type="button" onClick={() => setRequestedCredit(creditQuote.maximumUsable)}>最大折抵</button>}</div>}<div className="subscription-enrollment-summary"><span>折抵後預計應付 NT$ {Math.max(0, subtotal + shipping - requestedCredit).toLocaleString("zh-TW")}</span></div></section>}
          <section className="form-card"><div className="form-card-head"><span>04</span><h2>備註</h2></div><label>其他說明 <small>選填</small><textarea name="note" maxLength={300} rows={4} placeholder="有需要我們特別注意的事項，請寫在這裡" /></label></section>
          {member && joinSubscription && operationalRules?.subscription.customCycleEnabled && <button type="button" className="text-link" onClick={() => { setSubscriptionIntervalMode("custom"); setSubscriptionInterval(operationalRules.subscription.customCycleMinDays); }}>改用自訂配送週期</button>}
          {member && <section className="form-card subscription-enrollment-card">
            <div className="form-card-head">
              <span>05</span>
              <h2>從這次開始定期配送</h2>
            </div>

            <div className="delivery-notice">
              <strong>
                首筆取貨成功後才開始定期配送
              </strong>
              <p>
                第一次續訂起享
                <b> {subscriptionDiscountLabel}</b>
                ；之後可在會員中心調整或隨時停止後續定期配送。
              </p>
            </div>

            <label className="terms-check">
              <input
                type="checkbox"
                checked={joinSubscription}
                onChange={(event) =>
                  setJoinSubscription(event.target.checked)
                }
              />
              我想在這筆訂單成功取貨後，開始定期配送
            </label>

            {joinSubscription && <div className="subscription-enrollment-fields"><label>配送週期<select
  value={subscriptionIntervalMode === "custom" ? "custom" : subscriptionInterval}
  onChange={(event) => {
    if (event.target.value === "custom") {
      setSubscriptionIntervalMode("custom");
      setSubscriptionInterval(
        operationalRules?.subscription.customCycleMinDays ?? 20
      );
      return;
    }
    setSubscriptionIntervalMode("preset");
    setSubscriptionInterval(Number(event.target.value));
  }}
>{(operationalRules?.subscription.intervalsDays ?? [30,45,60,75,90]).map((days) => <option value={days} key={days}>每 {days} 天</option>)}{operationalRules?.subscription.customCycleEnabled && <option value="custom">自訂天數</option>}</select></label>{operationalRules?.subscription.customCycleEnabled && subscriptionIntervalMode === "custom" && <label>自訂配送週期<input type="number" min={operationalRules.subscription.customCycleMinDays} max={operationalRules.subscription.customCycleMaxDays} value={subscriptionInterval} onChange={(event) => setSubscriptionInterval(Number(event.target.value))} /><small>可設定 {operationalRules.subscription.customCycleMinDays}～{operationalRules.subscription.customCycleMaxDays} 天；伺服器會再次驗證。</small></label>}<label>希望第一次續訂日期<input type="date" value={subscriptionStartDate} min={operationalRules?.subscription.earliestDate ?? addDateOnlyDays(today, 3)} onChange={(event) => setSubscriptionStartDate(event.target.value)} required={joinSubscription} /></label><div className="subscription-enrollment-summary">
  <strong>定期配送設定</strong>

  <span>
    每 {subscriptionInterval} 天配送一次
  </span>

  <span>
    本次訂單仍以一般價格結帳；
    成功取貨後才開始定期配送
  </span>
</div>

<div className="subscription-renewal-preview">
  <header>
    <div>
      <small>NEXT RENEWAL</small>
      <strong>下次續訂預估</strong>
    </div>

    <b>
      NT$ {subscriptionRenewalTotal.toLocaleString("zh-TW")}
    </b>
  </header>

  <div className="subscription-renewal-row">
    <span>同樣商品原價</span>
    <strong>
      NT$ {subtotal.toLocaleString("zh-TW")}
    </strong>
  </div>

  <div className="subscription-renewal-row saving">
    <span>定期購 {subscriptionDiscountLabel}</span>
    <strong>
      − NT$ {subscriptionProductSavings.toLocaleString("zh-TW")}
    </strong>
  </div>

  {mode === "711_cod" &&
    operationalRules &&
    subscriptionRenewalShipping === 0 &&
    subscriptionShippingSavings > 0 && (
      <div className="subscription-renewal-row saving">
        <span>定期配送運費</span>
        <strong>
          免運・再省 NT$ {subscriptionShippingSavings.toLocaleString("zh-TW")}
        </strong>
      </div>
    )}

  {mode === "711_cod" &&
    operationalRules &&
    subscriptionRenewalShipping > 0 && (
      <div className="subscription-renewal-row">
        <span>定期配送運費</span>
        <strong>
          NT$ {subscriptionRenewalShipping.toLocaleString("zh-TW")}
        </strong>
      </div>
    )}

  {mode === "711_cod" && subscriptionRenewalShipping > 0 && subscriptionShippingSavings > 0 && (
    <div className="subscription-renewal-row saving">
      <span>定期配送運費優惠</span>
      <strong>− NT$ {subscriptionShippingSavings.toLocaleString("zh-TW")}</strong>
    </div>
  )}

  <footer>
    <span>依目前設定，每期預估優惠</span>
    <strong>
      省 NT$ {subscriptionTotalSavings.toLocaleString("zh-TW")}
    </strong>
  </footer>

  <small className="subscription-renewal-note">
    依目前商品內容與後台定期購設定試算；
    實際金額以續訂訂單建立時的商品、活動與營運規則為準。
  </small>
</div></div>}</section>}
          <label className="terms-check"><input type="checkbox" required />我已確認聯絡資料正確，並同意 KD Coffee 為處理本次訂購而聯絡我。</label>
          {error && <p className="form-error">{error}</p>}{warning && <p className="form-error">{warning}</p>}
        </div>
        <aside className="checkout-summary">
          <h2>訂單摘要</h2>

          {items.map((item) => {
            const key = cartItemKey(item);

            const stockLimit =
              typeof item.stock === "number" &&
              Number.isInteger(item.stock) &&
              item.stock >= 0
                ? item.stock
                : undefined;

            const skuQuantity = items.reduce(
              (sum, entry) =>
                sum +
                (cartSkuKey(entry) === cartSkuKey(item)
                  ? entry.quantity
                  : 0),
              0,
            );

            const atStockLimit =
              stockLimit !== undefined &&
              skuQuantity >= stockLimit;

            return (
              <div className="summary-item" key={key}>
                <span>
                  {item.name}

                  <small>
                    {item.optionLabel}
                    {item.preparationLabel
                      ? ` · ${item.preparationLabel}`
                      : ""}
                  </small>

                  {item.customRoast ? (
                    <div className="summary-custom-roast">
                      <strong>
                        專屬烘焙｜
                        {item.roastLevel || "待確認"}
                      </strong>
                      {item.roastNote ? (
                        <em>{item.roastNote}</em>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="quantity-control">
                    <button
                      type="button"
                      aria-label={`減少 ${item.name} 數量`}
                      onClick={() =>
                        item.quantity <= 1
                          ? requestCheckoutItemRemoval(key)
                          : updateQuantity(
                              key,
                              item.quantity - 1,
                            )
                      }
                    >
                      −
                    </button>

                    <span>{item.quantity}</span>

                    <button
                      type="button"
                      aria-label={`增加 ${item.name} 數量`}
                      disabled={atStockLimit}
                      title={
                        atStockLimit
                          ? "已達現貨庫存上限"
                          : undefined
                      }
                      onClick={() =>
                        updateQuantity(
                          key,
                          item.quantity + 1,
                        )
                      }
                    >
                      ＋
                    </button>
                  </div>

                  <button
                    type="button"
                    className="cart-remove-button"
                    onClick={() =>
                      requestCheckoutItemRemoval(key)
                    }
                  >
                    刪除此商品
                  </button>
                </span>

                <b>
                  NT$ {(item.unitPrice * item.quantity)
                    .toLocaleString("zh-TW")}
                </b>
              </div>
            );
          })}<div className="summary-line"><span>商品小計</span><b>NT$ {subtotal.toLocaleString("zh-TW")}</b></div><div className="summary-line"><span>{mode === "studio_pickup" ? "工作室自取" : "7-ELEVEN 運費"}</span><b>{shipping ? `NT$ ${shipping}` : "免運"}</b></div>{requestedCredit > 0 && <div className="summary-line"><span>會員抵用金</span><b>- NT$ {requestedCredit.toLocaleString("zh-TW")}</b></div>}<div className="summary-total"><span>{mode === "studio_pickup" ? "訂單總額" : "取貨付款總額"}</span><strong>NT$ {Math.max(0, subtotal + shipping - requestedCredit).toLocaleString("zh-TW")}</strong></div><button type="submit" disabled={submitting||!ready||!items.length}>{submitting?"資料傳送中…":"確認並傳送訂單"}</button><p>系統會先保存訂單，再傳送至 KD Coffee 的 LINE 訂單群組。</p></aside>
      </form>
    </section>
  </main>;
}
