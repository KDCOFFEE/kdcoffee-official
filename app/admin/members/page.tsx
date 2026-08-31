import Link from "next/link";
import { redirect } from "next/navigation";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { getAdminMemberList, type AdminMemberListFilters } from "@/lib/adminMemberManagement";

export const dynamic = "force-dynamic";

const subscriptionLabels = { pending_activation: "待啟用", active: "進行中", paused: "已暫停", terminated: "已停止" } as const;
const accountLabels = { active: "正常", "possible-duplicate": "待人工確認", "merged-tombstone": "已合併保留" } as const;
const referralLabels = { referrer: "有推薦會員", referred: "由會員推薦", both: "推薦人／被推薦人" } as const;

function value(search: Record<string, string | string[] | undefined>, key: string) {
  const raw = search[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

export default async function AdminMembersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const search = await searchParams;
  const filters: AdminMemberListFilters = {
    query: value(search, "q"), sort: value(search, "sort") === "oldest" ? "oldest" : "newest",
    login: (["email", "line", "both"].includes(value(search, "login") || "") ? value(search, "login") : "all") as AdminMemberListFilters["login"],
    subscription: (["active", "inactive"].includes(value(search, "subscription") || "") ? value(search, "subscription") : "all") as AdminMemberListFilters["subscription"],
    credit: value(search, "credit") === "available" ? "available" : "all",
    referral: value(search, "referral") === "participating" ? "participating" : "all",
    status: value(search, "status") === "possible-duplicate" ? "possible-duplicate" : value(search, "status") === "active" ? "active" : "all",
  };
  const result = await getAdminMemberList(filters);
  return <main className="admin-page admin-members-page">
    <div className="admin-back"><Link href="/admin">← 返回營運中心</Link></div>
    <header className="member-admin-header"><div><p className="eyebrow dark">OWNER WORKSPACE</p><h1>會員管理</h1><p>快速找到會員，查看訂單、抵用金、定期購、推薦與登入狀態。</p></div><Link href="/admin/member-identities">會員身份系統 →</Link></header>
    <section className="member-admin-stats"><article><small>會員總數</small><strong>{result.total}</strong></article><article><small>目前結果</small><strong>{result.rows.length}</strong></article><article><small>有可用抵用金</small><strong>{result.rows.filter((row) => row.availableCredit > 0).length}</strong></article><article><small>定期購進行中</small><strong>{result.rows.filter((row) => row.subscriptionStatus === "active").length}</strong></article></section>
    <section className="admin-panel member-admin-list-panel">
      <form className="member-admin-filters" method="get"><label className="member-admin-search">搜尋會員<input name="q" defaultValue={filters.query} placeholder="姓名、會員編號、Email 或手機" /></label><label>排序<select name="sort" defaultValue={filters.sort}><option value="newest">最新加入</option><option value="oldest">最早加入</option></select></label><label>登入方式<select name="login" defaultValue={filters.login}><option value="all">全部</option><option value="email">Email</option><option value="line">LINE</option><option value="both">Email + LINE</option></select></label><label>定期購<select name="subscription" defaultValue={filters.subscription}><option value="all">全部</option><option value="active">進行中</option><option value="inactive">未進行</option></select></label><label>抵用金<select name="credit" defaultValue={filters.credit}><option value="all">全部</option><option value="available">有可用抵用金</option></select></label><label>推薦<select name="referral" defaultValue={filters.referral}><option value="all">全部</option><option value="participating">有參與推薦</option></select></label><label>帳號狀態<select name="status" defaultValue={filters.status}><option value="all">全部</option><option value="active">正常</option><option value="possible-duplicate">待人工確認</option></select></label><div className="member-admin-filter-actions"><button className="admin-primary-button">套用</button><Link href="/admin/members">清除</Link></div></form>
      <div className="member-admin-table-head"><span>會員</span><span>訂單與消費</span><span>抵用金</span><span>會員狀態</span><span></span></div>
      <div className="member-admin-list">{result.rows.map((row) => <Link className="member-admin-row" href={`/admin/members/${encodeURIComponent(row.memberId)}`} key={row.memberId}>
        <div className="member-admin-person"><strong>{row.name}</strong><span>{row.memberNumber || "尚無會員編號"}</span><small>{row.email || row.phone || "尚無聯絡資料"}</small><div className="member-chip-row">{row.loginMethods.length ? row.loginMethods.map((method) => <b key={method}>{method === "email" ? "Email" : "LINE"}</b>) : <b>登入方式未建立</b>}</div></div>
        <div data-label="訂單與消費"><strong>{row.orderCount} 筆</strong><span>NT$ {row.lifetimeSpend.toLocaleString("zh-TW")}</span><small>{new Date(row.joinedAt).toLocaleDateString("zh-TW")} 加入</small></div>
        <div data-label="可用抵用金"><strong>NT$ {row.availableCredit.toLocaleString("zh-TW")}</strong></div>
        <div data-label="會員狀態"><span>{row.subscriptionStatus ? `定期購：${subscriptionLabels[row.subscriptionStatus]}` : "尚無定期購"}</span><span>{row.referralStatus ? referralLabels[row.referralStatus] : "尚無推薦關係"}</span><b className={`member-account-status status-${row.accountStatus}`}>{accountLabels[row.accountStatus]}</b></div>
        <span className="member-admin-open">查看 →</span>
      </Link>)}</div>
      {!result.rows.length ? <div className="member-admin-empty"><strong>找不到符合條件的會員</strong><p>請調整搜尋文字或清除篩選條件。</p></div> : null}
    </section>
  </main>;
}
