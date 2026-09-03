import Link from "next/link";
import { redirect } from "next/navigation";

import WorksPageManager from "@/components/admin/WorksPageManager";
import { isAdminAuthenticated } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export default async function AdminWorksPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  return <main className="admin-page cms-admin-page">
    <nav className="admin-breadcrumb"><Link href="/admin">← 返回營運中心</Link><span>網站管理／全部咖啡</span></nav>
    <WorksPageManager />
  </main>;
}
