"use client";

import { MemberCopyValue, MemberCopyText, useMemberCopyKey, MemberCopyElement } from "@/components/member/MemberCenterCopyProvider";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import KdShareDialog from "./KdShareDialog";
import MemberReferralOrgChart, { type ReferralOrgChartData } from "./MemberReferralOrgChart";
import MemberQualificationProgress from "./MemberQualificationProgress";
import RetailPromotionCenter from "./RetailPromotionCenter";
import RewardLedgerCompactCard from "./RewardLedgerCompactCard";
import styles from "./MemberReferralExperience.module.css";
import {
  formatTaipeiMonthKey,
  sortRewardLedgerItems,
  type RewardSourceOrderItem,
  type RewardSourceOrderSummary,
  type RewardWaitingExplanation,
} from "@/lib/memberRewardPresentation";

export type MemberReferralCenterData = {
  referralCode: string;
  referralUrl: string;
  referrerMemberNumber: string | null;
  pointDisplayName: string;
  pvDisclosure: string | null;
  availableCreditBalance: number;
  rewardCreditSources: Array<{
    sourceCategory: "retail_promotion" | "referral" | "self_purchase";
    sourceLabel: "推廣零售" | "推薦回饋" | "自己的消費";
    sourceOrderNumber: string | null;
    creditedAmount: number;
    availableAmount: number;
    issuedAt: string;
    sourceOrderSummary: RewardSourceOrderSummary | null;
  }>;
  pendingRetailPromotionRewards: Array<{
    sourceLabel: "推廣零售";
    sourceOrderNumber: string | null;
    rewardPV: number | null;
    projectedCreditAmount: number;
    releaseEligibleBusinessDate: string;
    displayStatus: string;
    waitingExplanation: RewardWaitingExplanation;
    sourceOrderSummary: RewardSourceOrderSummary | null;
  }>;
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
      coverageEndsAt: string;
    } | null;
    qualificationExpiresAt: string | null;
    qualificationOrderNumber: string | null;
    qualificationOrderCreatedAt: string | null;
    qualificationOrderFinalState: string | null;
    qualificationQualifiedAt: string | null;
    successfulPickupBusinessDate: string | null;
    releaseEligibleBusinessDate: string | null;
    releasedAt: string | null;
    displayStatus: string;
    waitingExplanation: RewardWaitingExplanation;
    sourceOrderSummary: RewardSourceOrderSummary | null;
  }>;
};

type MemberReward = MemberReferralCenterData["rewards"][number];

type RewardLedgerRow = {
  stableKey: string;
  kind: "member" | "retail" | "credit";
  title: string;
  displayStatus: string;
  sourceOrderCreatedAt: string | null;
  sourceOrderNumber: string | null;
  sourceItems: RewardSourceOrderItem[];
  rewardPV: number | null;
  creditAmount: number;
  releaseEligibleBusinessDate: string | null;
  releasedAt: string | null;
  calculationBasis: "pv" | "paid_amount";
  calculationBaseValue: number | null;
  rewardRate: number | null;
  sourceOrderSummary: RewardSourceOrderSummary | null;
  waitingExplanation: RewardWaitingExplanation | null;
  sourceMemberNumber: string | null;
  referralLevel: number | null;
  reward: MemberReward | null;
};

const pointValue = (value: number, label: string) => `${value.toLocaleString("zh-TW")} ${label}`;
const creditValue = (value: number) => `${value.toLocaleString("zh-TW")} 元`;

export default function MemberReferralCenter({ initialData: data }: { initialData: MemberReferralCenterData }) {
  const copy = useMemberCopyKey();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [teamPath, setTeamPath] = useState<Array<{ memberNumber: string; level: number }>>([]);
  const [rewardFilter, setRewardFilter] = useState<"all" | "pending" | "released">("all");
  const [rewardLevel, setRewardLevel] = useState(0);
  const [rewardPage, setRewardPage] = useState(1);
  const [shareOpen, setShareOpen] = useState(false);
  const [orgChartOpen, setOrgChartOpen] = useState(false);
  const [rewardDetailsOpen, setRewardDetailsOpen] = useState(false);
  const [rewardSectionActive, setRewardSectionActive] = useState(false);
  const [expandedRewardKey, setExpandedRewardKey] = useState<string | null>(null);
  const rewardDialogRef = useRef<HTMLDialogElement>(null);
  const shareTriggerRef = useRef<HTMLButtonElement>(null);
  const orgChartTriggerRef = useRef<HTMLButtonElement>(null);
  const rewardTriggerRef = useRef<HTMLButtonElement>(null);
  const rewardFocusReturnRef = useRef<HTMLElement | null>(null);
  const closingFromRouteSyncRef = useRef(false);
  const rewardsPerPage = 10;

  function openRewardDetails(
    filter: "all" | "pending" | "released",
    focusReturn: HTMLElement | null,
  ) {
    setRewardFilter(filter);
    setRewardLevel(0);
    setRewardPage(1);
    setExpandedRewardKey(null);
    rewardFocusReturnRef.current = focusReturn;
    setRewardDetailsOpen(true);
  }

  function finishClosingRewardDetails() {
    const closedForRouteSync = closingFromRouteSyncRef.current;
    closingFromRouteSyncRef.current = false;
    setRewardDetailsOpen(false);
    if (closedForRouteSync) return;

    const focusReturn = rewardFocusReturnRef.current ?? rewardTriggerRef.current;
    const currentUrl = new URL(window.location.href);
    const hasDeepLinkIntent = currentUrl.searchParams.has("rewardView") || currentUrl.hash === "#credit";
    const shortcutIsVisible = !currentUrl.hash || currentUrl.hash === "#member-overview";
    const focusTarget = focusReturn?.dataset.rewardShortcut && !hasDeepLinkIntent && !shortcutIsVisible
      ? rewardTriggerRef.current
      : focusReturn;

    if (hasDeepLinkIntent) {
      router.replace(
        focusReturn?.dataset.rewardShortcut
          ? "/member#member-overview"
          : "/member#rewards",
        { scroll: false },
      );
    }

    window.setTimeout(() => {
      if (focusTarget) focusTarget.focus();
      else rewardTriggerRef.current?.focus();
    }, 50);
  }

  useEffect(() => {
    const syncRewardSection = () => {
      const rewardsSection = document.getElementById("rewards");
      const isActive = Boolean(rewardsSection && !rewardsSection.hidden);
      const dialog = rewardDialogRef.current;

      if (!isActive && dialog?.open) {
        closingFromRouteSyncRef.current = true;
        dialog.close();
      }

      setRewardSectionActive(isActive);
      if (!isActive) {
        setRewardDetailsOpen(false);
        return;
      }

      const hash = window.location.hash;
      const rewardView = new URLSearchParams(window.location.search).get("rewardView");
      const intent = hash === "#credit"
        ? "released" as const
        : hash === "#rewards" && (rewardView === "released" || rewardView === "pending")
          ? rewardView
          : null;

      if (intent) {
        rewardFocusReturnRef.current = document.querySelector<HTMLElement>(
          `[data-reward-shortcut="${intent}"]`,
        );
        setRewardFilter(intent);
        setRewardLevel(0);
        setRewardPage(1);
        setRewardDetailsOpen(true);
      }
    };

    syncRewardSection();
    window.addEventListener("kd-member-section-activated", syncRewardSection);

    return () => {
      window.removeEventListener("kd-member-section-activated", syncRewardSection);
    };
  }, []);

  useEffect(() => {
    const dialog = rewardDialogRef.current;
    if (!dialog) return;
    const rewardsSection = document.getElementById("rewards");
    const canOpen = Boolean(
      rewardDetailsOpen
      && rewardSectionActive
      && rewardsSection
      && !rewardsSection.hidden,
    );

    if (canOpen && !dialog.open) dialog.showModal();
    if (!canOpen && dialog.open) {
      closingFromRouteSyncRef.current = true;
      dialog.close();
    }
  }, [rewardDetailsOpen, rewardSectionActive]);

  useEffect(() => {
    const syncRewardIntent = () => {
      const hash = window.location.hash;
      const rewardView = new URLSearchParams(window.location.search).get("rewardView");
      const intent = hash === "#credit"
        ? "released" as const
        : hash === "#rewards" && (rewardView === "released" || rewardView === "pending")
          ? rewardView
          : null;

      if (intent) {
        rewardFocusReturnRef.current = document.querySelector<HTMLElement>(
          `[data-reward-shortcut="${intent}"]`,
        );
        const rewardsSection = document.getElementById("rewards");
        if (rewardsSection && !rewardsSection.hidden) {
          setRewardFilter(intent);
          setRewardLevel(0);
          setRewardPage(1);
          setRewardDetailsOpen(true);
        } else {
          setRewardDetailsOpen(false);
        }
      } else {
        setRewardDetailsOpen(false);
      }
    };

    syncRewardIntent();
    window.addEventListener("hashchange", syncRewardIntent);
    window.addEventListener("popstate", syncRewardIntent);

    return () => {
      window.removeEventListener("hashchange", syncRewardIntent);
      window.removeEventListener("popstate", syncRewardIntent);
    };
  }, [searchParams]);

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
  const releasedRetailRewardPoints = data.rewardCreditSources
    .filter((entry) => entry.sourceCategory === "retail_promotion")
    .reduce((sum, entry) => sum + (entry.sourceOrderSummary?.rewardPV ?? 0), 0);
  const pendingRetailRewardPoints = data.pendingRetailPromotionRewards
    .reduce((sum, reward) => sum + (reward.rewardPV ?? 0), 0);
  const releasedRewardPoints = releasedRewards.reduce((sum, reward) => sum + reward.rewardPV, 0) + releasedRetailRewardPoints;
  const pendingRewardPoints = pendingRewards.reduce((sum, reward) => sum + reward.rewardPV, 0) + pendingRetailRewardPoints;
  const releasedRewardCredit = data.rewardCreditSources
    .reduce((sum, reward) => sum + reward.creditedAmount, 0);
  const pendingRewardCredit = pendingRewards.reduce((sum, reward) => sum + reward.projectedCreditAmount, 0)
    + data.pendingRetailPromotionRewards.reduce((sum, reward) => sum + reward.projectedCreditAmount, 0);
  const totalRewardPoints = releasedRewardPoints + pendingRewardPoints;
  const releasedRewardSourceCount = data.rewardCreditSources.length;
  const pendingRewardSourceCount = pendingRewards.length + data.pendingRetailPromotionRewards.length;
  const allRewardSourceCount = data.rewards.length
    + data.pendingRetailPromotionRewards.length
    + data.rewardCreditSources.filter((item) => item.sourceCategory === "retail_promotion").length;
  const currentTaipeiMonth = formatTaipeiMonthKey(new Date());
  const currentMonthRewardPoints = releasedRewards
    .filter((reward) => reward.releasedAt && formatTaipeiMonthKey(reward.releasedAt) === currentTaipeiMonth)
    .reduce((sum, reward) => sum + reward.rewardPV, 0)
    + data.rewardCreditSources
      .filter((entry) => entry.sourceCategory === "retail_promotion" && formatTaipeiMonthKey(entry.issuedAt) === currentTaipeiMonth)
      .reduce((sum, entry) => sum + (entry.sourceOrderSummary?.rewardPV ?? 0), 0);

  const memberLedgerRows: RewardLedgerRow[] = data.rewards.map((reward) => ({
    stableKey: `member:${reward.sourceOrderNumber}:${reward.rewardType}:${reward.referralLevel}`,
    kind: "member",
    title: reward.rewardType === "self_purchase" ? "自己的消費" : `第 ${reward.referralLevel} 代推薦回饋`,
    displayStatus: reward.displayStatus,
    sourceOrderCreatedAt: reward.sourceOrderCreatedAt,
    sourceOrderNumber: reward.sourceOrderNumber,
    sourceItems: reward.sourceOrderSummary?.sourceItems ?? reward.sourceItems,
    rewardPV: reward.rewardPV,
    creditAmount: reward.status === "released" || reward.status === "reversed" ? reward.creditAmount : reward.projectedCreditAmount,
    releaseEligibleBusinessDate: reward.releaseEligibleBusinessDate,
    releasedAt: reward.releasedAt,
    calculationBasis: reward.sourceOrderSummary?.calculationBasis ?? "pv",
    calculationBaseValue: reward.sourceOrderSummary?.effectivePV ?? reward.effectivePV,
    rewardRate: reward.sourceOrderSummary?.rewardRate ?? reward.rewardRate,
    sourceOrderSummary: reward.sourceOrderSummary,
    waitingExplanation: reward.waitingExplanation,
    sourceMemberNumber: reward.rewardType === "self_purchase" ? null : reward.sourceMemberNumber,
    referralLevel: reward.referralLevel,
    reward,
  }));
  const pendingRetailLedgerRows: RewardLedgerRow[] = data.pendingRetailPromotionRewards.map((entry) => ({
    stableKey: `retail-pending:${entry.sourceOrderNumber ?? "legacy"}:${entry.releaseEligibleBusinessDate}`,
    kind: "retail",
    title: "推廣零售回饋",
    displayStatus: entry.displayStatus,
    sourceOrderCreatedAt: entry.sourceOrderSummary?.createdAt ?? null,
    sourceOrderNumber: entry.sourceOrderNumber,
    sourceItems: entry.sourceOrderSummary?.sourceItems ?? [],
    rewardPV: entry.rewardPV,
    creditAmount: entry.projectedCreditAmount,
    releaseEligibleBusinessDate: entry.releaseEligibleBusinessDate || null,
    releasedAt: null,
    calculationBasis: entry.sourceOrderSummary?.calculationBasis ?? "pv",
    calculationBaseValue: entry.sourceOrderSummary?.effectivePV ?? null,
    rewardRate: entry.sourceOrderSummary?.rewardRate ?? null,
    sourceOrderSummary: entry.sourceOrderSummary,
    waitingExplanation: entry.waitingExplanation,
    sourceMemberNumber: null,
    referralLevel: null,
    reward: null,
  }));
  const creditedLedgerRows: RewardLedgerRow[] = data.rewardCreditSources.map((entry) => ({
    stableKey: `credit:${entry.sourceCategory}:${entry.sourceOrderNumber ?? "legacy"}:${entry.issuedAt}`,
    kind: "credit",
    title: entry.sourceCategory === "retail_promotion"
      ? "推廣零售回饋"
      : entry.sourceCategory === "self_purchase"
        ? "自己的消費"
        : entry.sourceOrderSummary?.referralLevel
          ? `第 ${entry.sourceOrderSummary.referralLevel} 代推薦回饋`
          : "推薦回饋",
    displayStatus: entry.sourceOrderSummary?.displayStatus ?? "已入帳 ✓",
    sourceOrderCreatedAt: entry.sourceOrderSummary?.createdAt ?? entry.issuedAt,
    sourceOrderNumber: entry.sourceOrderNumber,
    sourceItems: entry.sourceOrderSummary?.sourceItems ?? [],
    rewardPV: entry.sourceOrderSummary?.rewardPV ?? null,
    creditAmount: entry.creditedAmount,
    releaseEligibleBusinessDate: entry.sourceOrderSummary?.releaseEligibleBusinessDate ?? null,
    releasedAt: entry.sourceOrderSummary?.releasedAt ?? entry.issuedAt,
    calculationBasis: entry.sourceOrderSummary?.calculationBasis ?? "pv",
    calculationBaseValue: entry.sourceOrderSummary?.effectivePV ?? null,
    rewardRate: entry.sourceOrderSummary?.rewardRate ?? null,
    sourceOrderSummary: entry.sourceOrderSummary,
    waitingExplanation: entry.sourceOrderSummary?.waitingExplanation ?? null,
    sourceMemberNumber: null,
    referralLevel: entry.sourceOrderSummary?.referralLevel ?? null,
    reward: null,
  }));
  const unsortedLedgerRows = rewardFilter === "released"
    ? creditedLedgerRows
    : rewardFilter === "pending"
      ? [
          ...memberLedgerRows.filter((row) => row.reward?.status === "scheduled" && row.reward.qualificationStatus !== "expired"),
          ...pendingRetailLedgerRows,
        ]
      : [
          ...memberLedgerRows,
          ...pendingRetailLedgerRows,
          ...creditedLedgerRows.filter((row) => row.title === "推廣零售回饋"),
        ];
  const filteredLedgerRows = unsortedLedgerRows.filter((row) => rewardLevel === 0 || row.referralLevel === rewardLevel);
  const sortedLedgerRows = sortRewardLedgerItems(filteredLedgerRows, rewardFilter);
  const rewardPageCount = Math.max(1, Math.ceil(sortedLedgerRows.length / rewardsPerPage));
  const safeRewardPage = Math.min(rewardPage, rewardPageCount);
  const pagedLedgerRows = sortedLedgerRows.slice((safeRewardPage - 1) * rewardsPerPage, safeRewardPage * rewardsPerPage);

  return (
    <>
      <section id="referral" className="member-ia-section" aria-labelledby="member-referral-title" data-member-section role="tabpanel" hidden>
        <header className="member-ia-section-head"><div><p className="eyebrow dark"><MemberCopyValue value={"REFERRAL"} /></p><h2 id="member-referral-title"><MemberCopyValue value={"推薦"} /></h2></div><p><MemberCopyValue value={"分享咖啡、查看推薦人與團隊，並直接開啟三代組織圖。"} /></p></header>
        <section className={`member-commerce-section member-referral-center-v2 ${styles.referralExperience}`}>
          <div className={styles.referralOverview}>
            <article className={styles.shareCard}>
              <div><p className="eyebrow dark"><MemberCopyValue value={"SHARE KD COFFEE"} /></p><h3><MemberCopyValue value={"分享給朋友"} /></h3></div>
              <p><MemberCopyValue value={"這是會員中心唯一的分享入口。朋友透過你的專屬連結加入會員，系統會保留推薦關係；訪客完成有效購買，也可能帶來推廣零售回饋。"} /></p>
              <dl className={styles.shareMeta}>
                <div><dt><MemberCopyValue value={"我的推薦碼"} /></dt><dd>{data.referralCode}</dd></div>
                <div><dt><MemberCopyValue value={"專屬連結"} /></dt><dd><MemberCopyValue value={data.referralUrl || "KD Coffee 首頁＋你的分享碼"} /></dd></div>
              </dl>
              <button ref={shareTriggerRef} className={styles.primaryAction} type="button" onClick={() => setShareOpen(true)}><MemberCopyValue value={"分享 KD Coffee"} /></button>
            </article>
            <article className={styles.inviterCard}>
              <div><p className="eyebrow dark"><MemberCopyValue value={"INVITED BY"} /></p><h3><MemberCopyValue value={"誰邀請我"} /></h3></div>
              <strong><MemberCopyValue value={data.referrerMemberNumber ? `會員 ${data.referrerMemberNumber}` : "無推薦人資料"} /></strong>
              <p><MemberCopyValue value={data.referrerMemberNumber ? "這是你的推薦關係來源；會員聯絡資料不會在此顯示。" : "目前沒有其他會員的推薦關係紀錄。"} /></p>
              <dl><div><dt><MemberCopyValue value={"直接推薦"} /></dt><dd>{directMembers}<MemberCopyValue value={" 人"} /></dd></div><div><dt><MemberCopyValue value={"團隊人數"} /></dt><dd>{data.nodes.length}<MemberCopyValue value={" 人"} /></dd></div></dl>
            </article>
          </div>
          <KdShareDialog open={shareOpen} referralCode={data.referralCode} onClose={() => { setShareOpen(false); window.setTimeout(() => shareTriggerRef.current?.focus(), 0); }} />
          <section className="member-referral-team-v2">
        <div className="member-referral-team-title-row">
          <div className="member-referral-subhead"><p className="eyebrow dark"><MemberCopyValue value={"MY TEAM"} /></p><h3><MemberCopyValue value={"我的推薦團隊"} /></h3><p><MemberCopyValue value={"先看自己的第一代；也可以打開三代樹狀組織圖，點選會員後以他為中心繼續往下查看。"} /></p></div>
          <button ref={orgChartTriggerRef} type="button" className="member-org-open-button" onClick={() => setOrgChartOpen(true)}><MemberCopyValue value={"查看組織圖"} /></button>
        </div>
        <div className="member-team-explorer-head">
          <div className="member-team-explorer-context">
            {teamPath.length ? <button type="button" className="member-team-back member-team-back-top" onClick={() => setTeamPath(teamPath.slice(0, -1))}><MemberCopyValue value={"← 返回上一層"} /></button> : <span className="member-team-root-label"><MemberCopyValue value={"我的第一代"} /></span>}
            <MemberCopyElement as="div" className="member-team-breadcrumb" aria-label="推薦團隊瀏覽路徑">
              <button type="button" className={!teamPath.length ? "is-current" : ""} onClick={() => setTeamPath([])}><MemberCopyValue value={"我的推薦團隊"} /></button>
              {teamPath.map((item, index) => <span key={`${item.memberNumber}:${index}`}><b>›</b><button type="button" className={index === teamPath.length - 1 ? "is-current" : ""} onClick={() => setTeamPath(teamPath.slice(0, index + 1))}>{item.memberNumber}</button></span>)}
            </MemberCopyElement>
            {currentTeamParent ? <div className="member-team-current-card"><div><small><MemberCopyValue value={"目前查看"} /></small><strong><MemberCopyValue value={"會員 "} />{currentTeamParent.memberNumber}</strong><span><MemberCopyValue value={"你的第 "} />{currentTeamParent.level}<MemberCopyValue value={" 代會員"} /></span></div><div><small><MemberCopyValue value={"他的直接推薦"} /></small><strong>{visibleNodes.length}<MemberCopyValue value={" 人"} /></strong></div></div> : null}
          </div>
          <span className="member-team-level-count"><MemberCopyValue value={"你的第 "} />{currentTeamLevel}<MemberCopyValue value={" 代 · "} />{visibleNodes.length}<MemberCopyValue value={" 人"} /></span>
        </div>
        {visibleNodes.length ? <div className="member-referral-list-v2 member-team-explorer-list">{visibleNodes.map((node) => <button type="button" className="member-team-node" key={`${node.level}:${node.memberNumber}`} onClick={() => node.directReferralCount > 0 && setTeamPath([...teamPath, { memberNumber: node.memberNumber, level: node.level }])}>
          <div><strong><MemberCopyValue value={"會員 "} />{node.memberNumber}</strong><small><MemberCopyValue value={"你的第 "} />{node.level}<MemberCopyValue value={" 代"} /></small></div>
          <div className="member-team-node-counts"><span><MemberCopyValue value={"直推 "} /><b>{node.directReferralCount}</b><MemberCopyValue value={" 人"} /></span><span><MemberCopyValue value={"團隊 "} /><b>{node.teamCount}</b><MemberCopyValue value={" 人"} /></span>{node.directReferralCount > 0 ? <em><MemberCopyValue value={"查看下線 ›"} /></em> : <em className="is-empty"><MemberCopyValue value={"尚無下線"} /></em>}</div>
        </button>)}</div> : <div className="member-commerce-empty compact"><strong><MemberCopyValue value={currentTeamParent ? `會員 ${currentTeamParent.memberNumber} 目前沒有直接推薦會員` : "目前還沒有第一代推薦會員"} /></strong><p><MemberCopyValue value={currentTeamParent ? "可返回上一層繼續查看其他推薦會員。" : "分享給朋友後，完成會員加入就會在這裡顯示。"} /></p></div>}
          </section>
        </section>
        <MemberReferralOrgChart open={orgChartOpen} data={data.orgChart} onClose={() => { setOrgChartOpen(false); window.setTimeout(() => orgChartTriggerRef.current?.focus(), 0); }} />
      </section>

      <section id="rewards" className="member-ia-section" aria-labelledby="member-rewards-title" data-member-section role="tabpanel" hidden>
        <header className="member-ia-section-head"><div><p className="eyebrow dark"><MemberCopyValue value={"REWARDS"} /></p><h2 id="member-rewards-title"><MemberCopyValue value={"回饋"} /></h2></div><p><MemberCopyValue value={"推廣零售、會員回饋、資格與歷史明細各自清楚呈現。"} /></p></header>
        <RetailPromotionCenter />
        <section className="member-commerce-section member-referral-center-v2">
          <div className="member-section-head"><div><p className="eyebrow dark"><MemberCopyValue value={"MEMBER REWARDS"} /></p><h2><MemberCopyValue value={"會員回饋"} /></h2><p><MemberCopyValue value={"回饋點數與折抵金額都以正式紀錄為準。"} /></p></div></div>
          <div className={`member-referral-primary-grid ${styles.rewardPrimary}`}>
            <article className="member-referral-primary-card">
              <div><p className="eyebrow dark"><MemberCopyValue value={"MY REWARDS"} /></p><h3><MemberCopyValue value={"我的回饋"} /></h3></div>
              <dl><div><dt><MemberCopyValue value={"待入帳"} /></dt><dd>NT$ {pendingRewardCredit.toLocaleString("zh-TW")}</dd></div><div><dt><MemberCopyValue value={"已入帳"} /></dt><dd>NT$ {releasedRewardCredit.toLocaleString("zh-TW")}</dd></div></dl>
              <button ref={rewardTriggerRef} type="button" onClick={() => openRewardDetails("all", rewardTriggerRef.current)}><MemberCopyValue value={"查看回饋明細"} /></button>
            </article>
          </div>
          <MemberQualificationProgress progress={data.qualificationProgress} />
          <dialog ref={rewardDialogRef} className="member-ia-dialog member-reward-dialog" aria-labelledby="member-reward-ledger-title" onClose={finishClosingRewardDetails}>
        <div className="member-ia-dialog-shell">
          <header><div><p className="eyebrow dark"><MemberCopyValue value={"REWARD DETAILS"} /></p><h2 id="member-reward-ledger-title"><MemberCopyValue value={"推薦與會員回饋"} /></h2></div><MemberCopyElement as="button" type="button" aria-label="關閉回饋明細" onClick={() => rewardDialogRef.current?.close()}>×</MemberCopyElement></header>
          <div className="member-ia-dialog-body">
      <section className="member-referral-reward-ledger" aria-labelledby="member-reward-ledger-title">
        <div className="member-referral-subhead"><p className="eyebrow dark"><MemberCopyValue value={"REWARD HISTORY"} /></p><h3><MemberCopyValue value={"回饋總覽"} /></h3><p><MemberCopyValue value={"先看回饋結果，需要時再展開計算、資格與來源訂單。"} /></p></div>
        {rewardFilter === "released" ? (
          <MemberCopyElement as="div" className={`member-reward-summary-grid ${styles.rewardSummaryGrid}`} aria-label={copy("member.referral.tooltip.be6e512f4b")}>
            <article><small><MemberCopyText copyKey="member.referral.label.5b29dc001e" /></small><strong>{creditValue(data.availableCreditBalance)}</strong><span><MemberCopyText copyKey="member.referral.reward.0f78857ceb" /></span></article>
            <article><small><MemberCopyValue value={"回饋入帳來源"} /></small><strong>{releasedRewardSourceCount}<MemberCopyValue value={" 筆"} /></strong><span><MemberCopyValue value={"推廣零售、推薦回饋與自己的消費"} /></span></article>
          </MemberCopyElement>
        ) : (
          <MemberCopyElement as="div" className={`member-reward-summary-grid ${styles.rewardSummaryGrid}`} aria-label="回饋點數總覽">
            <article><small><MemberCopyValue value={"累計回饋"} /></small><strong><MemberCopyValue value={pointValue(totalRewardPoints, displayPointName)} /></strong><span><MemberCopyValue value={"已入帳＋有效待入帳"} /></span></article>
            <article><small><MemberCopyValue value={"已入帳"} /></small><strong><MemberCopyValue value={pointValue(releasedRewardPoints, displayPointName)} /></strong><span>{releasedRewards.length}<MemberCopyValue value={" 筆"} /></span></article>
            <article><small><MemberCopyValue value={"待入帳"} /></small><strong><MemberCopyValue value={pointValue(pendingRewardPoints, displayPointName)} /></strong><span>{pendingRewardSourceCount}{" "}<MemberCopyText copyKey="member.dashboard.label.693d81614f" />{" "}{pendingRewardCredit.toLocaleString("zh-TW")}</span></article>
            <article><small><MemberCopyValue value={"本月已入帳"} /></small><strong><MemberCopyValue value={pointValue(currentMonthRewardPoints, displayPointName)} /></strong><span><MemberCopyValue value={"會員／推薦回饋本月正式發放"} /></span></article>
          </MemberCopyElement>
        )}
        {data.pvDisclosure ? <details className="member-referral-policy"><summary><MemberCopyValue value={"推薦回饋如何計算？"} /></summary><p>{data.pvDisclosure}</p><p><MemberCopyValue value={"加入推薦團隊不等於立即產生回饋；仍須依活動、消費與成功取貨條件判定。"} /></p></details> : null}
        <div className="member-reward-details">
          <div className="member-reward-ledger-heading"><div><p className="eyebrow dark"><MemberCopyValue value={"REWARD DETAILS"} /></p><h4><MemberCopyValue value={"回饋明細"} /></h4><p><MemberCopyValue value={"查看推廣零售、推薦與自己消費所產生的回饋與入帳狀態。"} /></p></div><span><MemberCopyValue value={"共 "} />{allRewardSourceCount}<MemberCopyValue value={" 筆"} /></span></div>
        {(data.rewards.length || data.rewardCreditSources.length || data.pendingRetailPromotionRewards.length) ? <>
          <MemberCopyElement as="div" className={`member-reward-filters ${styles.compactFilters}`} aria-label="回饋紀錄篩選">
            <div>{(["all", "pending", "released"] as const).map((filter) => {
              const count = filter === "all" ? allRewardSourceCount : filter === "released" ? releasedRewardSourceCount : pendingRewardSourceCount;
              return <button type="button" key={filter} className={rewardFilter === filter ? "is-active" : ""} onClick={() => { setRewardFilter(filter); setRewardPage(1); setExpandedRewardKey(null); }}><MemberCopyValue value={filter === "all" ? "全部" : filter === "pending" ? "待入帳" : "已入帳"} /> <span>{count}</span></button>;
            })}</div>
            <MemberCopyElement as="select" aria-label="依推薦代數篩選" value={rewardLevel} onChange={(event) => { setRewardLevel(Number(event.target.value)); setRewardPage(1); setExpandedRewardKey(null); }}>
              <option value={0}><MemberCopyValue value={"全部代數"} /></option>
              {data.summaries.map((summary) => <option key={summary.level} value={summary.level}><MemberCopyValue value={"第 "} />{summary.level}<MemberCopyValue value={" 代"} /></option>)}
            </MemberCopyElement>
          </MemberCopyElement>
          {pagedLedgerRows.length ? (
            <MemberCopyElement as="div" className={styles.compactRewardList} aria-label="回饋紀錄">
              {pagedLedgerRows.map((row) => {
                const reward = row.reward;
                const isDirectSelfPurchase = reward?.rewardType === "self_purchase" && reward.qualificationAuthority === "self_purchase_direct";
                const hasQualificationCoverage = reward?.qualificationAuthority === "qualification_coverage" && Boolean(reward.qualificationCoverage);
                const effectiveQualificationStatus = isDirectSelfPurchase || hasQualificationCoverage ? "qualified" : reward?.qualificationStatus ?? "qualified";
                const qualificationDisplayUntil = isDirectSelfPurchase
                  ? null
                  : hasQualificationCoverage
                    ? reward?.qualificationCoverage?.coverageEndsAt ?? null
                    : reward?.qualificationExpiresAt ?? null;
                const q = data.displayRules.payoutQualification;
                const qualificationMetric = q.qualificationBasis === "pv" ? `商品 ${displayPointName}` : "有效消費";
                const qualificationThreshold = (value: number) => q.qualificationBasis === "pv" ? pointValue(value, displayPointName) : creditValue(value);
                const qualificationRuleText = reward && !isDirectSelfPurchase
                  ? q.mode === "general"
                    ? `最近 ${q.generalMember.windowDays} 天累積${qualificationMetric}達 ${qualificationThreshold(q.generalMember.threshold)}。`
                    : q.mode === "subscription"
                      ? `有效定期配送會員最近 ${q.activeSubscriptionMember.windowDays} 天累積${qualificationMetric}達 ${qualificationThreshold(q.activeSubscriptionMember.threshold)}。`
                      : q.mode === "both"
                        ? `需同時符合一般會員最近 ${q.generalMember.windowDays} 天累積${qualificationMetric}達 ${qualificationThreshold(q.generalMember.threshold)}，以及有效定期配送會員最近 ${q.activeSubscriptionMember.windowDays} 天累積${qualificationMetric}達 ${qualificationThreshold(q.activeSubscriptionMember.threshold)}。`
                        : `一般會員最近 ${q.generalMember.windowDays} 天累積${qualificationMetric}達 ${qualificationThreshold(q.generalMember.threshold)}，或有效定期配送會員最近 ${q.activeSubscriptionMember.windowDays} 天累積${qualificationMetric}達 ${qualificationThreshold(q.activeSubscriptionMember.threshold)}，任一條件符合即可。`
                  : null;
                const qualificationSummary = row.kind === "retail"
                  ? <p><MemberCopyValue value={"推廣零售回饋不需推薦資格；訂單完成後進入安全等待。"} /></p>
                  : !reward
                    ? <p><MemberCopyValue value={"本筆已完成正式入帳。"} /></p>
                    : isDirectSelfPurchase
                      ? <p><MemberCopyValue value={"本人消費回饋不需推薦資格。"} /></p>
                      : hasQualificationCoverage
                        ? <p><MemberCopyValue value={"本筆已由有效推薦資格涵蓋 ✓"} /></p>
                        : effectiveQualificationStatus === "qualified"
                          ? <p><MemberCopyValue value={"本筆推薦資格已確認 ✓"} /></p>
                          : effectiveQualificationStatus === "expired"
                            ? <p><MemberCopyValue value={"本筆回饋資格期限已結束。"} /></p>
                            : <p><MemberCopyValue value={"尚待取得推薦回饋資格。"} /></p>;
                const lifecycleStage = row.releasedAt ? 4 : effectiveQualificationStatus === "qualified" ? 3 : 2;
                const waitingStepLabel = row.displayStatus === "待系統入帳" ? "待系統入帳" : "安全等待";
                const lifecycleLabels = row.kind === "retail" || isDirectSelfPurchase
                  ? ["回饋產生", "訂單完成", waitingStepLabel, "正式入帳"]
                  : ["回饋產生", effectiveQualificationStatus === "qualified" ? "資格確認" : "等待資格", waitingStepLabel, "正式入帳"];
                const detailId = `reward-ledger-detail-${row.stableKey.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;
                return (
                  <RewardLedgerCompactCard
                    key={row.stableKey}
                    detailId={detailId}
                    expanded={expandedRewardKey === row.stableKey}
                    onToggle={() => setExpandedRewardKey((current) => current === row.stableKey ? null : row.stableKey)}
                    title={row.title}
                    displayStatus={row.displayStatus}
                    sourceDate={row.sourceOrderCreatedAt}
                    sourceOrderNumber={row.sourceOrderNumber}
                    sourceItems={row.sourceItems}
                    rewardPV={row.rewardPV}
                    creditAmount={row.creditAmount}
                    pointDisplayName={displayPointName}
                    releaseEligibleBusinessDate={row.releaseEligibleBusinessDate}
                    releasedAt={row.releasedAt}
                    calculationBasis={row.calculationBasis}
                    calculationBaseValue={row.calculationBaseValue}
                    rewardRate={row.rewardRate}
                    sourceOrderSummary={row.sourceOrderSummary}
                    waitingExplanation={row.waitingExplanation}
                    sourceMemberNumber={row.sourceMemberNumber}
                    qualificationSummary={qualificationSummary}
                    qualificationValidUntil={qualificationDisplayUntil}
                    qualificationRuleText={qualificationRuleText}
                    lifecycleLabels={lifecycleLabels}
                    lifecycleStage={lifecycleStage}
                  />
                );
              })}
            </MemberCopyElement>
          ) : <div className="member-commerce-empty compact"><strong><MemberCopyValue value={"沒有符合目前篩選條件的回饋紀錄"} /></strong><p><MemberCopyValue value={"可切換狀態或代數查看其他紀錄。"} /></p></div>}
          {rewardPageCount > 1 ? <MemberCopyElement as="nav" className="member-reward-pagination" aria-label="推薦回饋分頁"><button type="button" disabled={safeRewardPage <= 1} onClick={() => setRewardPage(Math.max(1, safeRewardPage - 1))}><MemberCopyValue value={"上一頁"} /></button><span><MemberCopyValue value={"第 "} />{safeRewardPage} / {rewardPageCount}<MemberCopyValue value={" 頁"} /></span><button type="button" disabled={safeRewardPage >= rewardPageCount} onClick={() => setRewardPage(Math.min(rewardPageCount, safeRewardPage + 1))}><MemberCopyValue value={"下一頁"} /></button></MemberCopyElement> : null}
        </> : <div className="member-commerce-empty compact"><strong><MemberCopyValue value={"目前還沒有推薦回饋紀錄"} /></strong><p><MemberCopyValue value={"推薦會員產生符合規則的有效消費後，回饋紀錄會顯示在這裡。"} /></p></div>}
        </div>
      </section>
          </div>
        </div>
          </dialog>
        </section>
      </section>
    </>
  );
}
