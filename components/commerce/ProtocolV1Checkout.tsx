"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCart } from "./CartProvider";
import StoreSelector from "./StoreSelector";
import AtmTransferInfoDialog from "@/components/orders/AtmTransferInfoDialog";
import { cartSpecification } from "@/lib/commerceCart";
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
  const { items, getProtocolV1CheckoutItems, clearCart, recoverableProtocolV1Attempt } = useCart();
  const router = useRouter();
  const client = useRef<ReturnType<typeof createProtocolV1CheckoutClient> | null>(null);
  const busy = useRef(false);
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

  return <main className="commerce-page">
    <header className="commerce-topbar"><Link href="/">KD COFFEE</Link><span>結帳</span><Link href="/cart">返回購物車</Link></header>
    <section className="checkout-shell">
      <div className="commerce-title"><p className="eyebrow dark">CHECKOUT</p><h1>{frozen ? "確認此筆結帳嘗試" : "單次訂購"}</h1></div>
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
          <fieldset className="checkout-form" disabled={submitting || storageError}>
            <section className="form-card">
              <div className="form-card-head"><span>01</span><h2>聯絡人資料</h2></div>
              <p role="status">{auth.kind === "LOADING" ? "正在確認登入狀態…" : auth.kind === "ERROR" ? "登入狀態暫時無法確認，請重試。" : auth.kind === "MEMBER" ? "已帶入會員常用資料，請確認本次收件資訊。" : "以訪客身分單次訂購。"}</p>
              <label>姓名<input name="name" value={customer.name} maxLength={20} required onChange={e => setCustomer(c => ({ ...c, name: e.target.value }))} /></label>
              <label>手機<input name="phone" inputMode="numeric" pattern="09[0-9]{8}" maxLength={10} value={customer.phone} required onChange={e => setCustomer(c => ({ ...c, phone: e.target.value }))} /></label>
              <label>Email<input name="email" type="email" maxLength={120} value={customer.email} onChange={e => setCustomer(c => ({ ...c, email: e.target.value }))} /></label>
            </section>
            <section className="form-card">
              <div className="form-card-head"><span>02</span><h2>配送與付款</h2></div>
              <label>配送方式<select value={mode} onChange={e => setMode(e.target.value as V1Mode)}>
                <option value="711_cod">7-ELEVEN 取貨付款</option><option value="studio_pickup">KD Coffee 工作室自取</option><option value="home_delivery">宅配</option>
              </select></label>
              {mode === "711_cod" ? <StoreSelector initialStore={auth.kind === "MEMBER" ? auth.member.favoriteStore : undefined} /> : null}
              {mode === "studio_pickup" ? <label>希望自取日期<input type="date" name="pickupDate" min={earliest || undefined} value={pickupDate} required onChange={e => setPickupDate(e.target.value)} /></label> : null}
              {mode === "home_delivery" ? <>
                {addressFields.map(([key, label, maximum]) => <label key={key}>{label}<input name={key} maxLength={maximum} required value={address[key]} onChange={e => setAddress(current => ({ ...current, [key]: e.target.value }))} /></label>)}
                <label>付款方式<select value={payment} onChange={e => setPayment(e.target.value as typeof payment)}>
                  <option value="cash_on_delivery">貨到付款</option><option value="atm_transfer" disabled={!rules?.payment.atmTransfer.configured}>ATM 轉帳</option>
                </select></label>
                {payment === "atm_transfer" && rules?.payment.atmTransfer.configured ? <AtmTransferInfoDialog data={{
                  ...rules.payment.atmTransfer, showBankbookImage: rules.payment.atmTransfer.showBankbookImageAtCheckout,
                }} /> : null}
              </> : null}
            </section>
            <section className="form-card">
              <div className="form-card-head"><span>03</span><h2>訂單備註</h2></div>
              <p>商店商品目前採單次訂購，本筆暫不使用會員抵用金。</p>
              <label>備註<textarea name="note" maxLength={200} rows={3} value={customer.note} onChange={e => setCustomer(c => ({ ...c, note: e.target.value }))} /></label>
            </section>
            {rulesError ? <p role="alert">配送資訊暫時無法確認，請重試。</p> : null}
            {auth.kind === "ERROR" || rulesError ? <button type="button" onClick={() => setLookup(n => n + 1)}>重試確認資料</button> : null}
            <button type="submit" disabled={submitting || !canFreshSubmit}>{submitting ? "送出中…" : "確認單次訂購"}</button>
          </fieldset>
          <aside className="checkout-summary form-card">
            <h2>本次商品</h2>
            {items.map((item, index) => <p key={index}>{item.name}{cartSpecification(item) ? " · " + cartSpecification(item) : ""} × {item.quantity}<br />{money(item.unitPrice * item.quantity)}</p>)}
            <p>商品小計：{money(subtotal)}</p><p>運費：{rules ? money(shipping) : "確認中"}</p>
            {codFee ? <p>貨到付款手續費：{money(codFee)}</p> : null}
            <strong>預估合計：{rules ? money(subtotal + shipping + codFee) : "確認中"}</strong>
            <p>實際金額與可用庫存由送單時確認。</p>
          </aside>
        </form>}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </>}
    </section>
  </main>;
}
