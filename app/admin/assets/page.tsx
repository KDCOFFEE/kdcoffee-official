import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import AdminAssetsWorkspace from "@/components/admin/AdminAssetsWorkspace";

export const dynamic = "force-dynamic";

export default async function AdminAssetsPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  return <main className="admin-page cms-admin-page">
    <nav className="admin-breadcrumb"><Link href="/admin">← 返回營運中心</Link><span>媒體與品牌資產</span></nav>
    <AdminAssetsWorkspace />
  </main>;
}
