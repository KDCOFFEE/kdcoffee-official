import Link from "next/link";
import { redirect } from "next/navigation";

import WorksPageManager from "@/components/admin/WorksPageManager";
import { readAdminSession } from "@/lib/adminAuth";
import { getLiveWebsiteData } from "@/data/websiteData";
import WorksArtworkIndex from "@/components/admin/works/WorksArtworkIndex";

export const dynamic = "force-dynamic";

export default async function AdminWorksPage() {
  const session = await readAdminSession();
  if (!session) redirect("/admin/login");
  const catalog = session.role === "owner" ? await getLiveWebsiteData() : null;
  return <main className="admin-page cms-admin-page">
    <nav className="admin-breadcrumb"><Link href="/admin">← 返回營運中心</Link><span>網站管理／全部咖啡</span></nav>
    {catalog && <WorksArtworkIndex products={catalog.menu.products} />}
    <WorksPageManager />
  </main>;
}
