import Link from "next/link";
import { redirect } from "next/navigation";
import { readAdminSession } from "@/lib/adminAuth";
import LineAutoReplyManager from "@/components/admin/LineAutoReplyManager";
export const dynamic = "force-dynamic";
export default async function LineAutoReplyPage() {
  if ((await readAdminSession())?.role !== "owner") redirect("/admin/login");
  return <main className="admin-page"><div className="admin-back"><Link href="/admin">← 返回營運中心</Link></div>
    <header><h1>LINE 顧客導覽與自動回覆</h1><p>管理咖啡、訂購、會員與店舖的導覽層級、問答及會員入口，並在儲存前模擬客人看到的回覆。</p></header>
    <LineAutoReplyManager />
  </main>;
}
