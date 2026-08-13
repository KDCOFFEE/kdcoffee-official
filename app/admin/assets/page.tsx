import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import AssetManager from "@/components/admin/AssetManager";
import CloudinaryVideoManager from "@/components/admin/CloudinaryVideoManager";

export const dynamic = "force-dynamic";

export default async function AdminAssetsPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  return <main className="admin-page cms-admin-page">
    <nav className="admin-breadcrumb"><Link href="/admin">← 返回營運中心</Link><span>品牌資產與 Logo</span></nav>
    <AssetManager />
    <CloudinaryVideoManager />
  </main>;
}
