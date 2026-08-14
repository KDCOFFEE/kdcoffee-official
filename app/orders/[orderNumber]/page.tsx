import { notFound } from "next/navigation";

import OrderConversation from "@/components/orders/OrderConversation";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function CustomerOrderPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  if (!/^KD[0-9-]+$/.test(orderNumber)) notFound();

  return (
    <main className="customer-order-page">
      <meta name="referrer" content="no-referrer" />
      <OrderConversation orderNumber={orderNumber} />
    </main>
  );
}
