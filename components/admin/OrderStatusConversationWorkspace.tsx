"use client";

import type { ComponentProps } from "react";

import AdminOrderConversation from "@/components/admin/AdminOrderConversation";
import OrderStatusForm from "@/components/admin/OrderStatusForm";

export default function OrderStatusConversationWorkspace(
  props: ComponentProps<typeof OrderStatusForm>,
) {
  return (
    <>
      <OrderStatusForm {...props} />
      <AdminOrderConversation
        orderNumber={props.orderNumber}
        lineAvailable={props.customerNotificationCapability.lineAvailable}
        emailAvailable={props.customerNotificationCapability.emailAvailable}
      />
    </>
  );
}
