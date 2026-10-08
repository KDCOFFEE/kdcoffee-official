import { readPointDisplayNameSetting } from "@/lib/pointDisplayNameStore";
import Link from "next/link";
import { redirect } from "next/navigation";
import { readAdminSession } from "@/lib/adminAuth";
import { readMemberCenterCopy } from "@/lib/memberCenterCopyStore";
import MemberCenterCopyManager from "@/components/admin/MemberCenterCopyManager";

export const dynamic = "force-dynamic";
export default async function MemberCenterCopyPage() {
  const session = await readAdminSession();
  if (!session) redirect("/admin/login");
  if (session.role !== "owner") return <main className="admin-page"><p>此設定僅供 Owner 管理。</p></main>;
  const [copy, pointSetting] = await Promise.all([readMemberCenterCopy(), readPointDisplayNameSetting()]);
  return <main className="admin-page"><nav className="admin-breadcrumb"><Link href="/admin">← 返回營運中心</Link><span>會員中心／顯示文字與說明</span></nav><MemberCenterCopyManager initialRevision={copy.revision} initialOverrides={copy.overrides} initialPointSetting={pointSetting} /></main>;
}
