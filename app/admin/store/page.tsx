import type { Metadata } from "next";
import { forbidden, redirect } from "next/navigation";
import { readAdminSession } from "@/lib/adminAuth";
import { createStoreRepository } from "@/lib/storeRepository";
import { readPointDisplayName } from "@/lib/pointDisplayNameStore";
import StoreWorkspace from "@/components/admin/StoreWorkspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "商店工作區", robots: { index: false, follow: false } };
export default async function StorePage() {
  const session = await readAdminSession();
  if (!session) redirect("/admin/login");
  if (session.role !== "owner") forbidden();
  const [catalog, pointDisplayName] = await Promise.all([createStoreRepository().read(), readPointDisplayName()]);
  return <StoreWorkspace initialCatalog={catalog} pointDisplayName={pointDisplayName} />;
}
