import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import PageListManager from "@/components/admin/PageListManager";
export const dynamic = "force-dynamic";
export default async function AdminPagesPage() { if (!(await isAdminAuthenticated())) redirect("/admin/login"); return <main className="admin-page cms-admin-page"><nav className="admin-breadcrumb"><Link href="/admin">← 返回營運中心</Link><span>網站管理／頁面管理</span></nav><PageListManager/></main>; }
