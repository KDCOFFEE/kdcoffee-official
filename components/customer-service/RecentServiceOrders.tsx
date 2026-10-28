import Link from "next/link";
import { readCustomerServiceOrders } from "@/lib/customerServiceOrders";
import ServiceIcon from "./ServiceIcon";
import styles from "./CustomerService.module.css";

export default async function RecentServiceOrders() {
  const result = await readCustomerServiceOrders();
  return <section id="recent-orders" className={styles.recent} aria-labelledby="recent-orders-title">
    {result.kind !== "guest" && <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>YOUR ORDERS</p><h2 id="recent-orders-title">最近的訂單</h2></div><Link className={styles.textLink} href="/member#orders">我的訂單 <span aria-hidden="true">↗</span></Link></div>}
    {result.kind === "guest" ? <div className={styles.login}><div className={styles.loginCopy}><span className={styles.orderSymbol}><ServiceIcon name="orders"/></span><div><p className={styles.eyebrow}>YOUR ORDERS</p><h2 id="recent-orders-title">最近的訂單</h2><p>登入後即可查看最近訂單、付款與配送進度。</p></div></div><div className={styles.loginActions}><Link className={styles.solidLink} href="/member?returnTo=%2Fcustomer-service">登入會員 <span aria-hidden="true">↗</span></Link><a className={styles.orderHelp} href="#faq-orders">了解訂單服務 <span aria-hidden="true">↗</span></a></div></div>
      : result.kind === "unavailable" ? <div className={styles.empty}><p>訂單資訊暫時無法讀取，請稍後重試，或前往我的訂單查看。</p></div>
      : !result.orders.length ? <div className={styles.empty}><p>目前還沒有會員訂單。完成訂購後，即可在這裡查看。</p><Link className={styles.textLink} href="/works">探索咖啡作品 ↗</Link></div>
      : <div className={styles.orderList}>{result.orders.map(order => <article className={styles.order} key={order.orderNumber}>
        <div><span className={styles.orderLabel}>ORDER</span><h3>{order.orderNumber}</h3><time dateTime={order.createdAt}>{Number.isNaN(Date.parse(order.createdAt)) ? "日期待確認" : new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(order.createdAt))}</time></div>
        <div className={styles.orderState}><strong>{order.status}</strong><span>{order.method}</span></div>
        <Link className={styles.textLink} href={`/orders/${encodeURIComponent(order.orderNumber)}`}>查看訂單 <span aria-hidden="true">↗</span></Link>
      </article>)}</div>}
  </section>;
}
