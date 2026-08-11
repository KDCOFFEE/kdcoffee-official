import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import LogoManager from "@/components/admin/LogoManager";

export const dynamic = "force-dynamic";

export default async function AdminLogoPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  return <main className="admin-page cms-admin-page">
    <nav className="admin-breadcrumb"><Link href="/admin">← 返回營運中心</Link><span>Logo 管理</span></nav>
    <LogoManager />
  </main>;
}
