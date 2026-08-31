import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { getAdminMemberDetail } from "@/lib/adminMemberManagement";
import { orderStatusLabel } from "@/lib/adminOrders";
import CreditAdjustmentForm from "./CreditAdjustmentForm";

export const dynamic = "force-dynamic";

const subscriptionLabels = { pending_activation: "待首筆訂單完成後啟用", active: "進行中", paused: "已暫停", terminated: "已停止" } as const;
const cycleLabels: Record<string, string> = { scheduled: "已排程", modifiable: "可修改", locked: "已鎖定", order_created: "已建立訂單", shipped: "已交寄", ready_for_pickup: "可取貨", completed: "已完成", skipped: "已跳過", blocked_stock: "庫存待處理", cancelled: "已取消", uncollected: "未取貨" };
const creditStatusLabels = { available: "可使用", reserved: "結帳保留中", consumed: "已使用／已扣除", expired: "已到期" } as const;
const accountLabels = { active: "正常", "possible-duplicate": "待人工確認", "merged-tombstone": "已合併保留" } as const;

function dateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("zh-TW") : "—";
}

function sourceLabel(sourceType: string, reference: string) {
  if (reference.startsWith("admin_credit_adjustment:grant:")) return "Owner 人工新增";
  if (reference.startsWith("admin_credit_adjustment:deduct:")) return "Owner 人工扣除";
  if (reference.startsWith("referral_reward_reversal:")) return "推薦獎勵沖回";
  if (sourceType === "referral") return "推薦獎勵";
  if (sourceType === "promotion") return "活動贈送";
  if (sourceType === "compensation") return "補償";
  return "人工發放";
}

export default async function AdminMemberDetailPage({ params }: { params: Promise<{ memberId: string }> }) {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const { memberId } = await params;
  const detail = await getAdminMemberDetail(memberId);
  if (!detail) notFound();
  const { summary } = detail;
  return <main className="admin-page admin-member-detail-page">
    <div className="admin-back"><Link href="/admin/members">← 返回會員管理</Link></div>
    <header className="member-detail-header"><div><p className="eyebrow dark">MEMBER PROFILE</p><h1>{summary.name}</h1><p>{summary.memberNumber || "尚無會員編號"}・{accountLabels[summary.accountStatus]}・{summary.loginMethods.length ? summary.loginMethods.map((item) => item === "email" ? "Email" : "LINE").join(" + ") : "登入方式未建立"}</p></div><div className="member-detail-credit"><small>可用抵用金</small><strong>NT$ {summary.availableCredit.toLocaleString("zh-TW")}</strong></div></header>
    <nav className="member-detail-nav" aria-label="會員資料區段"><a href="#overview">會員概要</a><a href="#orders">訂單紀錄</a><a href="#credit">抵用金</a><a href="#subscriptions">定期購</a><a href="#referrals">推薦關係</a><a href="#identity">身份與登入</a><a href="#audit">操作紀錄</a></nav>
    <section className="member-detail-summary" id="overview"><article><small>加入日期</small><strong>{new Date(summary.joinedAt).toLocaleDateString("zh-TW")}</strong></article><article><small>訂單</small><strong>{summary.orderCount} 筆</strong><span>有效金額 NT$ {summary.lifetimeSpend.toLocaleString("zh-TW")}</span></article><article><small>定期購</small><strong>{summary.subscriptionStatus ? subscriptionLabels[summary.subscriptionStatus] : "尚無"}</strong></article><article><small>聯絡資料</small><strong>{detail.contact.pickupName || summary.name}</strong><span>{detail.contact.email || "尚無 Email"}</span><span>{detail.contact.phone || "尚無手機"}</span></article></section>
    <section className="admin-panel member-detail-section" id="orders"><div className="admin-panel-head"><div><p className="eyebrow dark">ORDERS</p><h2>訂單紀錄</h2></div><Link href="/admin/orders">前往訂單管理 →</Link></div>{detail.orders.map((order) => <Link className="member-detail-order" href={`/admin/orders/${order.orderNumber}`} key={order.orderNumber}><div><strong>{order.orderNumber}</strong><span>{dateTime(order.createdAt)}</span></div><div><span>{order.orderMode === "711_cod" ? "7-ELEVEN 取貨付款" : order.orderMode === "studio_pickup" ? "工作室自取" : order.orderMode}</span><b>{orderStatusLabel(order.status)}</b></div><strong>NT$ {order.total.toLocaleString("zh-TW")}</strong></Link>)}{!detail.orders.length ? <p className="member-detail-empty">這位會員目前沒有訂單。</p> : null}</section>
    <section className="member-credit-layout" id="credit"><div className="admin-panel member-detail-section"><div className="admin-panel-head"><div><p className="eyebrow dark">CREDIT</p><h2>抵用金紀錄</h2></div><span>保留中 NT$ {detail.reservedCredit.toLocaleString("zh-TW")}・待發放 NT$ {detail.pendingCredit.toLocaleString("zh-TW")}</span></div><div className="member-credit-ledger">{detail.credits.map((entry) => <article key={entry.creditEntryId}><div><b className={entry.direction === "deduct" ? "is-deduct" : "is-grant"}>{entry.amount < 0 ? "−" : "+"} NT$ {Math.abs(entry.amount).toLocaleString("zh-TW")}</b><span>{sourceLabel(entry.sourceType, entry.sourceReference)}</span></div><div><strong>{entry.reason || creditStatusLabels[entry.status]}</strong>{entry.note ? <span>{entry.note}</span> : null}<small>{dateTime(entry.issuedAt)}{entry.amount > 0 ? `・有效至 ${new Date(entry.expiresAt).toLocaleDateString("zh-TW")}` : ""}</small></div><div><span>{creditStatusLabels[entry.status]}</span><small>剩餘 NT$ {entry.remainingAmount.toLocaleString("zh-TW")}</small></div></article>)}{!detail.credits.length ? <p className="member-detail-empty">目前沒有抵用金紀錄。</p> : null}</div></div><aside className="admin-panel member-credit-action"><div><p className="eyebrow dark">OWNER ACTION</p><h2>調整抵用金</h2><p>每次調整都會留下新紀錄與操作原因，不會覆蓋既有歷史。</p></div><CreditAdjustmentForm memberId={summary.memberId} currentBalance={summary.availableCredit} /></aside></section>
    <section className="admin-panel member-detail-section" id="subscriptions"><div className="admin-panel-head"><div><p className="eyebrow dark">SUBSCRIPTION</p><h2>定期購</h2></div><Link href="/admin/membership">前往會員與定期購設定 →</Link></div>{detail.subscriptions.map((subscription) => <article className="member-subscription-card" key={subscription.subscriptionId}><div><strong>{subscriptionLabels[subscription.status]}</strong><span>{subscription.intervalDays} 天週期・{subscription.shippingMethod === "711_cod" ? subscription.storeSelection?.storeName || "7-ELEVEN" : "工作室自取"}</span><small>從訂單 {subscription.startedFromOrderId} 建立</small></div><div><span>{subscription.defaultItems.map((item) => item.components.map((part) => part.productId).join(" + ")).join("、") || "商品資料未提供"}</span><b>{subscription.defaultItems.reduce((sum, item) => sum + item.quantity, 0)} 份</b></div>{subscription.cycles[0] ? <div><span>最近一期 {subscription.cycles[0].plannedDate}</span><b>{cycleLabels[subscription.cycles[0].status] || subscription.cycles[0].status}</b><small>修改截止 {subscription.cycles[0].modificationDeadline}</small></div> : <div><span>尚無配送期次</span></div>}</article>)}{!detail.subscriptions.length ? <p className="member-detail-empty">這位會員目前沒有定期購。</p> : null}</section>
    <section className="admin-panel member-detail-section" id="referrals"><div className="admin-panel-head"><div><p className="eyebrow dark">REFERRAL</p><h2>推薦關係</h2></div><Link href="/admin/referrals">前往推薦制度管理 →</Link></div><div className="member-referral-summary"><article><small>推薦碼</small><strong>{detail.referral.referralCode || "—"}</strong></article><article><small>推薦人</small><strong>{detail.referral.referrerMemberNumber || "—"}</strong><span>{detail.referral.relationshipStatus || "尚無推薦關係"}</span></article><article><small>直接推薦</small><strong>{detail.referral.directReferrals.length} 位</strong></article><article><small>獎勵紀錄</small><strong>{detail.referral.rewards.length} 筆</strong></article></div>{detail.referral.directReferrals.length ? <div className="member-safe-referrals">{detail.referral.directReferrals.map((item, index) => <span key={`${item.memberNumber}-${index}`}><b>{item.safeDisplayName || "KD Coffee 會員"}</b>{item.memberNumber || "會員編號未建立"}・{item.status}</span>)}</div> : <p className="member-detail-empty">目前沒有直接推薦會員。</p>}</section>
    <section className="admin-panel member-detail-section" id="identity"><div className="admin-panel-head"><div><p className="eyebrow dark">IDENTITY</p><h2>身份與登入</h2></div><Link href="/admin/member-identities">前往會員身份系統 →</Link></div><div className="member-identity-safe-grid"><article><small>Email 登入</small><strong>{summary.loginMethods.includes("email") ? "已連結" : "未連結"}</strong><span>{detail.contact.email || "—"}</span></article><article><small>LINE 登入</small><strong>{summary.loginMethods.includes("line") ? "已連結" : "未連結"}</strong><span>不顯示任何登入憑證或權杖</span></article><article><small>帳號狀態</small><strong>{accountLabels[summary.accountStatus]}</strong></article><article><small>最近登入</small><strong>{dateTime(detail.contact.lastLoginAt)}</strong></article></div>{detail.identities.map((identity) => <p className="member-identity-row" key={identity.provider}><b>{identity.provider === "email" ? "Email" : "LINE"}</b><span>驗證 {dateTime(identity.verifiedAt)}・連結 {dateTime(identity.linkedAt)}</span></p>)}</section>
    <section className="admin-panel member-detail-section" id="audit"><div className="admin-panel-head"><div><p className="eyebrow dark">HISTORY</p><h2>操作紀錄</h2></div></div><div className="member-audit-list">{detail.audit.map((item) => <article key={item.id}><time>{dateTime(item.timestamp)}</time><div><strong>{item.action}</strong><span>{item.reason}</span></div><b>{item.actor === "admin" ? "Owner／Admin" : item.actor === "member" ? "會員" : "系統"}</b></article>)}{!detail.audit.length ? <p className="member-detail-empty">目前沒有可顯示的操作紀錄。</p> : null}</div></section>
  </main>;
}
