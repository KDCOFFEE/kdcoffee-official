"use client";

import { CheckoutShell, CheckoutContactNotice, CheckoutDeliveryOptions, CheckoutSummary, CheckoutCartControls, removeCheckoutItem, CheckoutModal } from "./CheckoutPresentation";
import styles from "./CheckoutPresentation.module.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCart } from "./CartProvider";
import StoreSelector from "./StoreSelector";
import AtmTransferInfoDialog from "@/components/orders/AtmTransferInfoDialog";
import { cartSpecification, cartLineKey, cartInventoryDemand, cartInventoryLimit } from "@/lib/commerceCart";
import { readCartStorage } from "@/lib/commerceCartStorage";
import { generalCheckoutShipping } from "@/lib/checkoutShipping";
import { getDateOnlyInTimeZone, isDateOnlyOnOrAfter, isValidDateOnly } from "@/lib/checkoutRules";
import type { DeliveryAddress } from "@/lib/deliveryAddress";
import {
  buildProtocolV1Body, createProtocolV1CheckoutClient, getProtocolV1AttemptKey,
  readProtocolV1Attempt, readBoundedCheckoutJson, validateProtocolV1Auth, validateProtocolV1Rules,
  type V1Attempt, type V1Auth, type V1Customer, type V1Mode, type V1OperationalRules, type V1Result,
} from "@/lib/publicCommerceCheckoutClient";

const addressFields = [
  ["recipientName", "收件人姓名", 40], ["phone", "聯絡電話", 20], ["postalCode", "郵遞區號", 6],
  ["city", "縣市", 20], ["district", "區／鄉鎮市", 30], ["addressLine", "詳細地址", 120],
] as const;
const money = (amount: number) => "NT$ " + amount.toLocaleString("zh-TW");

export default function ProtocolV1Checkout() {
  const { items, getProtocolV1CheckoutItems, clearCart, recoverableProtocolV1Attempt, updateQuantity, removeItem } = useCart();
  const router = useRouter();
  const client = useRef<ReturnType<typeof createProtocolV1CheckoutClient> | null>(null);
  const busy = useRef(false);
  const storeSubscriptionDialog = useRef<HTMLDialogElement>(null);
  const [attempt, setAttempt] = useState<V1Attempt | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [auth, setAuth] = useState<V1Auth>({ kind: "LOADING" });
  const [rules, setRules] = useState<V1OperationalRules | null>(null);
  const [rulesError, setRulesError] = useState(false);
  const [lookup, setLookup] = useState(0);
  const [customer, setCustomer] = useState<V1Customer>({ name: "", phone: "", email: "", note: "" });
  const [mode, setMode] = useState<V1Mode>("711_cod");
  const [pickupDate, setPickupDate] = useState("");
  const [address, setAddress] = useState<DeliveryAddress>({ recipientName: "", phone: "", postalCode: "", city: "", district: "", addressLine: "" });
  const [payment, setPayment] = useState<"cash_on_delivery" | "atm_transfer">("cash_on_delivery");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<V1Result | null>(null);
  const [completion, setCompletion] = useState<{ url: string; cleanupComplete: boolean } | null>(null);

  useEffect(() => {
    try {
      const existing = readProtocolV1Attempt(window.sessionStorage);
      setAttempt(existing);
      if (!client.current) client.current = createProtocolV1CheckoutClient(window.sessionStorage);
    } catch { setStorageError(true); }
  }, [recoverableProtocolV1Attempt]);

  useEffect(() => {
    if (recoverableProtocolV1Attempt) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let remaining = 2;
    const finishLookup = () => { if (--remaining === 0) clearTimeout(timer); };
    setAuth({ kind: "LOADING" }); setRules(null); setRulesError(false);
    void (async () => {
      try {
        const response = await fetch("/api/member/me", { cache: "no-store", signal: controller.signal });
        const next = response.ok ? validateProtocolV1Auth(await readBoundedCheckoutJson(response)) : { kind: "ERROR" as const };
        if (controller.signal.aborted) return;
        setAuth(next);
        if (next.kind === "MEMBER") {
          const member = next.member;
          setCustomer(current => ({ ...current, name: current.name || (member.pickupName || member.displayName).slice(0, 20),
            phone: current.phone || member.phone || "", email: current.email || member.email || "" }));
          setAddress(current => ({ ...current, recipientName: current.recipientName || (member.pickupName || member.displayName).slice(0, 40),
            phone: current.phone || member.phone || "" }));
        }
      } catch { if (!controller.signal.aborted) setAuth({ kind: "ERROR" }); }
      finally { finishLookup(); }
    })();
    void (async () => {
      try {
        const response = await fetch("/api/commerce/operational-rules", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const next = validateProtocolV1Rules(await readBoundedCheckoutJson(response));
        if (!controller.signal.aborted) setRules(next);
      } catch { if (!controller.signal.aborted) setRulesError(true); }
      finally { finishLookup(); }
    })();
    const markTimeout = () => { setAuth(current => current.kind === "LOADING" ? { kind: "ERROR" } : current); setRulesError(true); };
    controller.signal.addEventListener("abort", markTimeout, { once: true });
    return () => { clearTimeout(timer); controller.signal.removeEventListener("abort", markTimeout); controller.abort(); };
  }, [recoverableProtocolV1Attempt, lookup]);

  const customRoast = items.some(item => item.domain === "coffee" && item.coffeeOptions.customRoast);
  const earliest = rules ? (customRoast ? rules.pickup.earliestCustomRoastDate : rules.pickup.earliestStandardDate) : "";
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const shipping = rules ? generalCheckoutShipping({ mode, subtotal, homeDeliveryShippingFee: rules.shipping.homeDeliveryShippingFee,
    member: auth.kind === "MEMBER", date: getDateOnlyInTimeZone(new Date()), openingYearFreeShipping: rules.openingYearFreeShipping }) : 0;
  const codFee = mode === "home_delivery" && payment === "cash_on_delivery" ? rules?.shipping.homeDeliveryCodFee ?? 0 : 0;
  const canFreshSubmit = (auth.kind === "MEMBER" || auth.kind === "GUEST") && !!rules && !rulesError && !storageError;
  const terminal = result?.kind === "ERROR" && result.terminal;
  const frozen = !!attempt || recoverableProtocolV1Attempt;

  async function send(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (busy.current || completion || result?.kind === "FINALIZED" || terminal || storageError) return;
    busy.current = true; setSubmitting(true); setError("");
    try {
      if (!client.current) client.current = createProtocolV1CheckoutClient(window.sessionStorage);
      let existing = readProtocolV1Attempt(window.sessionStorage);
      let next: V1Result;
      if (existing) {
        if (!existing.meta.dispatchStarted && (!canFreshSubmit
          || existing.meta.kind !== (auth.kind === "MEMBER" ? "member" : "guest"))) {
          setError("請先確認登入狀態與此筆結帳資料。"); return;
        }
        next = await client.current.submit(); // Never rebuild a dispatched snapshot from current UI state.
      } else {
        if (!event || !canFreshSubmit || !rules) { setError("請先確認會員狀態與配送資訊。"); return; }
        const currentItems = getProtocolV1CheckoutItems();
        const form = new FormData(event.currentTarget);
        if (mode === "studio_pickup" && (!isValidDateOnly(pickupDate) || !isDateOnlyOnOrAfter(pickupDate, earliest)
          || rules.pickup.blockedDates.includes(pickupDate))) { setError("請選擇可用的工作室自取日期。"); return; }
        if (mode === "home_delivery" && payment === "atm_transfer" && !rules.payment.atmTransfer.configured) {
          setError("ATM 轉帳資訊尚未完整設定，請改用貨到付款或聯繫 KD Coffee。"); return;
        }
        const key = getProtocolV1AttemptKey(window.sessionStorage);
        const snapshot = buildProtocolV1Body(key, currentItems, {
          orderMode: mode, customer,
          ...(mode === "studio_pickup" ? { studioPickup: { preferredDate: pickupDate } } : {}),
          ...(mode === "711_cod" ? { store: { id: String(form.get("storeId") || ""), name: String(form.get("storeName") || ""), address: String(form.get("storeAddress") || "") } } : {}),
          ...(mode === "home_delivery" ? { deliveryAddress: address, paymentMethod: payment } : {}),
        });
        next = await client.current.submit({ body: snapshot, kind: auth.kind === "MEMBER" ? "member" : "guest" });
      }
      setResult(next);
      if (next.kind === "FINALIZED") {
        // Completion uses the client's in-memory attempt even if browser reads now fail.
        const done = client.current.complete(() => {
          clearCart();
          const persisted = readCartStorage(window.localStorage);
          if (persisted.kind !== "current" || persisted.envelope.items.length !== 0) throw new Error();
        }, url => router.push(url));
        setCompletion(done);
      } else {
        existing = readProtocolV1Attempt(window.sessionStorage);
        setAttempt(existing);
        if (next.kind === "ERROR") setError(next.message);
      }
    } catch {
      setError("結帳資料或瀏覽器儲存狀態需要確認。請保留本頁，勿重新建立訂單。");
      try { setAttempt(readProtocolV1Attempt(window.sessionStorage)); } catch { setStorageError(true); }
    } finally { busy.current = false; setSubmitting(false); }
  }


  return <CheckoutShell title={frozen ? "確認此筆結帳嘗試" : undefined} description={frozen ? null : undefined}>
      {result?.kind === "FINALIZED" ? <section className="form-card" role="status">
        <h2>訂單已成立</h2><p>訂單編號：{result.orderNumber}</p>
        {completion && !completion.cleanupComplete ? <p>訂單已成立，本機資料尚未完成整理；請直接前往訂單完成頁。</p> : null}
        {completion ? <button type="button" onClick={() => router.push(completion.url)}>前往訂單完成頁</button> : null}
      </section> : <>
        {storageError ? <p role="alert">此瀏覽器的結帳資料無法安全讀取，請保留本頁並聯絡 KD Coffee。</p> : null}
        {frozen ? <section className="form-card">
          <h2>保留原內容，確認同一筆嘗試</h2>
          <p>本機紀錄尚不代表訂單已成立。重試會沿用原始商品、配送資料與結帳識別。</p>
          {attempt ? <><p>{attempt.snapshot.customer.name} · {attempt.snapshot.orderMode === "studio_pickup" ? "工作室自取" : attempt.snapshot.orderMode === "711_cod" ? "7-ELEVEN 取貨付款" : "宅配"}</p>
            <ul>{attempt.snapshot.items.map((line, index) => <li key={index}>{line.domain === "store" ? "商店商品" : "咖啡"} × {line.quantity} · {money(line.quotedUnitPrice)}</li>)}</ul></> : null}
          {result?.kind === "PENDING" ? <p role="status">訂單仍在處理，請保留本頁並重試同一筆訂單。</p> : null}
          <button type="button" disabled={submitting || !!terminal || storageError || (!attempt?.meta.dispatchStarted && !canFreshSubmit)}
            onClick={() => void send()}>{submitting ? "確認中…" : "重試同一筆訂單"}</button>
          {terminal ? <p>此筆狀態需要人工確認，請聯絡 KD Coffee。</p> : null}
        </section> : <form className="checkout-grid" onSubmit={send}>
          <fieldset className={"checkout-form " + styles.fields} disabled={submitting || storageError}>
            <section className="form-card">
              <div className="form-card-head"><span>01</span><h2>聯絡人資料</h2></div>
              <CheckoutContactNotice member={auth.kind === "MEMBER" ? auth.member : null} memberLoaded={auth.kind === "MEMBER" || auth.kind === "GUEST"} memberMessage="已帶入會員常用資料，請確認本次收件資訊。" />
              {auth.kind === "LOADING" || auth.kind === "ERROR" ? <p role="status">{auth.kind === "LOADING" ? "正在確認登入狀態…" : "登入狀態暫時無法確認，請重試。"}</p> : null}
              <label>姓名<input name="name" value={customer.name} maxLength={20} autoComplete="name" placeholder="請填寫真實姓名" required onChange={e => setCustomer(c => ({ ...c, name: e.target.value }))} /></label>
              <label>手機號碼<input name="phone" inputMode="numeric" pattern="09[0-9]{8}" maxLength={10} autoComplete="tel" placeholder="例如 0912345678" value={customer.phone} required onChange={e => setCustomer(c => ({ ...c, phone: e.target.value }))} /></label>
              <label>Email <small>選填</small><input name="email" type="email" maxLength={120} autoComplete="email" placeholder="name@example.com" value={customer.email} onChange={e => setCustomer(c => ({ ...c, email: e.target.value }))} /><span className="field-help">用於訂單相關通知</span></label>
            </section>
            <CheckoutDeliveryOptions mode={mode} onChange={setMode} />
            {mode === "711_cod" ? <section className="form-card">
              <div className="form-card-head"><span>03</span><h2>7-ELEVEN 取貨門市</h2></div>
              <div className="delivery-notice"><strong>門市取貨付款</strong><p>選到行政區後會顯示該區所有門市，也可用路名、店名、地址或店號搜尋。</p></div>
              <StoreSelector initialStore={auth.kind === "MEMBER" ? auth.member.favoriteStore : undefined} />
            </section> : null}
            {mode === "studio_pickup" ? <section className="form-card">
              <div className="form-card-head"><span>03</span><h2>工作室自取</h2></div>
              <div className="delivery-notice"><strong>KD Coffee 咖啡藝術工坊自取</strong><p>{customRoast ? "本訂單含專屬烘焙，需預留製作時間，最早可於 " + (earliest || "確認可用日期後") + " 取貨。" : "最早可於 " + (earliest || "確認可用日期後") + " 取貨。請選擇希望日期，工作室確認後會通知你。"}</p></div>
              <div className="store-selector-grid"><label>希望取貨日期<input type="date" name="pickupDate" min={earliest || undefined} value={pickupDate} required onChange={e => setPickupDate(e.target.value)} /></label></div>
            </section> : null}
            {mode === "home_delivery" ? <section className="form-card">
              <div className="form-card-head"><span>03</span><h2>宅配地址與付款</h2></div>
              <div className="store-selector-grid">
                {addressFields.map(([key, label, maximum]) => <label key={key}>{label}<input name={key} maxLength={maximum} required value={address[key]} onChange={e => setAddress(current => ({ ...current, [key]: e.target.value }))} /></label>)}
              </div>
              <fieldset className="member-shipping-method-options">
                <legend>付款方式</legend>
                <label><input type="radio" name="homePaymentMethod" value="atm_transfer" checked={payment === "atm_transfer"} disabled={!rules?.payment.atmTransfer.configured} onChange={() => setPayment("atm_transfer")} />ATM 轉帳</label>
                <label><input type="radio" name="homePaymentMethod" value="cash_on_delivery" checked={payment === "cash_on_delivery"} onChange={() => setPayment("cash_on_delivery")} />貨到付款</label>
              </fieldset>
              {payment === "atm_transfer" && rules?.payment.atmTransfer.configured ? <AtmTransferInfoDialog data={{
                ...rules.payment.atmTransfer, showBankbookImage: rules.payment.atmTransfer.showBankbookImageAtCheckout,
              }} /> : payment === "cash_on_delivery" ? <p className="field-help">貨到付款手續費 {money(codFee)}</p> : null}
            </section> : null}
            <section className="form-card">
              <div className="form-card-head"><span>04</span><h2>備註</h2></div>
              <label>其他說明 <small>選填</small><textarea name="note" maxLength={200} rows={4} placeholder="有需要我們特別注意的事項，請寫在這裡" value={customer.note} onChange={e => setCustomer(c => ({ ...c, note: e.target.value }))} /></label>
            </section>
            {items.some(item => item.domain === "store") ? <section className="form-card subscription-enrollment-card">
              <div className="form-card-head"><span>05</span><h2>從這次開始定期配送</h2></div>
              <p className={styles.unavailable} role="status">此訂單無法使用定期配送</p>
              <button type="button" className={styles.infoAction} onClick={() => storeSubscriptionDialog.current?.showModal()}>了解原因</button>
              <CheckoutModal dialogRef={storeSubscriptionDialog} id="store-subscription" title="關於定期配送" actions={
                <button type="button" onClick={() => storeSubscriptionDialog.current?.close()}>我知道了</button>
              }>
                <p>定期配送目前適用於指定咖啡商品。</p>
                <p>這筆訂單中包含禮盒、器具或其他一般商品，因此本次無法使用定期配送。</p>
                {items.some(item => item.domain === "coffee") ? <section className={styles.recommendation}>
                  <h3>想使用定期配送？</h3>
                  <p>若將符合條件的咖啡商品另外下單，即可依原有規則選擇定期配送。</p>
                </section> : <p>您仍可以使用目前的方式正常完成本次訂單。</p>}
              </CheckoutModal>
            </section> : null}
            {rulesError ? <p role="alert">配送資訊暫時無法確認，請重試。</p> : null}
            {auth.kind === "ERROR" || rulesError ? <button type="button" onClick={() => setLookup(n => n + 1)}>重試確認資料</button> : null}
          </fieldset>
          <CheckoutSummary>
            {items.map(item => {
              const key = cartLineKey(item);
              const atStockLimit = cartInventoryDemand(items, item) >= cartInventoryLimit(items, item);
              const remove = () => removeCheckoutItem(key, items, removeItem, router);
              return <div className="summary-item" key={key}>
                <span>{item.name}<small>{cartSpecification(item)}</small>
                  <CheckoutCartControls
                    lineKey={key} cartLineCount={items.length}
                    name={item.name} quantity={item.quantity} atStockLimit={atStockLimit}
                    disabled={submitting || storageError}
                    onDecrease={() => item.quantity <= 1 ? remove() : updateQuantity(key, item.quantity - 1)}
                    onIncrease={() => updateQuantity(key, item.quantity + 1)} onRemove={remove}
                  />
                </span>
                <b>{money(item.unitPrice * item.quantity)}</b>
              </div>;
            })}
            <div className="summary-line"><span>商品小計</span><b>{money(subtotal)}</b></div>
            <div className="summary-line"><span>{mode === "studio_pickup" ? "工作室自取" : mode === "home_delivery" ? "宅配運費" : "7-ELEVEN 運費"}</span><b>{rules ? shipping ? money(shipping) : "免運" : "確認中"}</b></div>
            {codFee ? <div className="summary-line"><span>貨到付款手續費</span><b>{money(codFee)}</b></div> : null}
            <div className="summary-total"><span>{mode === "711_cod" ? "取貨付款總額" : "訂單總額"}</span><strong>{rules ? money(subtotal + shipping + codFee) : "確認中"}</strong></div>
            <button type="submit" disabled={submitting || !canFreshSubmit}>{submitting ? "資料傳送中…" : "確認並傳送訂單"}</button>
            <p>實際金額與可用庫存由送單時確認。</p>
          </CheckoutSummary>
        </form>}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </>}
  </CheckoutShell>;
}
