"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/commerce/CartProvider";
import { cartInventoryDemand, cartInventoryLimit, isCartRecord, validateUnifiedCartItem } from "@/lib/commerceCart";
import type { StoreCartItem } from "@/lib/commerceCart";
import styles from "./StoreAddToCart.module.css";

/** Reject extra/private fields and incomplete responses before provider validation. */
export function storeCartItemFromOffer(value: unknown, slug: string): StoreCartItem {
  const fields = ["domain", "productId", "variantId", "slug", "name", "unitPrice", "quantityLimit"];
  if (!isCartRecord(value) || Object.keys(value).length !== fields.length
    || Object.keys(value).some(key => !fields.includes(key))
    || value.domain !== "store" || value.variantId !== "default" || value.slug !== slug
    || typeof value.quantityLimit !== "number" || value.quantityLimit < 1) {
    throw new Error("Invalid Store offer");
  }
  const item = validateUnifiedCartItem({ ...value, quantity: 1 });
  if (item.domain !== "store") throw new Error("Invalid Store domain");
  return item;
}
type ActionState = "idle" | "pending" | "success" | "error" | "out-of-stock" | "disabled";
export default function StoreAddToCart({ slug, inStock }: { slug: string; inStock: boolean }) {
  const { addItem, items, ready } = useCart();
  const busy = useRef(false);
  const [state, setState] = useState<ActionState>("idle");
  const [message, setMessage] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [offer, setOffer] = useState<StoreCartItem | null>(null);
  // The existing live Store offer and shared cart helpers own the quantity limit.
  const remaining = offer ? Math.max(0, cartInventoryLimit(items, offer) - cartInventoryDemand(items, offer)) : 0;
  const selectedQuantity = Math.min(quantity, Math.max(1, remaining));
  useEffect(() => {
    if (!ready || !inStock) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/commerce/store/offer", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }), cache: "no-store", signal: controller.signal,
        });
        if (!active) return;
        if (response.ok) {
          const current = storeCartItemFromOffer(await response.json(), slug);
          if (active) setOffer(current);
        } else if (response.status === 409) { setState("out-of-stock"); setMessage("目前無庫存"); }
        else if (response.status === 403 || response.status === 404) { setState("disabled"); setMessage("商品目前無法購買。"); }
      } catch { /* A fresh add request can still retry a transient offer-read failure. */ }
      finally { clearTimeout(timeout); }
    })();
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [ready, inStock, slug]);
  async function add() {
    if (busy.current || !ready || !inStock || state === "out-of-stock" || state === "disabled") return;
    busy.current = true;
    setState("pending");
    setMessage("正在加入購物車…");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch("/api/commerce/store/offer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }), cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) {
        setState(response.status === 409 ? "out-of-stock" : response.status === 403 ? "disabled" : "error");
        setMessage(response.status === 409 ? "目前無庫存" : response.status === 403
          ? "目前暫不開放加入購物車。" : response.status === 404
          ? "商品目前無法購買。" : "暫時無法加入購物車，請稍後重試。");
        return;
      }
      const item = storeCartItemFromOffer(await response.json(), slug);
      setOffer(item);
      const added = addItem(item, selectedQuantity);
      if (added <= 0) {
        setState("error");
        setMessage("目前無法加入，請確認購物車數量或儲存狀態。");
        return;
      }
      setState("success");
      setMessage(added === selectedQuantity ? "已加入購物車" : `已加入購物車（${added} 件，依可用數量調整）`);
    } catch {
      setState("error");
      setMessage("暫時無法加入購物車，請稍後重試。");
    } finally {
      clearTimeout(timeout);
      busy.current = false;
    }
  }
  const unavailable = !inStock || state === "out-of-stock";
  return <div className={styles.action} aria-busy={state === "pending"}>
    <div className={styles.controls}>
    {inStock && !unavailable && state !== "disabled" ? <div className={styles.quantity} role="group" aria-label="商品數量">
      <button type="button" aria-label="減少數量" disabled={!ready || selectedQuantity <= 1 || state === "pending"}
        onClick={() => setQuantity(Math.max(1, selectedQuantity - 1))}>−</button>
      <output aria-label="目前數量" aria-live="polite">{selectedQuantity}</output>
      <button type="button" aria-label="增加數量" disabled={!ready || !offer || selectedQuantity >= remaining || state === "pending"}
        onClick={() => setQuantity(Math.min(remaining, selectedQuantity + 1))}>+</button>
    </div> : null}
    <button className={styles.add} type="button" aria-label="加入購物車" onClick={() => void add()}
      disabled={!ready || unavailable || state === "pending" || state === "disabled" || (offer !== null && remaining === 0)}>
      {unavailable ? "目前無庫存" : state === "pending" ? "正在加入…" : state === "success" ? "已加入購物車" : "加入購物車"}
    </button>
    </div>
    <p className={styles.status} role={state === "error" ? "alert" : "status"} aria-live="polite">{message}</p>
  </div>;
}
