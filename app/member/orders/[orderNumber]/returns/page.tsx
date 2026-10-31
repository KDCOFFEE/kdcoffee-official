import { redirect, notFound } from "next/navigation";
import { getCurrentMember } from "@/lib/memberAuth";
import { getReturnWorkflow } from "@/lib/returnWorkflow";
import MemberReturnWorkflow from "@/components/member/MemberReturnWorkflow";

export const dynamic = "force-dynamic";
export default async function MemberReturnsPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  const member = await getCurrentMember();
  if (!member) redirect(`/member?returnTo=${encodeURIComponent(`/member/orders/${orderNumber}/returns`)}`);
  const view = await getReturnWorkflow(orderNumber, member.id).catch(() => null);
  if (!view) notFound();
  return <MemberReturnWorkflow initial={view} />;
}
