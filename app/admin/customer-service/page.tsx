import Link from "next/link";
import { redirect } from "next/navigation";
import { readAdminSession } from "@/lib/adminAuth";
import { readCustomerServiceState } from "@/lib/customerServiceStore";
import CustomerServiceManager from "@/components/admin/CustomerServiceManager";

export const dynamic = "force-dynamic";
export default async function CustomerServiceAdminPage() {
  const session = await readAdminSession();
  if (!session) redirect("/admin/login");
  if (session.role !== "owner") return <main className="admin-page"><p>客服中心內容僅供 Owner 管理。</p><Link href="/admin">返回營運中心</Link></main>;
  let state;
  try { state = await readCustomerServiceState(); }
  catch { return <main className="admin-page"><h1>客服中心內容暫時無法讀取</h1><p>請稍後重試；既有內容不會被覆蓋。</p><Link href="/admin">返回營運中心</Link></main>; }
  return <main className="admin-page"><nav className="admin-breadcrumb"><Link href="/admin">← 返回營運中心</Link><span>客服中心內容</span></nav><CustomerServiceManager initial={state} /></main>;
}
