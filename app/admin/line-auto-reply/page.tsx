import Link from "next/link";
import { redirect } from "next/navigation";
import { readAdminSession } from "@/lib/adminAuth";
import LineAutoReplyManager from "@/components/admin/LineAutoReplyManager";
export const dynamic = "force-dynamic";
export default async function LineAutoReplyPage() {
  if ((await readAdminSession())?.role !== "owner") redirect("/admin/login");
  return <main className="admin-page"><div className="admin-back"><Link href="/admin">← 返回營運中心</Link></div>
    <header><h1>LINE 自動回覆</h1><p>管理客人詢問時的回覆、豆單與說明文字。所有變更儲存後生效。</p></header>
    <LineAutoReplyManager />
  </main>;
}
