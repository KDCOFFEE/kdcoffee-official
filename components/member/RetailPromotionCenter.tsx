"use client";

import { useEffect, useRef, useState } from "react";

type CalculationBasis = "paid_amount" | "pv";

type RetailPromotionData = {
  referralCode: string;
  settings: { enabled: boolean; rewardRate: number; calculationBasis: CalculationBasis; attributionWindowDays: number; pointDisplayName: string; pvRewardMoneyValue: number };
  summary: {
    promotionSales: number;
    pendingPromotionSales: number;
    promotionReward: number;
    pendingReward: number;
    releasedReward: number;
    performanceByBasis: { paidAmount: { completed: number; pending: number }; pv: { completed: number; pending: number } };
  };
  history: Array<{
    rewardId: string;
    date: string;
    orderReference: string;
    eligibleSales: number;
    calculationBasis: CalculationBasis;
    calculationBaseValue: number;
    rewardRate: number;
    rewardPV: number;
    pvRewardMoneyValue: number;
    rewardAmount: number;
    status: "pending_completion" | "scheduled" | "released" | "cancelled" | "reversed";
    releaseEligibleBusinessDate: string;
    releasedAt: string | null;
    ruleVersion: number;
  }>;
};

const money = (value: number) => `NT$ ${value.toLocaleString("zh-TW")}`;
const amount = (value: number) => value.toLocaleString("zh-TW", { maximumFractionDigits: 2 });
const shortDate = (value: string) => new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit" }).format(new Date(value));
const statusLabel = (status: RetailPromotionData["history"][number]["status"]) => status === "pending_completion" ? "待訂單完成" : status === "scheduled" ? "待入帳" : status === "released" ? "已入帳" : status === "reversed" ? "已沖回" : "已取消";

export default function RetailPromotionCenter() {
  const [data, setData] = useState<RetailPromotionData | null>(null);
  const [error, setError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const detailsTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void fetch("/api/member/retail-promotion", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "推廣零售資料暫時無法讀取");
        setData(result);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "推廣零售資料暫時無法讀取"));
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (detailsOpen && !dialog.open) dialog.showModal();
    if (!detailsOpen && dialog.open) dialog.close();
  }, [detailsOpen]);

  function finishClosingDetails() {
    setDetailsOpen(false);
    window.setTimeout(() => detailsTriggerRef.current?.focus(), 0);
  }

  return (
    <section className="member-commerce-section retail-promotion-center" id="retail-promotion">
      <div className="retail-promotion-primary">
        <div className="retail-promotion-intro">
          <p className="eyebrow dark">RETAIL PROMOTION</p>
          <h2>推廣零售</h2>
          {data ? <p>{data.settings.enabled ? <>朋友透過你在「推薦」中的分享連結，以訪客身分完成購買，即可依 <strong>{data.settings.rewardRate}%</strong> 比例獲得推廣零售獎金。</> : "目前未啟用新的推廣零售獎金；分享功能仍集中在「推薦」。"}</p> : <p>訪客購買帶來的推廣零售成果會顯示在這裡；分享請前往「推薦」。</p>}
        </div>
        {error ? <p className="form-error">{error}</p> : !data ? <p>讀取中…</p> : <>
          <div className="retail-promotion-reward-summary" aria-label="推廣零售獎金摘要">
            <article><small>待入帳</small><strong>{money(data.summary.pendingReward)}</strong></article>
            <article><small>已入帳</small><strong>{money(data.summary.releasedReward)}</strong></article>
          </div>
          <div className="retail-promotion-actions">
            <button ref={detailsTriggerRef} className="retail-promotion-detail-action" type="button" onClick={() => setDetailsOpen(true)}>查看詳情</button>
          </div>
          <dialog ref={dialogRef} className="retail-promotion-dialog" aria-labelledby="retail-promotion-dialog-title" onClose={finishClosingDetails}>
            <div className="retail-promotion-dialog-shell">
              <header>
                <div><p className="eyebrow dark">RETAIL PROMOTION</p><h2 id="retail-promotion-dialog-title">推廣零售詳情</h2></div>
                <button type="button" aria-label="關閉推廣零售詳情" onClick={() => dialogRef.current?.close()}>×</button>
              </header>
              <div className="retail-promotion-detail-body">
                <section className="retail-promotion-detail-overview" aria-label="目前推廣零售規則">
                  <dl>
                    <div><dt>目前獎金比例</dt><dd>{data.settings.rewardRate}%</dd></div>
                    <div><dt>計算基礎</dt><dd>{data.settings.calculationBasis === "pv" ? `${data.settings.pointDisplayName}（PV）` : "實付商品金額"}</dd></div>
                    <div><dt>分享有效期間</dt><dd>{data.settings.attributionWindowDays} 天</dd></div>
                  </dl>
                  <p>{data.settings.calculationBasis === "pv" ? `依訪客訂單的有效 ${data.settings.pointDisplayName}（PV）× 獎金比例計算，再依每 1 ${data.settings.pointDisplayName} = NT$ ${amount(data.settings.pvRewardMoneyValue)} 換算抵用金。` : "依訪客訂單的有效商品實付金額 × 獎金比例計算；運費不列入計算。"}</p>
                </section>

                <section className="retail-promotion-detail-kpis" aria-label="推廣零售完整數據">
                  <article><small>實付商品業績</small><strong>{money(data.summary.performanceByBasis.paidAmount.completed)}</strong><span>待確認 {money(data.summary.performanceByBasis.paidAmount.pending)}</span></article>
                  <article><small>{data.settings.pointDisplayName} 業績</small><strong>{amount(data.summary.performanceByBasis.pv.completed)} PV</strong><span>待確認 {amount(data.summary.performanceByBasis.pv.pending)} PV</span></article>
                  <article><small>待入帳獎金</small><strong>{money(data.summary.pendingReward)}</strong></article>
                  <article><small>已入帳獎金</small><strong>{money(data.summary.releasedReward)}</strong></article>
                </section>

                <section className="retail-promotion-rules">
                  <h3>規則簡介</h3>
                  <p>朋友透過你的分享連結進站，以訪客身分完成有效訂單後，該筆訂單會列入你的推廣零售業績。</p>
                  <p>已登入會員購買時，該筆消費仍屬於會員自己的消費；未登入會員以訪客方式購買時，才視為訪客訂單。</p>
                  <p>訂單建立時會固定分享來源、計算基礎與比例，之後不會重新改寫。</p>
                </section>

                <section className="retail-promotion-history">
                  <h3>推廣零售紀錄</h3>
                  {data.history.length ? data.history.map((item) => <article key={item.rewardId}>
                    <div><time>{shortDate(item.date)}</time><strong>訪客訂單 {item.orderReference}</strong><span>{item.calculationBasis === "pv" ? `有效 ${data.settings.pointDisplayName} ${amount(item.calculationBaseValue)} PV` : `有效業績 ${money(item.calculationBaseValue)}`}</span></div>
                    <div><span>比例 {item.rewardRate}%</span><strong>{money(item.rewardAmount)}</strong><span className={`is-${item.status}`}>{statusLabel(item.status)}</span>{item.status === "scheduled" ? <small>預計 {item.releaseEligibleBusinessDate.replaceAll("-", "/")} 可發放</small> : null}</div>
                  </article>) : <div className="member-commerce-empty compact"><strong>目前還沒有推廣零售紀錄</strong><p>未登入訪客透過有效分享連結完成購買後，紀錄會顯示在這裡。</p></div>}
                </section>
              </div>
            </div>
          </dialog>
        </>}
      </div>
    </section>
  );
}
