"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import MemberReferralOrgChart, { type ReferralOrgChartData } from "./MemberReferralOrgChart";
import MemberQualificationProgress from "./MemberQualificationProgress";

type Center = {
  referralCode: string;
  referralUrl: string;
  pointDisplayName: string;
  pvDisclosure: string | null;
  qualificationProgress: ComponentProps<typeof MemberQualificationProgress>["progress"];
  displayRules: {
    pointDisplayName: string;
    pvRewardMoneyValue: number;
    payoutQualification: {
      mode: "general" | "subscription" | "either" | "both";
      qualificationBasis: "money" | "pv";
      generalMember: { windowDays: number; threshold: number };
      activeSubscriptionMember: { windowDays: number; threshold: number };
    };
    baseWaitingDays: number;
    returnProtectionDays: number;
  };
  summaries: Array<{
    level: number;
    members: number;
    pendingCredit: number;
    releasedCredit: number;
    aggregateEligibleSpend: number;
  }>;
  nodes: Array<{
    memberNumber: string;
    level: number;
    parentMemberNumber: string;
    directReferralCount: number;
    teamCount: number;
  }>;
  orgChart: ReferralOrgChartData;
  rewards: Array<{
    rewardId: string;
    sourceOrderNumber: string;
    sourceOrderCreatedAt: string | null;
    sourceMemberNumber: string;
    sourceItems: Array<{ name: string; optionLabel: string; optionDetail: string; preparationLabel: string; quantity: number }>;
    referralLevel: number;
    rewardType: string;
    calculationMode: string;
    effectivePV: number;
    rewardRate: number;
    rewardPV: number;
    creditAmount: number;
    projectedCreditAmount: number;
    selfPurchaseTierSnapshot: {
      rules: {
        thresholdBasis: "paid_amount" | "pv";
        accumulationBasis: "single_order" | "rolling_period";
        calculationMethod: "whole_order" | "marginal";
        rollingWindowDays: number;
        tiers: Array<{ threshold: number; rewardRate: number }>;
      };
      latestResult: {
        priorAmount: number;
        currentAmount: number;
        attainedAmount: number;
        effectiveRewardRate: number;
        rawReward: number;
        breakdown: Array<{ threshold: number; rewardRate: number; amount: number; reward: number }>;
      };
    } | null;
    status: string;
    cancellationReason: string | null;
    qualificationStatus: string;
    qualificationAuthority:
      | "legacy_order"
      | "qualification_coverage"
      | "self_purchase_direct";
    qualificationCoverage: {
      qualificationRoundId: string;
      qualificationAt: string;
      coverageStartsAt: string;
      coverageEndsAt: string;
    } | null;
    qualificationMaturation: {
      maturesAt: string;
      maturedAt: string;
    } | null;
    qualificationExpiresAt: string | null;
    qualificationOrderNumber: string | null;
    qualificationOrderCreatedAt: string | null;
    qualificationOrderFinalState: string | null;
    qualificationQualifiedAt: string | null;
    successfulPickupBusinessDate: string | null;
    releaseEligibleBusinessDate: string | null;
    releasedAt: string | null;
  }>;
};

const pointValue = (value: number, label: string) => `${value.toLocaleString("zh-TW")} ${label}`;
const creditValue = (value: number) => `${value.toLocaleString("zh-TW")} 元`;
const formatDate = (value: string | null) => {
  if (!value) return "日期未記錄";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10).replaceAll("-", "/");
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
};

const taipeiMonthKey = (value: Date | string) => {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return year && month ? `${year}-${month}` : "";
};

function rewardStatusLabel(
  reward: { status: string; cancellationReason: string | null },
  qualificationLabel: string,
) {
  if (reward.status === "released") return "已入帳 ✓";
  if (reward.status === "reversed") return "獎勵已沖回";
  if (reward.status === "cancelled") {
    if (reward.cancellationReason === "monthly_cap_exhausted_at_release") return "本月推薦獎勵上限已達";
    if (reward.cancellationReason === "source_transaction_reversed_before_release") return "來源交易取消／退款，獎勵已取消";
    return "獎勵已取消";
  }
  return qualificationLabel;
}

export default function MemberReferralCenter() {
  const [data, setData] = useState<Center | null>(null);
  const [message, setMessage] = useState("");
  const [teamPath, setTeamPath] = useState<Array<{ memberNumber: string; level: number }>>([]);
  const [rewardFilter, setRewardFilter] = useState<"all" | "pending" | "released">("all");
  const [rewardLevel, setRewardLevel] = useState(0);
  const [rewardPage, setRewardPage] = useState(1);
  const [orgChartOpen, setOrgChartOpen] = useState(false);
  const [teamDetailsOpen, setTeamDetailsOpen] = useState(false);
  const [rewardDetailsOpen, setRewardDetailsOpen] = useState(false);
  const teamDialogRef = useRef<HTMLDialogElement>(null);
  const rewardDialogRef = useRef<HTMLDialogElement>(null);
  const teamTriggerRef = useRef<HTMLButtonElement>(null);
  const rewardTriggerRef = useRef<HTMLButtonElement>(null);
  const rewardsPerPage = 10;

  useEffect(() => {
    fetch("/api/member/referral")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "推薦資料暫時無法讀取");
        return result;
      })
      .then(setData)
      .catch((error) => setMessage(error instanceof Error ? error.message : "推薦資料暫時無法讀取"));
  }, []);

  useEffect(() => {
    const dialog = teamDialogRef.current;
    if (!dialog) return;
    if (teamDetailsOpen && !dialog.open) dialog.showModal();
    if (!teamDetailsOpen && dialog.open) dialog.close();
  }, [teamDetailsOpen]);

  useEffect(() => {
    const dialog = rewardDialogRef.current;
    if (!dialog) return;
    if (rewardDetailsOpen && !dialog.open) dialog.showModal();
    if (!rewardDetailsOpen && dialog.open) dialog.close();
  }, [rewardDetailsOpen]);

  if (!data) {
    return <section className="member-commerce-section"><div className="member-section-head"><div><p className="eyebrow dark">REFERRAL</p><h2>我的推薦</h2></div></div><p>{message || "讀取中…"}</p></section>;
  }

  const displayPointName = /^[A-Za-z]+$/.test(data.pointDisplayName || "")
    ? data.pointDisplayName.toUpperCase()
    : (data.pointDisplayName || "KD點");
  const directMembers = data.summaries[0]?.members ?? 0;
  const rootMemberNumber = data.nodes.find((node) => node.level === 1)?.parentMemberNumber ?? "";
  const currentTeamParent = teamPath.at(-1) ?? null;
  const currentParentNumber = currentTeamParent?.memberNumber ?? rootMemberNumber;
  const currentTeamLevel = currentTeamParent ? currentTeamParent.level + 1 : 1;
  const visibleNodes = data.nodes.filter((node) => node.level === currentTeamLevel && node.parentMemberNumber === currentParentNumber);

  const releasedRewards = data.rewards.filter((reward) => reward.status === "released");
  const pendingRewards = data.rewards.filter(
    (reward) => reward.status === "scheduled" && reward.qualificationStatus !== "expired",
  );
  const releasedRewardPoints = releasedRewards.reduce((sum, reward) => sum + reward.rewardPV, 0);
  const pendingRewardPoints = pendingRewards.reduce((sum, reward) => sum + reward.rewardPV, 0);
  const releasedRewardCredit = releasedRewards.reduce((sum, reward) => sum + reward.creditAmount, 0);
  const pendingRewardCredit = pendingRewards.reduce((sum, reward) => sum + reward.projectedCreditAmount, 0);
  const totalRewardPoints = releasedRewardPoints + pendingRewardPoints;
  const currentTaipeiMonth = taipeiMonthKey(new Date());
  const currentMonthRewardPoints = releasedRewards
    .filter((reward) => reward.releasedAt && taipeiMonthKey(reward.releasedAt) === currentTaipeiMonth)
    .reduce((sum, reward) => sum + reward.rewardPV, 0);

  const filteredRewards = data.rewards.filter((reward) => {
    const statusMatch = rewardFilter === "all"
      || (rewardFilter === "released" && reward.status === "released")
      || (
        rewardFilter === "pending"
        && reward.status === "scheduled"
        && reward.qualificationStatus !== "expired"
      );
    return statusMatch && (rewardLevel === 0 || reward.referralLevel === rewardLevel);
  });
  const rewardPageCount = Math.max(1, Math.ceil(filteredRewards.length / rewardsPerPage));
  const safeRewardPage = Math.min(rewardPage, rewardPageCount);
  const pagedRewards = filteredRewards.slice((safeRewardPage - 1) * rewardsPerPage, safeRewardPage * rewardsPerPage);

  return (
    <section className="member-commerce-section member-referral-center-v2">
      <div className="member-section-head"><div><p className="eyebrow dark">MEMBER REWARDS</p><h2>會員回饋</h2><p>先看目前結果，需要時再開啟資格、計算與歷史明細。</p></div></div>
      {message && <p className="member-notice" role="status" aria-live="polite">{message}</p>}
      <div className="member-referral-primary-grid">
        <article className="member-referral-primary-card">
          <div><p className="eyebrow dark">MY REWARDS</p><h3>我的回饋</h3></div>
          <dl><div><dt>待入帳</dt><dd>NT$ {pendingRewardCredit.toLocaleString("zh-TW")}</dd></div><div><dt>已入帳</dt><dd>NT$ {releasedRewardCredit.toLocaleString("zh-TW")}</dd></div></dl>
          <button ref={rewardTriggerRef} type="button" onClick={() => setRewardDetailsOpen(true)}>查看明細</button>
        </article>
        <article className="member-referral-primary-card">
          <div><p className="eyebrow dark">MY TEAM</p><h3>我的推薦團隊</h3></div>
          <dl><div><dt>直接推薦</dt><dd>{directMembers} 人</dd></div><div><dt>團隊人數</dt><dd>{data.nodes.length} 人</dd></div></dl>
          <button ref={teamTriggerRef} type="button" onClick={() => setTeamDetailsOpen(true)}>查看團隊</button>
        </article>
      </div>

      <dialog ref={teamDialogRef} className="member-ia-dialog" aria-labelledby="member-team-dialog-title" onClose={() => { setTeamDetailsOpen(false); window.setTimeout(() => teamTriggerRef.current?.focus(), 0); }}>
        <div className="member-ia-dialog-shell">
          <header><div><p className="eyebrow dark">MY TEAM</p><h2 id="member-team-dialog-title">我的推薦團隊</h2></div><button type="button" aria-label="關閉推薦團隊" onClick={() => teamDialogRef.current?.close()}>×</button></header>
          <div className="member-ia-dialog-body">
      <section className="member-referral-team-v2">
        <div className="member-referral-team-title-row">
          <div className="member-referral-subhead"><p className="eyebrow dark">MY TEAM</p><h3>我的推薦團隊</h3><p>先看自己的第一代；也可以打開三代樹狀組織圖，點選會員後以他為中心繼續往下查看。</p></div>
          <button type="button" className="member-org-open-button" onClick={() => setOrgChartOpen(true)}>查看組織圖</button>
        </div>
        <div className="member-team-explorer-head">
          <div className="member-team-explorer-context">
            {teamPath.length ? <button type="button" className="member-team-back member-team-back-top" onClick={() => setTeamPath(teamPath.slice(0, -1))}>← 返回上一層</button> : <span className="member-team-root-label">我的第一代</span>}
            <div className="member-team-breadcrumb" aria-label="推薦團隊瀏覽路徑">
              <button type="button" className={!teamPath.length ? "is-current" : ""} onClick={() => setTeamPath([])}>我的推薦團隊</button>
              {teamPath.map((item, index) => <span key={`${item.memberNumber}:${index}`}><b>›</b><button type="button" className={index === teamPath.length - 1 ? "is-current" : ""} onClick={() => setTeamPath(teamPath.slice(0, index + 1))}>{item.memberNumber}</button></span>)}
            </div>
            {currentTeamParent ? <div className="member-team-current-card"><div><small>目前查看</small><strong>會員 {currentTeamParent.memberNumber}</strong><span>你的第 {currentTeamParent.level} 代會員</span></div><div><small>他的直接推薦</small><strong>{visibleNodes.length} 人</strong></div></div> : null}
          </div>
          <span className="member-team-level-count">你的第 {currentTeamLevel} 代 · {visibleNodes.length} 人</span>
        </div>
        {visibleNodes.length ? <div className="member-referral-list-v2 member-team-explorer-list">{visibleNodes.map((node) => <button type="button" className="member-team-node" key={`${node.level}:${node.memberNumber}`} onClick={() => node.directReferralCount > 0 && setTeamPath([...teamPath, { memberNumber: node.memberNumber, level: node.level }])}>
          <div><strong>會員 {node.memberNumber}</strong><small>你的第 {node.level} 代</small></div>
          <div className="member-team-node-counts"><span>直推 <b>{node.directReferralCount}</b> 人</span><span>團隊 <b>{node.teamCount}</b> 人</span>{node.directReferralCount > 0 ? <em>查看下線 ›</em> : <em className="is-empty">尚無下線</em>}</div>
        </button>)}</div> : <div className="member-commerce-empty compact"><strong>{currentTeamParent ? `會員 ${currentTeamParent.memberNumber} 目前沒有直接推薦會員` : "目前還沒有第一代推薦會員"}</strong><p>{currentTeamParent ? "可返回上一層繼續查看其他推薦會員。" : "分享給朋友後，完成會員加入就會在這裡顯示。"}</p></div>}
      </section>
          </div>
        </div>
      </dialog>
      <MemberReferralOrgChart open={orgChartOpen} data={data.orgChart} onClose={() => setOrgChartOpen(false)} />

      <dialog ref={rewardDialogRef} className="member-ia-dialog member-reward-dialog" aria-labelledby="member-reward-ledger-title" onClose={() => { setRewardDetailsOpen(false); window.setTimeout(() => rewardTriggerRef.current?.focus(), 0); }}>
        <div className="member-ia-dialog-shell">
          <header><div><p className="eyebrow dark">REWARD DETAILS</p><h2 id="member-reward-ledger-title">推薦與會員回饋</h2></div><button type="button" aria-label="關閉回饋明細" onClick={() => rewardDialogRef.current?.close()}>×</button></header>
          <div className="member-ia-dialog-body">
      <section className="member-referral-reward-ledger" aria-labelledby="member-reward-ledger-title">
        <MemberQualificationProgress progress={data.qualificationProgress} />
        <div className="member-referral-subhead"><p className="eyebrow dark">REWARD HISTORY</p><h3>回饋總覽</h3><p>回饋點數、資格狀態與折抵價值均直接取自正式 Reward Engine；會員頁不自行重算帳務。</p></div>
        <div className="member-reward-summary-grid" aria-label="回饋點數總覽">
          <article><small>累計回饋點數</small><strong>{pointValue(totalRewardPoints, displayPointName)}</strong><span>已入帳＋有效待入帳</span></article>
          <article><small>已入帳點數</small><strong>{pointValue(releasedRewardPoints, displayPointName)}</strong><span>{releasedRewards.length} 筆</span></article>
          <article><small>待入帳點數</small><strong>{pointValue(pendingRewardPoints, displayPointName)}</strong><span>{pendingRewards.length} 筆</span></article>
          <article><small>本月已入帳</small><strong>{pointValue(currentMonthRewardPoints, displayPointName)}</strong><span>本月正式發放</span></article>
        </div>
        {data.pvDisclosure ? <details className="member-referral-policy"><summary>推薦回饋如何計算？</summary><p>{data.pvDisclosure}</p><p>加入推薦團隊不等於立即產生回饋；仍須依活動、消費與成功取貨條件判定。</p></details> : null}
        <div className="member-reward-details">
          <div className="member-reward-ledger-heading"><div><p className="eyebrow dark">REWARD DETAILS</p><h4>回饋明細</h4><p>查看自己的續購與推薦消費所產生的回饋與入帳狀態。</p></div><span>共 {data.rewards.length} 筆</span></div>
        {data.rewards.length ? <>
          <div className="member-reward-filters" aria-label="回饋紀錄篩選">
            <div>{(["all", "pending", "released"] as const).map((filter) => {
              const count = filter === "all" ? data.rewards.length : filter === "released" ? releasedRewards.length : pendingRewards.length;
              return <button type="button" key={filter} className={rewardFilter === filter ? "is-active" : ""} onClick={() => { setRewardFilter(filter); setRewardPage(1); }}>{filter === "all" ? "全部" : filter === "pending" ? "待入帳" : "已入帳"} <span>{count}</span></button>;
            })}</div>
            <select aria-label="依推薦代數篩選" value={rewardLevel} onChange={(event) => { setRewardLevel(Number(event.target.value)); setRewardPage(1); }}>
              <option value={0}>全部代數</option>
              {data.summaries.map((summary) => <option key={summary.level} value={summary.level}>第 {summary.level} 代</option>)}
            </select>
          </div>
          {pagedRewards.length ? <div className="member-reward-ledger-list">{pagedRewards.map((reward) => {
          const isDirectSelfPurchase =
            reward.rewardType ===
              "self_purchase" &&
            reward.qualificationAuthority ===
              "self_purchase_direct";

          const isCoverageQualification =
            reward.qualificationAuthority ===
            "qualification_coverage";

          const hasQualificationCoverage =
            isCoverageQualification &&
            Boolean(
              reward.qualificationCoverage,
            );

          const effectiveQualificationStatus =
            isDirectSelfPurchase
              ? "qualified"
              : hasQualificationCoverage
                ? "qualified"
                : reward.qualificationStatus;

          const qualificationLabel =
            isDirectSelfPurchase
              ? "安全等待・等待入帳"
              : effectiveQualificationStatus ===
                  "awaiting_order"
                ? "待取得回饋資格"
                : effectiveQualificationStatus ===
                    "awaiting_completion"
                  ? "等待資格訂單完成"
                  : effectiveQualificationStatus ===
                      "qualified"
                    ? "資格已確認・等待入帳"
                    : effectiveQualificationStatus ===
                        "expired"
                      ? "資格已逾期"
                      : "歷史回饋";

          const qualificationDisplayUntil =
            isDirectSelfPurchase
              ? null
              : hasQualificationCoverage
                ? reward
                    .qualificationCoverage
                    ?.coverageEndsAt ?? null
                : reward
                    .qualificationExpiresAt;
          const itemText = reward.sourceItems.length ? reward.sourceItems.map((item) => `${item.name}${item.optionLabel ? `・${item.optionLabel}` : ""}${item.optionDetail ? ` ${item.optionDetail}` : ""}${item.preparationLabel ? `・${item.preparationLabel}` : ""} × ${item.quantity}`).join("、") : "來源訂單商品明細未保留";
          const tierSnapshot = reward.rewardType === "self_purchase" ? reward.selfPurchaseTierSnapshot : null;
          const tierResult = tierSnapshot?.latestResult ?? null;
          const tierUnit = tierSnapshot?.rules.thresholdBasis === "pv" ? displayPointName : "元";
          const basis = tierSnapshot && tierResult
            ? tierSnapshot.rules.calculationMethod === "marginal"
              ? `本次 ${tierResult.currentAmount.toLocaleString("zh-TW")} ${tierUnit}｜分段計算｜最高級距 ${tierResult.effectiveRewardRate.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}%`
              : `本次 ${tierResult.currentAmount.toLocaleString("zh-TW")} ${tierUnit}｜整筆套用 ${tierResult.effectiveRewardRate.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}%`
            : reward.calculationMode === "pv"
              ? `${reward.effectivePV.toLocaleString("zh-TW")} ${displayPointName} × ${reward.rewardRate.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}%`
              : `依正式回饋規則 × ${reward.rewardRate.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}%`;
          const tierBreakdownText = tierSnapshot && tierResult
            ? tierSnapshot.rules.calculationMethod === "marginal"
              ? tierResult.breakdown
                  .map((part) => `${part.amount.toLocaleString("zh-TW")} ${tierUnit} × ${part.rewardRate.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}% = ${part.reward.toLocaleString("zh-TW", { maximumFractionDigits: 2 })} ${displayPointName}`)
                  .join("；")
              : `${tierResult.currentAmount.toLocaleString("zh-TW")} ${tierUnit} × ${tierResult.effectiveRewardRate.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}% = ${tierResult.rawReward.toLocaleString("zh-TW", { maximumFractionDigits: 2 })} ${displayPointName}`
            : null;
          const q = data.displayRules.payoutQualification;

          const qualificationMetric =
            q.qualificationBasis === "pv"
              ? `商品 ${displayPointName}`
              : "有效消費";

          const qualificationThreshold = (value: number) =>
            q.qualificationBasis === "pv"
              ? pointValue(value, displayPointName)
              : creditValue(value);

          const qualificationRuleText = q.mode === "general"
            ? `最近 ${q.generalMember.windowDays} 天累積${qualificationMetric}達 ${qualificationThreshold(q.generalMember.threshold)}。`
            : q.mode === "subscription"
              ? `有效定期配送會員最近 ${q.activeSubscriptionMember.windowDays} 天累積${qualificationMetric}達 ${qualificationThreshold(q.activeSubscriptionMember.threshold)}。`
              : q.mode === "both"
                ? `需同時符合一般會員最近 ${q.generalMember.windowDays} 天累積${qualificationMetric}達 ${qualificationThreshold(q.generalMember.threshold)}，以及有效定期配送會員最近 ${q.activeSubscriptionMember.windowDays} 天累積${qualificationMetric}達 ${qualificationThreshold(q.activeSubscriptionMember.threshold)}。`
                : `一般會員最近 ${q.generalMember.windowDays} 天累積${qualificationMetric}達 ${qualificationThreshold(q.generalMember.threshold)}，或有效定期配送會員最近 ${q.activeSubscriptionMember.windowDays} 天累積${qualificationMetric}達 ${qualificationThreshold(q.activeSubscriptionMember.threshold)}，任一條件符合即可。`;
          const qualificationDetail =
            isDirectSelfPurchase
              ? `本人消費回饋不需要符合推薦獎勵領取資格。訂單完成後即進入安全等待期；基礎等待 ${data.displayRules.baseWaitingDays} 天＋退貨保護 ${data.displayRules.returnProtectionDays} 天。`
              : hasQualificationCoverage
                ? `本筆回饋已由目前有效的推薦回饋資格涵蓋，資格已確認。現在進入安全等待期；基礎等待 ${data.displayRules.baseWaitingDays} 天＋退貨保護 ${data.displayRules.returnProtectionDays} 天。`
              : effectiveQualificationStatus ===
                  "awaiting_order"
                ? "目前尚未取得本筆回饋所需的有效資格，系統會在符合條件後自動判定。"
                : effectiveQualificationStatus ===
                    "awaiting_completion"
                  ? `資格訂單${reward.qualificationOrderNumber ? ` ${reward.qualificationOrderNumber}` : ""} 已建立，正在等待訂單完成。`
                  : effectiveQualificationStatus ===
                      "qualified"
                    ? `資格已確認，現在進入安全等待期；基礎等待 ${data.displayRules.baseWaitingDays} 天＋退貨保護 ${data.displayRules.returnProtectionDays} 天。`
                    : effectiveQualificationStatus ===
                        "expired"
                      ? "本筆回饋資格期限已結束。"
                      : "本筆依建立時保存的歷史回饋規則處理。";

          const lifecycleStage =
            reward.status === "released"
              ? 4
              : effectiveQualificationStatus ===
                  "qualified"
                ? 3
                : 2;

          const lifecycleLabels =
            isDirectSelfPurchase
              ? [
                  "回饋產生",
                  "訂單完成",
                  "安全等待",
                  "正式入帳",
                ]
              : [
                  "回饋產生",
                  effectiveQualificationStatus ===
                  "qualified"
                    ? "資格已確認"
                    : "等待資格確認",
                  "安全等待",
                  "正式入帳",
                ];
          const rewardCanStillRelease =
            reward.status === "scheduled"
            && reward.qualificationStatus !== "expired";
          const actualCreditValue =
            reward.status === "released" || reward.status === "reversed"
              ? reward.creditAmount
              : reward.projectedCreditAmount;
          const creditDisplayLabel =
            reward.status === "released"
              ? "已入帳折抵額"
              : reward.status === "reversed"
                ? "已沖回折抵額"
                : rewardCanStillRelease
                  ? "預計折抵價值"
                  : "原預估折抵價值";
          const creditDisplayNote =
            reward.status === "released"
              ? "本筆已正式入帳，可用狀態仍以抵用金帳本為準"
              : reward.status === "reversed"
                ? "本筆曾入帳，後續已依正式規則沖回"
                : rewardCanStillRelease
                  ? `目前換算設定參考：1 ${displayPointName} = ${data.displayRules.pvRewardMoneyValue.toLocaleString("zh-TW")} 元`
                  : "僅保留歷史計算結果，不代表目前仍可入帳";
          return <article className="member-reward-ledger-card member-reward-ledger-item" key={reward.rewardId}>
            <header className="member-reward-ledger-meta"><time>{formatDate(reward.releasedAt || reward.sourceOrderCreatedAt)}</time><span className={`member-reward-status is-${reward.status}`}>{rewardStatusLabel(reward, qualificationLabel)}</span></header>
            <div className="member-reward-ledger-body">
              <div className="member-reward-ledger-title-row">
                <div><small>{reward.rewardType === "self_purchase" ? "MEMBER REWARD" : "REFERRAL REWARD"}</small><h4>{reward.rewardType === "self_purchase" ? "會員續購回饋" : reward.rewardType === "new_referral" ? `第 ${reward.referralLevel} 層首次消費推薦回饋` : reward.rewardType === "repeat_purchase" ? `第 ${reward.referralLevel} 層一般續購推薦回饋` : `第 ${reward.referralLevel} 層定期購續期回饋`}</h4></div>
                <span className="member-reward-generation">{reward.rewardType === "self_purchase" ? "自己的消費" : `你的第 ${reward.referralLevel} 層`}</span>
              </div>
              <div className="member-reward-order-info">
                <p className="member-reward-source-member"><b>{reward.rewardType === "self_purchase" ? "消費會員" : "來源會員"}</b><strong>{reward.sourceMemberNumber}</strong></p>
                <p className="member-reward-consumption"><b>消費內容</b><span>{itemText}</span></p>
              </div>
              <div className="member-reward-ledger-math member-reward-ledger-bottom">
                <span><small>回饋計算</small>{basis}</span>
                <strong><small>本筆回饋</small>+ {pointValue(reward.rewardPV, displayPointName)}</strong>
              </div>

              <details className="member-reward-transparency" open={rewardCanStillRelease}>
                <summary>這筆 {pointValue(reward.rewardPV, displayPointName)} 怎麼來？</summary>

                <div className="member-reward-transparency-grid">
                  <div>
                    <small>① 回饋來源</small>
                    <strong>{reward.rewardType === "self_purchase" ? "自己的消費" : `第 ${reward.referralLevel} 層推薦消費`}</strong>
                    <span>{basis}</span>
                    {tierBreakdownText ? <span>{tierBreakdownText}</span> : null}
                  </div>
                  <div>
                    <small>② 預計取得</small>
                    <strong>{pointValue(reward.rewardPV, displayPointName)}</strong>
                    <span>點數依正式 Reward Engine 保存結果顯示</span>
                  </div>
                  <div>
                    <small>③ {creditDisplayLabel}</small>
                    <strong>{creditValue(actualCreditValue)}</strong>
                    <span>{creditDisplayNote}</span>
                  </div>
                </div>

                <div className="member-reward-qualification-explain">
                  <strong>
                    {isDirectSelfPurchase
                      ? "本人消費回饋狀態"
                      : effectiveQualificationStatus === "qualified"
                        ? "本筆回饋資格狀態"
                        : effectiveQualificationStatus === "expired"
                          ? "資格結果"
                          : "我要怎麼符合資格？"}
                  </strong>

                  {isDirectSelfPurchase ? (
                    <p>
                      <b>資格要求：</b>
                      不需要符合推薦獎勵領取資格。
                    </p>
                  ) : (
                    <p>
                      <b>目前規則參考：</b>
                      {qualificationRuleText}
                    </p>
                  )}

                  <p>
                    <b>目前狀態：</b>
                    {qualificationDetail}
                  </p>

                  {qualificationDisplayUntil ? (
                    <p>
                      <b>
                        {hasQualificationCoverage
                          ? "資格有效至："
                          : "資格期限："}
                      </b>
                      {formatDate(
                        qualificationDisplayUntil,
                      )}
                    </p>
                  ) : null}

                  {reward.releaseEligibleBusinessDate &&
                  reward.status === "scheduled" ? (
                    <p>
                      <b>預計可發放日期：</b>
                      {reward.releaseEligibleBusinessDate.replaceAll(
                        "-",
                        "/",
                      )}
                    </p>
                  ) : null}
                </div>

                <div className="member-reward-lifecycle" aria-label="回饋入帳進度">
                  {lifecycleLabels.map((label, index) => {
                    const step = index + 1;
                    return <span key={label} className={step < lifecycleStage ? "is-done" : step === lifecycleStage ? "is-current" : ""}><i>{step < lifecycleStage ? "✓" : step}</i>{label}</span>;
                  })}
                </div>

                <small className="member-reward-conversion-note">
                  實際折抵價值以這筆回饋在 Reward Engine 中已保存的正式結果為準；之後修改後台換算比例，不會在會員頁自行重算歷史回饋。
                </small>
              </details>
            </div>
          </article>;
        })}</div> : <div className="member-commerce-empty compact"><strong>沒有符合目前篩選條件的回饋紀錄</strong><p>可切換狀態或代數查看其他紀錄。</p></div>}
          {rewardPageCount > 1 ? <nav className="member-reward-pagination" aria-label="推薦回饋分頁"><button type="button" disabled={safeRewardPage <= 1} onClick={() => setRewardPage(Math.max(1, safeRewardPage - 1))}>上一頁</button><span>第 {safeRewardPage} / {rewardPageCount} 頁</span><button type="button" disabled={safeRewardPage >= rewardPageCount} onClick={() => setRewardPage(Math.min(rewardPageCount, safeRewardPage + 1))}>下一頁</button></nav> : null}
        </> : <div className="member-commerce-empty compact"><strong>目前還沒有推薦回饋紀錄</strong><p>推薦會員產生符合規則的有效消費後，回饋紀錄會顯示在這裡。</p></div>}
        </div>
      </section>
          </div>
        </div>
      </dialog>
    </section>
  );
}
