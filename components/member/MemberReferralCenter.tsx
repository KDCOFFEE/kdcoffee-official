"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import MemberReferralOrgChart, { type ReferralOrgChartData } from "./MemberReferralOrgChart";

type Center = {
  referralCode: string;
  referralUrl: string;
  pvDisclosure: string | null;
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
    status: string;
    cancellationReason: string | null;
    qualificationStatus: string;
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

const money = (value: number) => `NT$ ${value.toLocaleString("zh-TW")}`;
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

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("copy_failed");
}

export default function MemberReferralCenter() {
  const [data, setData] = useState<Center | null>(null);
  const [message, setMessage] = useState("");
  const [teamPath, setTeamPath] = useState<Array<{ memberNumber: string; level: number }>>([]);
  const [rewardFilter, setRewardFilter] = useState<"all" | "pending" | "released">("all");
  const [rewardLevel, setRewardLevel] = useState(0);
  const [rewardPage, setRewardPage] = useState(1);
  const [orgChartOpen, setOrgChartOpen] = useState(false);
  const [mobileShareOpen, setMobileShareOpen] = useState(false);
  const [mobileQrOpen, setMobileQrOpen] = useState(false);
  const [mobileRewardDetailsOpen, setMobileRewardDetailsOpen] = useState(false);
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

  if (!data) {
    return <section className="member-commerce-section" id="referral"><div className="member-section-head"><div><p className="eyebrow dark">REFERRAL</p><h2>我的推薦</h2></div></div><p>{message || "讀取中…"}</p></section>;
  }

  const copy = async (value: string, label: string) => {
    try { await copyText(value); setMessage(`${label}已複製。`); }
    catch { setMessage(`${label}複製失敗，請長按或選取文字後手動複製。`); }
  };

  const shareText = `最近喝到一家我很喜歡的咖啡，想分享給你 ☕\n\nKD Coffee 是自己烘焙的精品咖啡，每款都有不同的風味。\n有空可以逛逛，說不定會找到你喜歡的那一杯。`;
  const fullShareText = `${shareText}\n\nKD Coffee\n${data.referralUrl}`;

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "KD Coffee", text: shareText, url: data.referralUrl });
        setMessage("已開啟分享選單。"); return;
      }
      await copyText(fullShareText); setMessage("分享內容已複製，可以直接貼給朋友。");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("分享未完成，您仍可使用複製分享內容。");
    }
  };

  const qrUrl = `https://quickchart.io/qr?size=640&margin=2&text=${encodeURIComponent(data.referralUrl)}`;
  const downloadQr = async () => {
    try {
      const response = await fetch(qrUrl);
      if (!response.ok) throw new Error("qr_download_failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `KD-Coffee-${data.referralCode}-QR.png`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      setMessage("QR Code 圖片已下載。");
    } catch { window.open(qrUrl, "_blank", "noopener,noreferrer"); setMessage("已開啟 QR Code 圖片，您可以長按或另存圖片。"); }
  };

  const directMembers = data.summaries[0]?.members ?? 0;
  const releasedTotal = data.summaries.reduce((sum, item) => sum + item.releasedCredit, 0);
  const rootMemberNumber = data.nodes.find((node) => node.level === 1)?.parentMemberNumber ?? "";
  const currentTeamParent = teamPath.at(-1) ?? null;
  const currentParentNumber = currentTeamParent?.memberNumber ?? rootMemberNumber;
  const currentTeamLevel = currentTeamParent ? currentTeamParent.level + 1 : 1;
  const visibleNodes = data.nodes.filter((node) => node.level === currentTeamLevel && node.parentMemberNumber === currentParentNumber);

  const releasedRewards = data.rewards.filter((reward) => reward.status === "released");
  const pendingRewards = data.rewards.filter((reward) => !["released", "cancelled", "reversed"].includes(reward.status));
  const releasedRewardTotal = releasedRewards.reduce((sum, reward) => sum + reward.creditAmount, 0);
  const pendingRewardTotal = pendingRewards.reduce((sum, reward) => sum + reward.projectedCreditAmount, 0);
  const totalRewardValue = releasedRewardTotal + pendingRewardTotal;
  const currentTaipeiMonth = taipeiMonthKey(new Date());
  const currentMonthRewardTotal = releasedRewards
    .filter((reward) => reward.releasedAt && taipeiMonthKey(reward.releasedAt) === currentTaipeiMonth)
    .reduce((sum, reward) => sum + reward.creditAmount, 0);

  const filteredRewards = data.rewards.filter((reward) => {
    const statusMatch = rewardFilter === "all"
      || (rewardFilter === "released" && reward.status === "released")
      || (rewardFilter === "pending" && !["released", "cancelled", "reversed"].includes(reward.status));
    return statusMatch && (rewardLevel === 0 || reward.referralLevel === rewardLevel);
  });
  const rewardPageCount = Math.max(1, Math.ceil(filteredRewards.length / rewardsPerPage));
  const safeRewardPage = Math.min(rewardPage, rewardPageCount);
  const pagedRewards = filteredRewards.slice((safeRewardPage - 1) * rewardsPerPage, safeRewardPage * rewardsPerPage);

  return (
    <section className="member-commerce-section member-referral-center-v2" id="referral">
      <div className="member-section-head"><div><p className="eyebrow dark">REFERRAL</p><h2>我的推薦團隊</h2><p>把喜歡的 KD Coffee 自然分享給朋友，推薦關係由系統自動記錄。</p></div><span>團隊 {data.nodes.length} 人</span></div>

      <section className="member-referral-invite-v2" aria-labelledby="member-share-title">
        <div className={`member-referral-share-main member-mobile-collapsible${mobileShareOpen ? " is-open" : ""}`}>
          <div className="member-mobile-collapsible-head">
            <div><p className="eyebrow dark">SHARE KD COFFEE</p><h3 id="member-share-title">分享 KD Coffee 給朋友</h3></div>
            <button
              type="button"
              className="member-mobile-collapse-toggle"
              aria-expanded={mobileShareOpen}
              onClick={() => setMobileShareOpen((open) => !open)}
            >
              {mobileShareOpen ? "收合分享工具" : "開啟分享工具"}
            </button>
          </div>
          <div className="member-mobile-collapsible-content">
            <p className="member-referral-share-intro">朋友透過這個分享加入會員時，系統會自動記錄推薦關係；分享給朋友的內容不會強調推薦制度。</p>
            <div className="member-referral-message-preview"><small>分享內容預覽</small><p>{shareText}</p><span>KD Coffee<br />{data.referralUrl}</span></div>
            <div className="member-referral-actions-v2"><button type="button" className="member-referral-share-primary" onClick={() => void share()}>分享給朋友</button><button type="button" onClick={() => void copy(fullShareText, "分享內容")}>複製分享內容</button></div>
            <details className="member-referral-code-details"><summary>查看推薦碼與連結</summary><div><span>推薦碼 <strong>{data.referralCode}</strong></span><button type="button" onClick={() => void copy(data.referralCode, "推薦碼")}>複製推薦碼</button><span className="is-url">{data.referralUrl}</span><button type="button" onClick={() => void copy(data.referralUrl, "分享連結")}>複製連結</button></div></details>
          </div>
        </div>

        <div className={`member-referral-qr-card-v2 member-mobile-collapsible${mobileQrOpen ? " is-open" : ""}`}>
          <div className="member-mobile-collapsible-head member-mobile-qr-head">
            <div><strong>分享 QR Code</strong><p>朋友掃描後即可開啟 KD Coffee。</p></div>
            <button
              type="button"
              className="member-mobile-collapse-toggle"
              aria-expanded={mobileQrOpen}
              onClick={() => setMobileQrOpen((open) => !open)}
            >
              {mobileQrOpen ? "收合 QR Code" : "查看 QR Code"}
            </button>
          </div>
          <div className="member-mobile-collapsible-content member-mobile-qr-content">
            <div className="member-referral-qr-frame"><img width="220" height="220" alt="KD Coffee 分享 QR Code" src={qrUrl} /></div>
            <button type="button" onClick={() => void downloadQr()}>下載 QR Code 圖片</button>
          </div>
        </div>
      </section>

      {message && <p className="member-notice success" role="status" aria-live="polite">{message}</p>}

      <section className="member-referral-results-v2"><div className="member-referral-subhead"><p className="eyebrow dark">MY RESULTS</p><h3>我的推薦成果</h3></div><div className="member-referral-kpis"><article><small>直接分享加入</small><strong>{directMembers}</strong><span>人</span></article><article><small>團隊人數</small><strong>{data.nodes.length}</strong><span>人</span></article><article><small>已發放推薦回饋</small><strong>{money(releasedTotal)}</strong></article></div>{data.pvDisclosure && <details className="member-referral-policy"><summary>推薦回饋如何計算？</summary><p>{data.pvDisclosure}</p><p>加入推薦團隊不等於立即產生回饋；仍須依活動、消費與成功取貨條件判定。</p></details>}</section>

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


      <MemberReferralOrgChart open={orgChartOpen} data={data.orgChart} onClose={() => setOrgChartOpen(false)} />

      <section className="member-referral-reward-ledger" aria-labelledby="member-reward-ledger-title">
        <div className="member-referral-subhead"><p className="eyebrow dark">REWARD HISTORY</p><h3 id="member-reward-ledger-title">推薦回饋</h3><p>所有金額與狀態直接取自正式 Reward Engine 回饋紀錄；會員頁不另外計算回饋規則。</p></div>
        <div className="member-reward-summary-grid" aria-label="推薦回饋總覽">
          <article><small>累計推薦回饋</small><strong>{money(totalRewardValue)}</strong><span>已入帳＋有效待入帳</span></article>
          <article><small>已入帳</small><strong>{money(releasedRewardTotal)}</strong><span>{releasedRewards.length} 筆</span></article>
          <article><small>待入帳</small><strong>{money(pendingRewardTotal)}</strong><span>{pendingRewards.length} 筆</span></article>
          <article><small>本月回饋</small><strong>{money(currentMonthRewardTotal)}</strong><span>本月已入帳</span></article>
        </div>
        <div className="member-mobile-reward-toggle-row">
          <button
            type="button"
            className="member-mobile-collapse-toggle member-mobile-reward-toggle"
            aria-expanded={mobileRewardDetailsOpen}
            onClick={() => setMobileRewardDetailsOpen((open) => !open)}
          >
            {mobileRewardDetailsOpen ? "收合回饋明細" : `查看回饋明細（${data.rewards.length}）`}
          </button>
        </div>
        <div className={`member-mobile-reward-details${mobileRewardDetailsOpen ? " is-open" : ""}`}>
          <div className="member-reward-ledger-heading"><div><p className="eyebrow dark">REWARD DETAILS</p><h4>回饋明細</h4><p>查看每一筆推薦消費所產生的回饋與入帳狀態。</p></div><span>共 {data.rewards.length} 筆</span></div>
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
          const qualificationLabel = reward.qualificationStatus === "awaiting_order" ? "待完成資格消費" : reward.qualificationStatus === "awaiting_completion" ? "等待訂單完成" : reward.qualificationStatus === "qualified" ? "已取得資格・等待發放" : reward.qualificationStatus === "expired" ? "資格已逾期" : "歷史獎勵";
          const itemText = reward.sourceItems.length ? reward.sourceItems.map((item) => `${item.name}${item.optionLabel ? `・${item.optionLabel}` : ""}${item.optionDetail ? ` ${item.optionDetail}` : ""}${item.preparationLabel ? `・${item.preparationLabel}` : ""} × ${item.quantity}`).join("、") : "來源訂單商品明細未保留";
          const basis = reward.calculationMode === "pv" ? `${reward.effectivePV.toLocaleString("zh-TW")} PV × ${reward.rewardRate.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}%` : `依正式回饋規則 × ${reward.rewardRate.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}%`;
          return <article className="member-reward-ledger-card member-reward-ledger-item" key={reward.rewardId}>
            <header className="member-reward-ledger-meta"><time>{formatDate(reward.releasedAt || reward.sourceOrderCreatedAt)}</time><span className={`member-reward-status is-${reward.status}`}>{rewardStatusLabel(reward, qualificationLabel)}</span></header>
            <div className="member-reward-ledger-body">
              <div className="member-reward-ledger-title-row">
                <div><small>REFERRAL REWARD</small><h4>第 {reward.referralLevel} 代推薦回饋</h4></div>
                <span className="member-reward-generation">你的第 {reward.referralLevel} 代</span>
              </div>
              <div className="member-reward-order-info">
                <p className="member-reward-source-member"><b>來源會員</b><strong>{reward.sourceMemberNumber}</strong></p>
                <p className="member-reward-consumption"><b>消費內容</b><span>{itemText}</span></p>
              </div>
              <div className="member-reward-ledger-math member-reward-ledger-bottom">
                <span><small>回饋計算</small>{basis}</span>
                <strong><small>本筆回饋</small>+ {money(reward.creditAmount)}</strong>
              </div>
              {reward.releaseEligibleBusinessDate && reward.status === "scheduled" ? <small className="member-reward-release-note">預計符合發放條件日期：{reward.releaseEligibleBusinessDate.replaceAll("-", "/")}</small> : null}
            </div>
          </article>;
        })}</div> : <div className="member-commerce-empty compact"><strong>沒有符合目前篩選條件的回饋紀錄</strong><p>可切換狀態或代數查看其他紀錄。</p></div>}
          {rewardPageCount > 1 ? <nav className="member-reward-pagination" aria-label="推薦回饋分頁"><button type="button" disabled={safeRewardPage <= 1} onClick={() => setRewardPage(Math.max(1, safeRewardPage - 1))}>上一頁</button><span>第 {safeRewardPage} / {rewardPageCount} 頁</span><button type="button" disabled={safeRewardPage >= rewardPageCount} onClick={() => setRewardPage(Math.min(rewardPageCount, safeRewardPage + 1))}>下一頁</button></nav> : null}
        </> : <div className="member-commerce-empty compact"><strong>目前還沒有推薦回饋紀錄</strong><p>推薦會員產生符合規則的有效消費後，回饋紀錄會顯示在這裡。</p></div>}
        </div>
      </section>
    </section>
  );
}
