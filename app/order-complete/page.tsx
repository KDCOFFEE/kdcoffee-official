import Link from "next/link";

import OrderCompleteConversationLink from "@/components/orders/OrderCompleteConversationLink";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OrderCompletePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const orderNumber = getValue(params.order);
  const mode = getValue(params.mode);
  const payment = getValue(params.payment);
  const lineStatus = getValue(params.line);
  const studioPickup = mode === "studio_pickup";
  const homeDelivery = mode === "home_delivery";

  return (
    <main className="order-success-page">
      <section className="order-success-card" aria-labelledby="order-success-title">
        <p className="order-success-eyebrow">ORDER RECEIVED</p>
        <div className="order-success-mark" aria-hidden="true">✓</div>

        <h1 id="order-success-title">訂單已送出，謝謝你</h1>
        <p className="order-success-lead">
          {homeDelivery
            ? "KD Coffee 已收到宅配訂單，工作室會確認商品、地址與付款方式。"
            : studioPickup
            ? "KD Coffee 已收到訂單，工作室會主動與你確認自取日期與時間。"
            : "KD Coffee 已收到訂單與 7-ELEVEN 門市資料，核對後會建立取貨付款寄件單。"}
        </p>

        {orderNumber && (
          <div className="order-success-number">
            <span>你的訂單編號</span>
            <strong>{orderNumber}</strong>
            <small>聯絡工作室時提供這組編號，查詢會更快。</small>
          </div>
        )}

        <div className="order-success-next">
          <h2>接下來會怎麼進行？</h2>
          <ol>
            <li>
              <b>工作室核對訂單</b>
              <span>我們會確認商品、聯絡資料與取貨方式。</span>
            </li>
            <li>
              <b>{homeDelivery ? payment === "atm_transfer" ? "確認轉帳" : "安排宅配" : studioPickup ? "確認自取時間" : "建立 7-ELEVEN 取貨付款寄件單"}</b>
              <span>{homeDelivery ? payment === "atm_transfer" ? "請依網站／客服提供的轉帳資訊完成付款；確認入帳後安排出貨。" : "工作室將安排宅配，貨到時付款。" : studioPickup ? "請留意電話或 LINE 聯絡。" : "商品到店後，再依通知前往付款取貨。"}</span>
            </li>
            <li>
              <b>新鮮烘焙與出貨</b>
              <span>我們會依實際訂單安排製作與出貨。</span>
            </li>
          </ol>
        </div>

        {lineStatus === "pending" && (
          <div className="order-success-notice warning">
            <strong>訂單已安全保存，不需要重複下單</strong>
            <p>LINE 群組通知暫時未確認送達，但工作室仍可從訂單資料查詢。</p>
          </div>
        )}

        <div className="order-success-notice">
          <strong>{homeDelivery ? payment === "atm_transfer" ? "ATM 轉帳待確認" : "宅配貨到付款" : studioPickup ? "工作室會主動聯絡你確認。" : "本訂單不需要信用卡付款，也不會另外傳送付款連結。"}</strong>
          <p>{homeDelivery ? "請至訂單詳情查看地址、付款狀態與金額；如需協助請聯絡工作室。" : studioPickup ? "請留意電話或 LINE 聯絡。" : "請留意 7-ELEVEN 到店通知，並在期限內取貨付款。"}</p>
        </div>

        <div className="order-success-actions">
          {orderNumber && (
            <OrderCompleteConversationLink orderNumber={orderNumber} />
          )}
          <Link className="order-success-primary" href="/">返回首頁</Link>
          <Link className="order-success-secondary" href="/works">繼續選咖啡</Link>
          <a className="order-success-line" href="https://line.me/R/ti/p/@kdcoffee" target="_blank" rel="noreferrer">
            聯絡 LINE 官方帳號
          </a>
        </div>

        <p className="order-success-help">已登入會員可至會員中心查看會員資料、訂單與回饋紀錄。</p>
        <Link className="order-success-member" href="/member">進入會員中心</Link>
      </section>
    </main>
  );
}
