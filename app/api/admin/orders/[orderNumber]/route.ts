import path from "path";

import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  orderFilePath,
  orderStatuses,
  orderStatusLabel,
  readOrder,
  writeOrder,
  type StoredOrder,
} from "@/lib/adminOrders";
import { withFileLock } from "@/lib/jsonFileStore";
import {
  returnCommittedInventoryForCancellation,
  type InventoryReturnMetadata,
} from "@/lib/orderInventoryReturn";

const WEBSITE_FILE = path.join(process.cwd(), "public", "data", "website-data.json");

async function notifyGroup(text: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.LINE_ORDER_RECIPIENT_ID;
  if (!token || !to) return false;

  try {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function returnFailureMetadata(order: StoredOrder, warning: string): InventoryReturnMetadata {
  const existing = order.inventoryReturn as InventoryReturnMetadata | undefined;
  return {
    ...(existing || {
      startedAt: new Date().toISOString(),
      changes: [],
    }),
    state: "return_failed",
    failedAt: new Date().toISOString(),
    warning,
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const { orderNumber } = await params;
  if (!/^KD[0-9-]+$/.test(orderNumber)) {
    return NextResponse.json({ error: "找不到訂單" }, { status: 404 });
  }

  const body = await request.json();
  const status = String(body.status || "");
  if (!(orderStatuses as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "訂單狀態不正確" }, { status: 400 });
  }

  try {
    const result = await withFileLock(
      orderFilePath(orderNumber),
      async () => {
        let order = await readOrder(orderNumber);
        if (!order) return { notFound: true as const };

        const previous = order.status;
        order.status = status;
        order.trackingNumber = String(body.trackingNumber || "").trim().slice(0, 80);
        order.updatedAt = new Date().toISOString();
        order.statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
        order.statusHistory.push({ from: previous, to: status, at: order.updatedAt });

        if (status === "cancelled") {
          try {
            const inventoryReturn = await returnCommittedInventoryForCancellation({
              order,
              websiteFile: WEBSITE_FILE,
              persistOrder: writeOrder,
            });
            order = inventoryReturn.order;

            if (inventoryReturn.state === "return_failed") {
              return {
                ok: false as const,
                order,
                warning: inventoryReturn.warning || "取消狀態已儲存，但庫存回補失敗。",
              };
            }
          } catch (error) {
            const warning =
              error instanceof Error
                ? `取消狀態已儲存，但庫存回補失敗：${error.message}`
                : "取消狀態已儲存，但庫存回補失敗。";
            const latestOrder = (await readOrder(orderNumber)) || order;
            latestOrder.status = status;
            latestOrder.trackingNumber = order.trackingNumber;
            latestOrder.updatedAt = order.updatedAt;
            latestOrder.statusHistory = order.statusHistory;
            latestOrder.inventoryReturn = returnFailureMetadata(latestOrder, warning);
            await writeOrder(latestOrder);
            return { ok: false as const, order: latestOrder, warning };
          }
        } else {
          await writeOrder(order);
        }

        if (previous !== status) {
          const sent = await notifyGroup(
            `【KD Coffee 訂單狀態更新】\n\n訂單編號：${order.orderNumber}\n客戶：${order.customer?.name || "未填"}\n狀態：${orderStatusLabel(status)}\n物流編號：${order.trackingNumber || "尚未填寫"}`,
          );
          order.adminLineNotification = { sent, checkedAt: new Date().toISOString() };
          await writeOrder(order);
        }

        return { ok: true as const, order };
      },
      { timeoutMs: 15_000 },
    );

    if (result.notFound) {
      return NextResponse.json({ error: "找不到訂單" }, { status: 404 });
    }
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, saved: true, error: result.warning, warning: result.warning, order: result.order },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, order: result.order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "訂單狀態更新失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
