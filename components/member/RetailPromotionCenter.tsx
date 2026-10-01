"use client";

import { MemberCopyValue, MemberCopyElement } from "@/components/member/MemberCenterCopyProvider";

import { useEffect, useRef, useState } from "react";
import RewardSourceOrderSummaryCard from "./RewardSourceOrderSummaryCard";
import RewardWaitingDisclosure from "./RewardWaitingDisclosure";
import {
  compactRewardDisplayStatus,
  rewardTimingText,
  type RewardSourceOrderSummary,
  type RewardWaitingExplanation,
} from "@/lib/memberRewardPresentation";

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
    displayStatus?: string;
    waitingExplanation?: RewardWaitingExplanation;
    sourceOrderSummary?: RewardSourceOrderSummary | null;
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
          <p className="eyebrow dark"><MemberCopyValue value={"RETAIL PROMOTION"} /></p>
          <h2><MemberCopyValue value={"推廣零售"} /></h2>
          {data ? <p>{data.settings.enabled ? <><MemberCopyValue value={"朋友透過你在「推薦」中的分享連結，以訪客身分完成購買，即可依 "} /><strong>{data.settings.rewardRate}%</strong><MemberCopyValue value={" 比例獲得推廣零售獎金。"} /></> : "目前未啟用新的推廣零售獎金；分享功能仍集中在「推薦」。"}</p> : <p><MemberCopyValue value={"訪客購買帶來的推廣零售成果會顯示在這裡；分享請前往「推薦」。"} /></p>}
        </div>
        {error ? <p className="form-error"><MemberCopyValue value={error} /></p> : !data ? <p><MemberCopyValue value={"讀取中…"} /></p> : <>
          <MemberCopyElement as="div" className="retail-promotion-reward-summary" aria-label="推廣零售獎金摘要">
            <article><small><MemberCopyValue value={"待入帳"} /></small><strong>{money(data.summary.pendingReward)}</strong></article>
            <article><small><MemberCopyValue value={"已入帳"} /></small><strong>{money(data.summary.releasedReward)}</strong></article>
          </MemberCopyElement>
          <div className="retail-promotion-actions">
            <button ref={detailsTriggerRef} className="retail-promotion-detail-action" type="button" onClick={() => setDetailsOpen(true)}><MemberCopyValue value={"查看詳情"} /></button>
          </div>
          <dialog ref={dialogRef} className="retail-promotion-dialog" aria-labelledby="retail-promotion-dialog-title" onClose={finishClosingDetails}>
            <div className="retail-promotion-dialog-shell">
              <header>
                <div><p className="eyebrow dark"><MemberCopyValue value={"RETAIL PROMOTION"} /></p><h2 id="retail-promotion-dialog-title"><MemberCopyValue value={"推廣零售詳情"} /></h2></div>
                <MemberCopyElement as="button" type="button" aria-label="關閉推廣零售詳情" onClick={() => dialogRef.current?.close()}>×</MemberCopyElement>
              </header>
              <div className="retail-promotion-detail-body">
                <MemberCopyElement as="section" className="retail-promotion-detail-overview" aria-label="目前推廣零售規則">
                  <dl>
                    <div><dt><MemberCopyValue value={"目前獎金比例"} /></dt><dd>{data.settings.rewardRate}%</dd></div>
                    <div><dt><MemberCopyValue value={"計算基礎"} /></dt><dd><MemberCopyValue value={data.settings.calculationBasis === "pv" ? `${data.settings.pointDisplayName}（PV）` : "實付商品金額"} /></dd></div>
                    <div><dt><MemberCopyValue value={"分享有效期間"} /></dt><dd>{data.settings.attributionWindowDays}<MemberCopyValue value={" 天"} /></dd></div>
                  </dl>
                  <p><MemberCopyValue value={data.settings.calculationBasis === "pv" ? `依訪客訂單的有效 ${data.settings.pointDisplayName}（PV）× 獎金比例計算，再依每 1 ${data.settings.pointDisplayName} = NT$ ${amount(data.settings.pvRewardMoneyValue)} 換算抵用金。` : "依訪客訂單的有效商品實付金額 × 獎金比例計算；運費不列入計算。"} /></p>
                </MemberCopyElement>

                <MemberCopyElement as="section" className="retail-promotion-detail-kpis" aria-label="推廣零售完整數據">
                  <article><small><MemberCopyValue value={"實付商品業績"} /></small><strong>{money(data.summary.performanceByBasis.paidAmount.completed)}</strong><span><MemberCopyValue value={"待確認 "} />{money(data.summary.performanceByBasis.paidAmount.pending)}</span></article>
                  <article><small>{data.settings.pointDisplayName}<MemberCopyValue value={" 業績"} /></small><strong>{amount(data.summary.performanceByBasis.pv.completed)}<MemberCopyValue value={" PV"} /></strong><span><MemberCopyValue value={"待確認 "} />{amount(data.summary.performanceByBasis.pv.pending)}<MemberCopyValue value={" PV"} /></span></article>
                  <article><small><MemberCopyValue value={"待入帳獎金"} /></small><strong>{money(data.summary.pendingReward)}</strong></article>
                  <article><small><MemberCopyValue value={"已入帳獎金"} /></small><strong>{money(data.summary.releasedReward)}</strong></article>
                </MemberCopyElement>

                <section className="retail-promotion-rules">
                  <h3><MemberCopyValue value={"規則簡介"} /></h3>
                  <p><MemberCopyValue value={"朋友透過你的分享連結進站，以訪客身分完成有效訂單後，該筆訂單會列入你的推廣零售業績。"} /></p>
                  <p><MemberCopyValue value={"已登入會員購買時，該筆消費仍屬於會員自己的消費；未登入會員以訪客方式購買時，才視為訪客訂單。"} /></p>
                  <p><MemberCopyValue value={"訂單建立時會固定分享來源、計算基礎與比例，之後不會重新改寫。"} /></p>
                </section>

                <section className="retail-promotion-history">
                  <h3><MemberCopyValue value={"推廣零售紀錄"} /></h3>
                  {data.history.length ? data.history.map((item) => item.sourceOrderSummary ? (
                    <RewardSourceOrderSummaryCard
                      key={`${item.sourceOrderSummary.orderNumber}:${item.date}`}
                      summary={item.sourceOrderSummary}
                      pointDisplayName={data.settings.pointDisplayName}
                      title="推廣零售回饋"
                    />
                  ) : <article key={`${item.orderReference}:${item.date}:${item.status}`}>
                    <div><time>{shortDate(item.date)}</time><strong><MemberCopyValue value={"訪客訂單 "} />{item.orderReference}</strong><span><MemberCopyValue value={item.calculationBasis === "pv" ? `有效 ${data.settings.pointDisplayName} ${amount(item.calculationBaseValue)} PV` : `有效業績 ${money(item.calculationBaseValue)}`} /></span></div>
                    <div><span><MemberCopyValue value={"比例 "} />{item.rewardRate}%</span><strong>{money(item.rewardAmount)}</strong><span className={`is-${item.status}`}>{item.displayStatus ? compactRewardDisplayStatus(item.displayStatus) : statusLabel(item.status)}</span>{item.waitingExplanation ? <small><MemberCopyValue value={rewardTimingText(item.waitingExplanation)} /></small> : item.status === "scheduled" ? <small><MemberCopyValue value={"預計 "} />{item.releaseEligibleBusinessDate.replaceAll("-", "/")}<MemberCopyValue value={" 入帳"} /></small> : null}<RewardWaitingDisclosure explanation={item.waitingExplanation} /></div>
                  </article>) : <div className="member-commerce-empty compact"><strong><MemberCopyValue value={"目前還沒有推廣零售紀錄"} /></strong><p><MemberCopyValue value={"未登入訪客透過有效分享連結完成購買後，紀錄會顯示在這裡。"} /></p></div>}
                </section>
              </div>
            </div>
          </dialog>
        </>}
      </div>
    </section>
  );
}
