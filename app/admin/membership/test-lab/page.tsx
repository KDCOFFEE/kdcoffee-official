import Link from "next/link";
import { redirect } from "next/navigation";
import MembershipTestLab from "@/components/admin/MembershipTestLab";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { getMembershipTestLabSnapshot, isMembershipTestLabEnabled } from "@/lib/membershipTestLab";
import "../membership.css";
import "@/components/admin/MembershipTestLab.css";

export const dynamic = "force-dynamic";

export default async function MembershipTestLabPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const enabled = isMembershipTestLabEnabled();
  const initialSnapshot = enabled ? await getMembershipTestLabSnapshot() : null;
  return <main className="admin-page membership-rules-page test-lab-page">
    <nav className="admin-breadcrumb"><Link href="/admin">← 返回營運中心</Link><Link href="/admin/membership">會員與定期購設定</Link><span>測試實驗室</span></nav>
    {enabled && initialSnapshot ? <MembershipTestLab initialSnapshot={initialSnapshot} /> : <section className="test-lab-disabled"><h1>會員制度測試實驗室未啟用</h1><p>正式環境預設關閉。需要時由部署環境明確設定 ENABLE_MEMBERSHIP_TEST_LAB=true。</p></section>}
  </main>;
}
