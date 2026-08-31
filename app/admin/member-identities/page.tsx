import Link from "next/link";
import { redirect } from "next/navigation";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { getMemberIdentityAdminSummary } from "@/lib/memberAuth";

export const dynamic = "force-dynamic";

export default async function AdminMemberIdentitiesPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const summary = await getMemberIdentityAdminSummary();
  const stats = [
    ["會員總數", summary.memberCount], ["已建立會員編號", summary.numberedCount], ["尚待建立會員編號", summary.pendingNumberCount],
    ["Email 登入", summary.emailIdentityCount], ["LINE 登入", summary.lineIdentityCount], ["同時連結 Email + LINE", summary.bothLinkedCount],
    ["既有混合會員資料", summary.hybridLegacyCount], ["疑似重複會員", summary.possibleDuplicateCount],
  ] as const;
  return <main className="admin-page"><div className="admin-back"><Link href="/admin">← 返回營運中心</Link></div><section className="admin-panel member-identity-admin">
    <div className="admin-panel-head"><div><p className="eyebrow dark">會員安全</p><h1>會員身份系統</h1></div><span>安全狀態</span></div>
    <p className="member-identity-admin-intro">每位會員保有一個固定會員編號，Email 與 LINE 是可以安全連結的登入方式。系統不會因為 Email 相同就自動合併會員。</p>
    <div className="member-identity-admin-grid">{stats.map(([label, value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}</div>
    <div className="member-identity-safety-list"><p><b>✓</b><span><strong>會員編號安全配置</strong>同時建立會員時也不會取得重複編號。</span></p><p><b>✓</b><span><strong>登入方式分開管理</strong>更換登入方式不會改變會員與歷史訂單。</span></p><p><b>✓</b><span><strong>禁止自動合併</strong>疑似重複會員只會提示人工審核，不會搬移或刪除資料。</span></p></div>
  </section></main>;
}
