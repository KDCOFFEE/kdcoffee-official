"use client";

import type { AdminMemberDetail } from "@/lib/adminMemberDirectory";

function money(value: number) {
  return `NT$ ${value.toLocaleString("zh-TW")}`;
}

function valueOrDash(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function DefinitionList({ rows }: { rows: Array<[string, string | number | null | undefined]> }) {
  return <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{valueOrDash(value)}</dd></div>)}</dl>;
}

export function AdminMemberDetailPanel(props: {
  detail: AdminMemberDetail | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  if (!props.detail && !props.loading && !props.error) return <aside className="detail-panel empty"><p>選擇會員後查看完整資料。</p></aside>;
  return <aside className="detail-panel" aria-live="polite" aria-label="會員詳細資料">
    <header><div><small>OWNER ONLY · LIVE DATA</small><h2>{props.detail?.identity.displayName || "會員資料"}</h2></div><button type="button" aria-label="關閉會員資料" onClick={props.onClose}>×</button></header>
    {props.loading ? <p>正在讀取最新 canonical 資料…</p> : null}
    {props.error ? <p className="detail-error">{props.error}</p> : null}
    {props.detail ? <div className="detail-scroll">
      <section><h3>身份資料</h3><DefinitionList rows={[
        ["會員編號", props.detail.identity.memberNumber], ["Member ID", props.detail.identity.memberId], ["帳號狀態", props.detail.identity.accountStatus], ["建立時間", props.detail.identity.createdAt], ["最後登入", props.detail.identity.lastLoginAt], ["取貨姓名", props.detail.identity.pickupName], ["手機", props.detail.identity.phone], ["聯絡 Email", props.detail.identity.email], ["登入 Email", props.detail.identity.loginEmail], ["自訂頭像", props.detail.identity.avatarStatus.customAvatar ? "有" : "無"], ["Provider 圖片", props.detail.identity.avatarStatus.providerPicture ? "有" : "無"],
      ]} />
      {props.detail.identity.providers.length ? <ul>{props.detail.identity.providers.map((provider, index) => <li key={`${provider.provider}-${index}`}>{provider.provider} · {provider.status} · linked {provider.linkedAt}</li>)}</ul> : <p>無 identity provider 紀錄。</p>}</section>

      <section><h3>推薦組織</h3><DefinitionList rows={[
        ["上層推薦人", props.detail.organization.parent ? `${props.detail.organization.parent.displayName} · ${props.detail.organization.parent.memberNumber}` : "Root / 無"], ["Depth", props.detail.organization.node?.depth], ["直推人數", props.detail.organization.node?.directCount], ["團隊人數", props.detail.organization.node?.teamCount], ["Root", props.detail.organization.node?.rootId], ["關係狀態", props.detail.organization.node?.relationshipStatus],
      ]} />
      {props.detail.organization.children.length ? <><h4>直推會員</h4><ul>{props.detail.organization.children.map((child) => <li key={child.memberId}>{child.displayName} · {child.memberNumber || child.memberId}</li>)}</ul></> : null}
      {props.detail.organization.relationshipHistory.length ? <><h4>關係歷史</h4><ul>{props.detail.organization.relationshipHistory.map((relation) => <li key={relation.relationshipId}>{relation.parentId} → {relation.childId} · {relation.status}</li>)}</ul></> : null}</section>

      <section><h3>定期配送（{props.detail.subscriptions.length}）</h3>
        {props.detail.subscriptions.map((subscription) => <article key={subscription.subscriptionId} className="detail-card"><strong>{subscription.subscriptionId}</strong><DefinitionList rows={[
          ["狀態", subscription.status], ["週期", `每 ${subscription.intervalDays} 天`], ["未來取貨", subscription.shippingMethod], ["7-ELEVEN 門市", subscription.storeSelection?.storeName], ["首筆訂單", subscription.startedFromOrderId], ["下一期", subscription.nextCycle?.plannedDate], ["修改截止", subscription.nextCycle?.modificationDeadline], ["期次狀態", subscription.nextCycle?.status],
        ]} /></article>)}
        {!props.detail.subscriptions.length ? <p>沒有定期配送紀錄。</p> : null}
      </section>

      <section><h3>Commerce / 權益</h3><DefinitionList rows={[
        ["可用抵用金", money(props.detail.commerce.creditAvailable)], ["保留中抵用金", money(props.detail.commerce.creditReserved)], ["推薦獎勵筆數", props.detail.commerce.rewardCount], ["計算獎勵", money(props.detail.commerce.calculatedRewardAmount)], ["已釋放獎勵", money(props.detail.commerce.releasedRewardAmount)], ["預估獎勵", money(props.detail.commerce.projectedRewardAmount)], ["有效消費", money(props.detail.commerce.validConsumption)], ["資格狀態", props.detail.commerce.qualificationStatus], ["資格輪次", props.detail.commerce.qualificationRoundCount], ["歷史有效 PV 快照", props.detail.commerce.historicalEffectivePv], ["獎勵 PV 快照", props.detail.commerce.rewardPvSnapshots],
      ]} /></section>

      <section><h3>訂單</h3><DefinitionList rows={[
        ["全部訂單", props.detail.orders.orderCount], ["已完成訂單", props.detail.orders.completedOrderCount], ["已完成訂單金額", money(props.detail.orders.completedSpend)], ["全部訂單金額", money(props.detail.orders.allOrderAmount)],
      ]} />
      <div className="detail-orders">{props.detail.orders.recent.map((order) => <article key={order.orderNumber} className="detail-card"><strong>{order.orderNumber}</strong><span>{order.createdAt} · {order.fulfillmentStatus || order.orderStatus}</span><span>{money(order.total)} · {order.shippingMethod}{order.storeName ? ` · ${order.storeName}` : ""}</span>{order.diagnostic ? <b>{order.diagnostic}</b> : null}</article>)}</div></section>

      {props.detail.organization.findings.length || props.detail.diagnostics.length ? <section className="detail-warnings"><h3>資料診斷</h3><ul>{[...props.detail.organization.findings, ...props.detail.diagnostics].map((item, index) => <li key={`${item.code}-${index}`}>{item.message}</li>)}</ul></section> : null}
    </div> : null}
  </aside>;
}
