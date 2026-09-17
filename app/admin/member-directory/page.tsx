import type { Metadata } from "next";
import { forbidden, redirect } from "next/navigation";

import { AdminMemberDirectory } from "@/components/admin/member-directory/AdminMemberDirectory";
import { adminPermissions, AdminAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "會員資料與組織圖｜KD Coffee Admin",
  description: "KD Coffee Owner 專用的 live canonical 會員與推薦組織檢視。",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function AdminMemberDirectoryPage() {
  try {
    await requireAdminPermission(adminPermissions.membersSensitiveRead);
  } catch (error) {
    if (error instanceof AdminAuthorizationError && error.status === 401) redirect("/admin/login");
    if (error instanceof AdminAuthorizationError && error.status === 403) forbidden();
    throw error;
  }
  return <AdminMemberDirectory />;
}
