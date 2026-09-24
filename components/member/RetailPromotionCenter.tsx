"use client";

import { useEffect, useState } from "react";

type RetailPromotionData = {
  settings: { enabled: boolean; rewardRate: number; attributionWindowDays: number };
  summary: { promotionSales: number; pendingPromotionSales: number; promotionReward: number; pendingReward: number; releasedReward: number };
  history: Array<{ rewardId: string; date: string; orderReference: string; eligibleSales: number; rewardRate: number; rewardAmount: number; status: "pending_completion" | "scheduled" | "released" | "cancelled" | "reversed"; releaseEligibleBusinessDate: string; releasedAt: string | null; ruleVersion: number }>;
};

const money = (value: number) => `NT$ ${value.toLocaleString("zh-TW")}`;
const date = (value: string) => new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
const statusLabel = (status: RetailPromotionData["history"][number]["status"]) => status === "pending_completion" ? "待訂單完成" : status === "scheduled" ? "待入帳" : status === "released" ? "已入帳" : status === "reversed" ? "已沖回" : "已取消";

export default function RetailPromotionCenter() {
  const [data, setData] = useState<RetailPromotionData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/member/retail-promotion", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "推廣零售資料暫時無法讀取");
        setData(result);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "推廣零售資料暫時無法讀取"));
  }, []);

  return (
    <section className="member-commerce-section retail-promotion-center" id="retail-promotion">
      <div className="member-section-head"><div><p className="eyebrow dark">RETAIL PROMOTION</p><h2>推廣零售</h2><p>分享公開商品或內容頁給尚未加入會員的訪客；訪客訂單成功完成後，依下單時保存的比例產生獎金。</p></div></div>
      {error ? <p className="form-error">{error}</p> : !data ? <p>讀取中…</p> : <>
        <div className="retail-promotion-policy"><strong>{data.settings.enabled ? `目前獎金比例 ${data.settings.rewardRate}%` : "目前未啟用推廣零售獎金"}</strong><span>最後一次有效分享來源保留 {data.settings.attributionWindowDays} 天；會員自己的訂單永遠算自己的消費。</span></div>
        <div className="retail-promotion-kpis">
          <article><small>推廣業績</small><strong>{money(data.summary.promotionSales)}</strong></article>
          <article><small>待確認推廣業績</small><strong>{money(data.summary.pendingPromotionSales)}</strong></article>
          <article><small>推廣零售獎金</small><strong>{money(data.summary.promotionReward)}</strong></article>
          <article><small>待入帳／已入帳</small><strong>{money(data.summary.pendingReward)} / {money(data.summary.releasedReward)}</strong></article>
        </div>
        <p className="retail-promotion-share-note">登入後瀏覽可分享的公開頁面，即可使用畫面上的「分享目前頁面」按鈕；系統會自動帶入你的正式分享碼。</p>
        <div className="retail-promotion-history">
          <h3>推廣零售紀錄</h3>
          {data.history.length ? data.history.map((item) => <article key={item.rewardId}>
            <div><time>{date(item.date)}</time><strong>訪客零售訂單 {item.orderReference}</strong><span>有效業績 {money(item.eligibleSales)}・獎金比例 {item.rewardRate}%</span></div>
            <div><strong>{money(item.rewardAmount)}</strong><span className={`is-${item.status}`}>{statusLabel(item.status)}</span><small>Rule v{item.ruleVersion}{item.status === "scheduled" ? `・預計 ${item.releaseEligibleBusinessDate.replaceAll("-", "/")} 可發放` : ""}</small></div>
          </article>) : <div className="member-commerce-empty compact"><strong>目前還沒有推廣零售紀錄</strong><p>只有未登入訪客透過有效分享連結建立並完成的訂單會出現在這裡。</p></div>}
        </div>
      </>}
    </section>
  );
}
