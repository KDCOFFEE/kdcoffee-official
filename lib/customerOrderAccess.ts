import "server-only";

import { getCurrentMember } from "@/lib/memberAuth";
import {
  authorizeOrderConversationAccess,
  type OrderConversationAccess,
} from "@/lib/orderConversation";
import type { StoredOrder } from "@/lib/adminOrders";

export async function resolveCustomerOrderAccess(
  order: StoredOrder,
  guestToken?: string,
): Promise<{ access: OrderConversationAccess; memberId?: string } | null> {
  const member = await getCurrentMember();
  const access = authorizeOrderConversationAccess(order, {
    memberId: member?.id,
    guestToken,
  });
  return access ? { access, memberId: member?.id } : null;
}
