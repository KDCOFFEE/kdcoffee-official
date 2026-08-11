import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import HomepageManager from "@/components/admin/HomepageManager";

export const dynamic = "force-dynamic";

export default async function AdminHomepagePage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  return <main className="admin-page cms-admin-page">
    <nav className="admin-breadcrumb"><Link href="/admin">← 返回營運中心</Link><span>網站管理／首頁</span></nav>
    <HomepageManager />
  </main>;
}
