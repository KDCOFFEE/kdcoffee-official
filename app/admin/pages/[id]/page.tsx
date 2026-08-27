import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import PageBuilderManager from "@/components/admin/PageBuilderManager";
export const dynamic = "force-dynamic";
export default async function AdminPageEditor({params}:{params:Promise<{id:string}>}) { if(!(await isAdminAuthenticated()))redirect("/admin/login");const{id}=await params;return <main className="admin-page cms-admin-page"><nav className="admin-breadcrumb"><Link href="/admin/pages">← 返回頁面管理</Link><span>網站管理／編輯頁面</span></nav><PageBuilderManager pageId={id}/></main>; }
