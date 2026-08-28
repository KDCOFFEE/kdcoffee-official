"use client";

import { useState } from "react";
import Link from "next/link";

import StoreSelector from "@/components/commerce/StoreSelector";
import type { CreditEntry, Subscription, SubscriptionCycle } from "@/lib/membershipCommerce";
import { ALLOWED_ROAST_LEVELS } from "@/lib/checkoutRules";

type Dashboard = {
  subscriptions: Subscription[];
  cycles: SubscriptionCycle[];
  credits: CreditEntry[];
  pendingCredit: number;
  referrals: Array<{ memberNumberReference: string; safeDisplayName: string; joined: boolean; qualifiedPurchases: number; rewards: number; status: string }>;
};

type Props = Dashboard & { products: Array<{ id: string; name: string; price: number; roast: string }>; rules: { intervalsDays: number[]; delayQuickOptionsDays: number[]; preparationLeadDays: number; discountPercent: number } };

const money = (value: number) => `NT$ ${value.toLocaleString("zh-TW")}`;
const statusLabel = (value: Subscription["status"]) => ({ pending_activation: "等待首筆訂單取貨", active: "配送中", paused: "已暫停", terminated: "已停止" })[value];

export default function MemberSubscriptionExperience(initial: Props) {
  const [dashboard, setDashboard] = useState<Dashboard>(initial);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [resumeDate, setResumeDate] = useState("");
  const [resumeInterval, setResumeInterval] = useState(initial.rules.intervalsDays[0] ?? 30);

  async function mutate(action: string, payload: Record<string, unknown>) {
    setBusy(action);
    setMessage("");
    try {
      const response = await fetch("/api/member/subscription", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload, idempotencyKey: `${action}-${crypto.randomUUID()}` }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "操作未完成");
      setDashboard({ subscriptions: result.subscriptions, cycles: result.cycles, credits: result.credits, pendingCredit: result.pendingCredit, referrals: result.referrals });
      setMessage("已完成，最新安排已更新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作未完成，請再試一次。");
    } finally {
      setBusy("");
    }
  }

  const subscription = dashboard.subscriptions.find((item) => item.status !== "terminated") ?? dashboard.subscriptions[0];
  const nextCycle = subscription ? dashboard.cycles.find((item) => item.subscriptionId === subscription.subscriptionId && ["scheduled", "modifiable"].includes(item.status)) : undefined;
  const availableCredit = dashboard.credits.filter((item) => item.status === "available").reduce((sum, item) => sum + item.remainingAmount, 0);
  const productName = (id: string) => initial.products.find((product) => product.id === id)?.name ?? id;
  const nextItems = nextCycle?.itemsDraft ?? subscription?.defaultItems ?? [];
  const nextSubtotal = nextItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const expectedPayment = Math.floor((nextSubtotal * initial.rules.discountPercent + 50) / 100);

  return <>
    <section className="member-commerce-section" id="subscription">
      <div className="member-section-head"><div><p className="eyebrow dark">SUBSCRIPTION</p><h2>我的定期配送</h2></div>{subscription && <span className={`member-subscription-status ${subscription.status}`}>{statusLabel(subscription.status)}</span>}</div>
      {message && <p className="member-notice" role="status">{message}</p>}
      {!subscription ? <div className="member-commerce-empty"><strong>還沒有定期配送</strong><p>第一次購買時可勾選加入。首筆仍是原價，成功取貨後才會開始定期配送與續訂優惠。</p><Link href="/works">挑選咖啡作品</Link></div> : <div className="member-subscription-grid">
        <article className="member-subscription-summary">
          <div><small>配送週期</small><strong>每 {subscription.intervalDays} 天</strong></div>
          <div><small>下次安排</small><strong>{nextCycle?.plannedDate ?? (subscription.status === "pending_activation" ? "首筆取貨後安排" : "尚未排定")}</strong></div>
          <div><small>取貨門市</small><strong>{subscription.storeSelection?.storeName ?? "工作室自取"}</strong></div>
          <div><small>下一次咖啡</small><strong>{nextItems.flatMap((item) => item.components.map((part) => productName(part.productId))).join(" + ") || "尚未選擇"}</strong></div>
          <div><small>修改截止</small><strong>{nextCycle?.modificationDeadline ?? "啟動後顯示"}</strong></div>
          <div><small>預估應付</small><strong>{nextCycle ? money(expectedPayment) : "啟動後計算"}</strong><span>未使用抵用金；活動適用時會自動採較優惠價格</span></div>
        </article>

        {subscription.status === "pending_activation" ? <div className="member-commerce-callout"><strong>目前不會自動建立下一張訂單</strong><p>等首筆原價訂單成功取貨後，才會正式啟動。您可以先在這裡確認內容。</p></div> : <div className="member-subscription-actions">
          {nextCycle && <details><summary>調整下一次日期</summary><div className="member-action-panel"><p>一次只調整一件事。選好日期後，可決定只改這次，或從新日期重算。</p><label>新的配送日期<input type="date" id="member-next-date" defaultValue={nextCycle.plannedDate} /></label><div className="member-action-buttons"><button disabled={Boolean(busy)} onClick={() => { const plannedDate = (document.getElementById("member-next-date") as HTMLInputElement).value; void mutate("change-date", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision, plannedDate, recalculateAnchor: false }); }}>只改這次</button><button disabled={Boolean(busy)} onClick={() => { const plannedDate = (document.getElementById("member-next-date") as HTMLInputElement).value; void mutate("change-date", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision, plannedDate, recalculateAnchor: true }); }}>從新日期重算</button></div><div className="member-quick-delays">{initial.rules.delayQuickOptionsDays.map((days) => <button key={days} type="button" disabled={Boolean(busy)} onClick={() => { const date = new Date(`${nextCycle.plannedDate}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); void mutate("delay", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision, plannedDate: date.toISOString().slice(0, 10), recalculateAnchor: false }); }}>延後 {days} 天</button>)}</div></div></details>}
          {nextCycle && <details><summary>跳過這一次</summary><div className="member-action-panel"><p>只跳過 {nextCycle.plannedDate} 這一次，不會改變後續配送週期。</p><button className="member-danger-soft" disabled={Boolean(busy)} onClick={() => void mutate("skip", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision })}>確認跳過</button></div></details>}
          {nextCycle && initial.products.length > 0 && <details><summary>更換咖啡、份量或烘焙度</summary><form className="member-action-panel" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void mutate("change-items", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision, packageWeight: form.get("packageWeight"), productA: form.get("productA"), productB: form.get("productB"), quantity: form.get("quantity"), roast: form.get("roast") }); }}><p>這裡只調整下一次配送。一磅可選同款 A+A，或兩款 A+B。</p><label>份量<select name="packageWeight" defaultValue={nextItems[0]?.packageWeight ?? "half-pound"}><option value="half-pound">半磅</option><option value="one-pound">一磅（兩個半磅組合）</option></select></label><label>第一款咖啡<select name="productA" defaultValue={nextItems[0]?.components[0]?.productId}>{initial.products.map((product) => <option key={product.id} value={product.id}>{product.name}・半磅 {money(product.price)}</option>)}</select></label><label>第二款咖啡（一磅使用）<select name="productB" defaultValue={nextItems[0]?.components[1]?.productId ?? nextItems[0]?.components[0]?.productId}>{initial.products.map((product) => <option key={product.id} value={product.id}>{product.name}・半磅 {money(product.price)}</option>)}</select></label><label>數量<input name="quantity" type="number" min={1} max={12} defaultValue={nextItems[0]?.quantity ?? 1} /></label><label>烘焙度<select name="roast" defaultValue={nextItems[0]?.roast || "淺中焙"}>{ALLOWED_ROAST_LEVELS.map((roast) => <option key={roast} value={roast}>{roast}</option>)}</select></label><button disabled={Boolean(busy)} type="submit">儲存下一次內容</button></form></details>}
          <details><summary>更換 7-ELEVEN 門市</summary><form className="member-action-panel" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void mutate("change-store", { subscriptionId: subscription.subscriptionId, expectedRevision: subscription.revision, storeId: form.get("storeId"), storeName: form.get("storeName") }); }}><StoreSelector initialStore={subscription.storeSelection ? { id: subscription.storeSelection.storeId, name: subscription.storeSelection.storeName, address: "" } : undefined} /><button disabled={Boolean(busy)} type="submit">儲存門市</button></form></details>
          <details><summary>暫停、恢復或停止</summary><div className="member-action-panel">{subscription.status === "active" && <button disabled={Boolean(busy)} onClick={() => void mutate("pause", { subscriptionId: subscription.subscriptionId, expectedRevision: subscription.revision })}>暫停配送</button>}{subscription.status === "paused" && <><label>恢復日期<input type="date" value={resumeDate} onChange={(event) => setResumeDate(event.target.value)} /></label><label>新的配送週期<select value={resumeInterval} onChange={(event) => setResumeInterval(Number(event.target.value))}>{initial.rules.intervalsDays.map((days) => <option key={days} value={days}>每 {days} 天</option>)}</select></label><button disabled={Boolean(busy) || !resumeDate} onClick={() => void mutate("resume", { subscriptionId: subscription.subscriptionId, expectedRevision: subscription.revision, resumeDate, intervalDays: resumeInterval })}>確認恢復</button></>}<button className="member-danger-soft" disabled={Boolean(busy)} onClick={() => void mutate("terminate", { subscriptionId: subscription.subscriptionId, expectedRevision: subscription.revision })}>停止定期配送</button></div></details>
          {subscription.status === "active" && <button className="member-replenish-button" disabled={Boolean(busy)} onClick={() => void mutate("replenish", { subscriptionId: subscription.subscriptionId })}>立即補貨（不改下次日期）</button>}
        </div>}
      </div>}
    </section>

    <section className="member-commerce-section" id="credit"><div className="member-section-head"><div><p className="eyebrow dark">CREDIT</p><h2>我的抵用金</h2></div><strong>{money(availableCredit)}</strong></div><div className="member-credit-summary"><div><small>現在可用</small><strong>{money(availableCredit)}</strong></div><div><small>待符合資格</small><strong>{money(dashboard.pendingCredit)}</strong></div></div>{dashboard.credits.length ? <div className="member-credit-history">{dashboard.credits.map((entry) => <article key={entry.creditEntryId}><div><strong>+ {money(entry.amount)}</strong><small>{entry.sourceType === "referral" ? "推薦回饋" : "會員抵用金"}</small></div><div><span>餘額 {money(entry.remainingAmount)}</span><small>到期 {entry.expiresAt.slice(0, 10)}</small></div></article>)}</div> : <div className="member-commerce-empty compact"><strong>目前沒有抵用金紀錄</strong><p>有抵用金時，結帳會讓您自行選擇是否使用，並優先使用最快到期的額度。</p></div>}</section>

    <section className="member-commerce-section" id="referral"><div className="member-section-head"><div><p className="eyebrow dark">REFERRAL</p><h2>我的推薦</h2></div><span>{dashboard.referrals.length} 位</span></div>{dashboard.referrals.length ? <div className="member-referral-list">{dashboard.referrals.map((item) => <article key={item.memberNumberReference}><div><strong>{item.safeDisplayName || "KD Coffee 會員"}</strong><small>已加入會員</small></div><div><span>符合 {item.qualifiedPurchases} 次</span><strong>{money(item.rewards)}</strong></div></article>)}</div> : <div className="member-commerce-empty compact"><strong>還沒有推薦紀錄</strong><p>這裡只會顯示安全的會員稱呼、是否加入與回饋進度，不會顯示對方的聯絡資料。</p></div>}</section>
  </>;
}
