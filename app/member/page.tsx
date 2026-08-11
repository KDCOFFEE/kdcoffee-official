import Link from "next/link";
import { getCurrentMember } from "@/lib/memberAuth";
import MemberProfileForm from "@/components/member/MemberProfileForm";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

type OrderSummary = {
  orderNumber: string;
  createdAt: string;
  orderMode: string;
  status: string;
  total?: number;
  subtotal?: number;
  lineNotification?: { sent?: boolean; status?: string };
  store?: { name?: string };
};

async function getMemberOrders(memberId: string) {
  const dir = path.join(process.cwd(), "data", "orders");
  try {
    const files = (await fs.readdir(dir)).filter((file) => file.endsWith(".json"));
    const orders: OrderSummary[] = [];
    for (const file of files) {
      try {
        const order = JSON.parse(await fs.readFile(path.join(dir, file), "utf8"));
        if (order.member?.memberId === memberId) orders.push(order);
      } catch {}
    }
    return orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
  } catch {
    return [];
  }
}

function modeLabel(mode: string) {
  return mode === "711_cod" ? "7-ELEVEN 取貨付款" : "工作室自取";
}

function statusLabel(status: string) {
  if (status === "waiting_merchant_create_cod_shipment") return "待建立寄件單";
  if (status === "waiting_studio_pickup_confirmation") return "待確認自取時間";
  if (status === "completed") return "已完成";
  if (status === "cancelled") return "已取消";
  return "訂單已成立";
}

export default async function MemberPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const member = await getCurrentMember();

  if (!member) {
    return (
      <main className="member-page">
        <section className="member-login-card">
          <p className="eyebrow dark">KD COFFEE MEMBER</p>
          <h1>用 LINE 輕鬆成為會員</h1>
          <p>第一次登入會自動建立會員，不必設定密碼。之後可快速帶入姓名、手機與常用門市，並查看自己的訂單。</p>
          {params.error && <p className="form-error">LINE 登入未完成，請再試一次。</p>}
          <a className="line-login-button" href="/api/auth/line/login?returnTo=/member">使用 LINE 登入／註冊</a>
          <Link className="text-link" href="/">返回首頁</Link>
        </section>
      </main>
    );
  }

  const orders = await getMemberOrders(member.id);

  return (
    <main className="member-page">
      <section className="member-card">
        <div className="member-profile">
          {member.pictureUrl ? <img src={member.pictureUrl} alt="LINE 會員頭像" /> : <div className="member-avatar-fallback">KD</div>}
          <div className="member-profile-copy">
            <p className="eyebrow dark">KD COFFEE MEMBER</p>
            <h1>{member.displayName}</h1>
            <p>歡迎回來。常用資料會在結帳時自動帶入。</p>
          </div>
        </div>

        <div className="member-actions">
          <Link href="/works">選購咖啡作品</Link>
          <Link className="member-primary-action" href="/checkout">前往結帳</Link>
        </div>

        <div className="member-info-grid">
          <div><small>常用姓名</small><strong>{member.pickupName || "尚未設定"}</strong></div>
          <div><small>手機號碼</small><strong>{member.phone || "尚未設定"}</strong></div>
          <div><small>常用門市</small><strong>{member.favoriteStore?.name || "尚未設定"}</strong>{member.favoriteStore?.address && <span>{member.favoriteStore.address}</span>}</div>
          <div><small>會員建立日期</small><strong>{new Date(member.createdAt).toLocaleDateString("zh-TW")}</strong><span>最近登入：{new Date(member.lastLoginAt).toLocaleString("zh-TW")}</span></div>
        </div>

        <MemberProfileForm initial={{ pickupName: member.pickupName, phone: member.phone, email: member.email }} />

        <section className="member-orders">
          <div className="member-section-head">
            <div><p className="eyebrow dark">ORDER HISTORY</p><h2>最近訂單</h2></div>
            <span>{orders.length} 筆</span>
          </div>
          {orders.length ? orders.map((order) => (
            <article className="member-order-card" key={order.orderNumber}>
              <div className="member-order-main">
                <strong>{order.orderNumber}</strong>
                <small>{new Date(order.createdAt).toLocaleString("zh-TW")}・{modeLabel(order.orderMode)}</small>
                {order.store?.name && <small>取貨門市：{order.store.name}</small>}
              </div>
              <div className="member-order-meta">
                <span className="order-status-chip">{statusLabel(order.status)}</span>
                <b>NT$ {(order.total ?? order.subtotal ?? 0).toLocaleString("zh-TW")}</b>
                <small className={order.lineNotification?.sent ? "line-status sent" : "line-status pending"}>{order.lineNotification?.sent ? "LINE 已通知工作室" : "訂單已保存"}</small>
              </div>
            </article>
          )) : <div className="member-empty-orders"><strong>目前還沒有會員訂單</strong><p>完成第一筆訂購後，訂單紀錄會顯示在這裡。</p><Link href="/works">開始選購咖啡</Link></div>}
        </section>

        <form action="/api/auth/logout" method="post"><button className="logout-button">登出 LINE 會員</button></form>
      </section>
    </main>
  );
}
