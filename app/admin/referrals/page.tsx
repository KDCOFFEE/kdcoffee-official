import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { getAdminReferralOverview } from "@/lib/membershipCommerce";
import "../membership/membership.css";

export const dynamic = "force-dynamic";

function cancellationReasonLabel(reason?: string | null) {
  if (reason === "monthly_cap_exhausted_at_release") return "本月推薦獎勵上限已達";
  if (reason === "source_transaction_reversed_before_release") return "來源交易已取消／退款";
  return reason ? "其他取消原因" : "-";
}

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; from?: string; to?: string }> }) {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const { q, from, to } = await searchParams;
  const data = await getAdminReferralOverview({ query: q, from, to });
  return <main className="admin-page membership-rules-page">
    <nav className="admin-breadcrumb"><Link href="/admin">← 返回營運中心</Link><span>推薦制度管理</span></nav>
    <header className="membership-rules-header"><div><p className="eyebrow dark">REFERRAL MANAGEMENT</p><h1>推薦制度管理</h1><p>可查詢推薦上下線、獎勵與成本；推薦人永久鎖定，後台不提供改掛功能。</p></div></header>
    <section className="admin-stats"><article><small>新推薦獎勵</small><strong>{data.statistics.newReferralRewards}</strong></article><article><small>定期購獎勵</small><strong>{data.statistics.subscriptionRewards}</strong></article><article><small>待發放</small><strong>{data.statistics.pendingAmount}</strong></article><article><small>資格逾期</small><strong>{data.statistics.expiredAmount}</strong></article><article><small>已發放成本</small><strong>{data.statistics.releasedAmount}</strong></article><article><small>已沖回</small><strong>{data.statistics.reversedAmount}</strong></article><article><small>PV 模式成本</small><strong>{data.statistics.pvModeRewards}</strong></article><article><small>實付模式成本</small><strong>{data.statistics.paidAmountModeRewards}</strong></article></section>
    <section className="membership-rule-card"><form className="membership-fields three"><label>搜尋會員編號或遮罩姓名<input name="q" defaultValue={q || ""} /></label><label>開始日期<input type="date" name="from" defaultValue={from || ""} /></label><label>結束日期<input type="date" name="to" defaultValue={to || ""} /></label><button type="submit">套用查詢期間</button></form><div className="member-credit-history">{data.relationships.map((item) => <article key={item.relationshipId}><div><strong>{item.referrerNumber} → {item.referredNumber}</strong><small>{item.safeDisplayName || "KD Coffee 會員"}</small></div><div><span>{item.status}</span><small>{item.createdAt.slice(0, 10)}</small></div></article>)}</div></section>
    <section className="membership-rule-card"><h2>獎勵明細</h2><div className="member-credit-history">{data.rewards.slice(-200).reverse().map((reward) => <article key={reward.rewardId}><div><strong>NT$ {reward.calculatedCreditAmount}</strong><small>建立日期 {reward.createdAt.slice(0,10)}・來源訂單 {reward.sourceOrderNumber}</small><small>來源會員 {reward.sourceMemberId} → 受益會員 {reward.beneficiaryMemberId}・第 {reward.referralLevel} 代・{reward.rewardType === "new_referral" ? "新推薦" : "定期購"}</small><small>基礎等待 {reward.baseWaitingDaysSnapshot ?? "legacy"} 天・退貨保護 {reward.returnProtectionDaysSnapshot ?? "legacy"} 天・總等待 {reward.totalWaitingDaysSnapshot ?? "legacy"} 天</small><small>可發放日期 {reward.releaseEligibleBusinessDate || reward.scheduledReleaseAt?.slice(0,10) || "尚未取得資格"}</small></div><div><span>{reward.status}／{reward.qualificationStatus || "legacy"}</span>{reward.status === "cancelled" ? <small>原因：{cancellationReasonLabel(reward.cancellationReason)}</small> : null}<small>資格 {reward.qualificationStartedAt?.slice(0,10) || "-"}～{reward.qualificationExpiresAt?.slice(0,10) || "-"}</small>{reward.qualificationOrderNumber?<small>資格訂單 {reward.qualificationOrderNumber}・{reward.qualificationOrderCreatedAt?.slice(0,10)}・{reward.qualificationOrderFinalState}・完成 {reward.qualificationQualifiedAt?.slice(0,10) || "-"}</small>:null}<small>月上限 {reward.monthlyCapAmountSnapshot ?? "legacy"}・發放前已用 {reward.monthlyCapUsageAtRelease ?? "-"}・受限 {reward.monthlyCapLimitedAmount ?? "-"}</small><small>沖回政策 {reward.reversalPolicySnapshot || "legacy fallback"}・發放 {reward.releasedAt?.slice(0,10) || "-"}・沖回 {reward.reversedAt?.slice(0,10) || "-"}</small><small>{reward.calculationMode}・Rate {reward.rewardRate}%・Rule v{reward.ruleVersion}・{reward.releasePolicyVersion || "legacy"}</small></div></article>)}</div></section>
  </main>;
}
