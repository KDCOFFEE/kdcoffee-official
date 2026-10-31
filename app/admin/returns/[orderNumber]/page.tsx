import { redirect, notFound } from "next/navigation";
import { readAdminSession } from "@/lib/adminAuth";
import { getReturnWorkflow } from "@/lib/returnWorkflow";
import { AdminReturnDetail } from "@/components/admin/AdminReturnWorkflow";
import MemberCenterCopyProvider from "@/components/member/MemberCenterCopyProvider";
import { readMemberCenterCopy } from "@/lib/memberCenterCopyStore";
import { readPointDisplayName } from "@/lib/pointDisplayNameStore";

export const dynamic = "force-dynamic";
export default async function ReturnDetailPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  if (!(await readAdminSession())) redirect("/admin/login");
  const { orderNumber } = await params;
  const view = await getReturnWorkflow(orderNumber).catch(() => null);
  if (!view) notFound();
  const [copy, pointDisplayName] = await Promise.all([readMemberCenterCopy(), readPointDisplayName()]);
  return <MemberCenterCopyProvider initialOverrides={copy.overrides} initialPointDisplayName={pointDisplayName}><AdminReturnDetail initial={view} /></MemberCenterCopyProvider>;
}
