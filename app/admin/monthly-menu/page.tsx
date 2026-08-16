import Link from "next/link";
import { redirect } from "next/navigation";

import MonthlyMenuBackgroundManager from "@/components/admin/MonthlyMenuBackgroundManager";
import { isAdminAuthenticated } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export default async function AdminMonthlyMenuPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");

  return (
    <main className="admin-page cms-admin-page">
      <nav className="admin-breadcrumb">
        <Link href="/admin">← 返回營運中心</Link>
        <span>網站管理／本月豆單背景</span>
      </nav>
      <MonthlyMenuBackgroundManager />
    </main>
  );
}
