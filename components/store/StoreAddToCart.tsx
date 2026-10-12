"use client";

import { useRef, useState } from "react";
import { useCart } from "@/components/commerce/CartProvider";
import { isCartRecord, validateUnifiedCartItem } from "@/lib/commerceCart";
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
  const { addItem, ready } = useCart();
  const busy = useRef(false);
  const [state, setState] = useState<ActionState>("idle");
  const [message, setMessage] = useState("");
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
      if (addItem(item, 1) !== 1) {
        setState("error");
        setMessage("目前無法加入，請確認購物車數量或儲存狀態。");
        return;
      }
      setState("success");
      setMessage("已加入購物車");
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
    <button type="button" onClick={() => void add()}
      disabled={!ready || unavailable || state === "pending" || state === "disabled"}>
      {unavailable ? "目前無庫存" : state === "pending" ? "正在加入…" : state === "success" ? "已加入購物車" : "加入購物車"}
    </button>
    <p className={styles.status} role={state === "error" ? "alert" : "status"} aria-live="polite">{message}</p>
  </div>;
}
