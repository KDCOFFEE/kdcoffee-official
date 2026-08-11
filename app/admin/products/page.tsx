import { redirect } from "next/navigation"; import Link from "next/link"; import { isAdminAuthenticated } from "@/lib/adminAuth"; import ProductManager from "@/components/admin/ProductManager";
export const dynamic="force-dynamic";
export default async function Page(){if(!(await isAdminAuthenticated()))redirect('/admin/login');return <main className="admin-page cms-admin-page"><nav className="admin-breadcrumb"><Link href="/admin">← 返回營運中心</Link><span>Artwork Workspace v10.1</span></nav><ProductManager/></main>}
