"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function OrderCompleteConversationLink({ orderNumber }: { orderNumber: string }) {
  const [href, setHref] = useState(`/orders/${encodeURIComponent(orderNumber)}`);

  useEffect(() => {
    const hashToken = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    const token = hashToken || sessionStorage.getItem(`kdcoffee-order-access:${orderNumber}`) || "";
    if (token) {
      sessionStorage.setItem(`kdcoffee-order-access:${orderNumber}`, token);
      setHref(`/orders/${encodeURIComponent(orderNumber)}#token=${encodeURIComponent(token)}`);
    }
  }, [orderNumber]);

  return <Link className="order-success-primary" href={href}>查看訂單／詢問此訂單</Link>;
}
