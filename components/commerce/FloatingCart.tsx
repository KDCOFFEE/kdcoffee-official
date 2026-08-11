"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "./CartProvider";

export default function FloatingCart() {
  const { count, subtotal, ready } = useCart();
  const pathname = usePathname();
  if (!ready || count < 1 || pathname === "/cart" || pathname === "/checkout" || pathname.startsWith("/admin")) return null;
  return (
    <Link className="floating-cart" href="/cart" aria-label={`查看購物車，共 ${count} 件商品`}>
      <span className="floating-cart-icon" aria-hidden="true">購</span>
      <span><b>購物車</b><small>{count} 件・NT$ {subtotal.toLocaleString("zh-TW")}</small></span>
      <strong>查看 →</strong>
    </Link>
  );
}
