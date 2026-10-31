import { notFound } from "next/navigation";

import OrderConversation from "@/components/orders/OrderConversation";
import Link from "next/link";
import { getCurrentMember } from "@/lib/memberAuth";
import { readOrder } from "@/lib/adminOrders";
import { readMemberCenterCopy } from "@/lib/memberCenterCopyStore";
import { resolveMemberCopy } from "@/lib/memberCenterCopy";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function CustomerOrderPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  if (!/^KD[0-9-]+$/.test(orderNumber)) notFound();
  const member = await getCurrentMember();
  const order = member ? await readOrder(orderNumber) : null;
  const ownCompleted = member && order?.member?.memberId === member.id && order?.status === "completed";
  const returnLinkLabel = ownCompleted ? resolveMemberCopy((await readMemberCenterCopy()).overrides, "member.returns.openHistory") : "";

  return (
    <main className="customer-order-page">
      <meta name="referrer" content="no-referrer" />
      <OrderConversation orderNumber={orderNumber} />
      {ownCompleted ? <Link className="member-order-detail-link" href={`/member/orders/${encodeURIComponent(orderNumber)}/returns`}>{returnLinkLabel}</Link> : null}
    </main>
  );
}
