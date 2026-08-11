"use client";
import Link from "next/link";
import { useCart } from "./CartProvider";
export default function CartLink({ compact = false }: { compact?: boolean }) {
  const { count } = useCart();
  return <Link className={compact ? "cart-link compact" : "cart-link"} href="/cart" aria-label={`購物車，共 ${count} 件商品`}>
    <span>{compact ? "購物車" : "購物車"}</span><b>{count}</b>
  </Link>;
}
