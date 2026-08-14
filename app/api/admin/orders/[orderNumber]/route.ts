import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  assertOrderStatusTransition,
  normalizeCancellationReason,
  orderStatuses,
  orderStatusLabel,
  OrderCancellationReasonError,
  OrderStatusTransitionError,
  withStoredOrderUpdateLock,
  type OrderStatus,
  type StoredOrder,
} from "@/lib/adminOrders";
import { withFileLock } from "@/lib/jsonFileStore";
import { OrderFileNotFoundError } from "@/lib/orderFiles";
import {
  returnCommittedInventoryForCancellation,
  type InventoryReturnMetadata,
} from "@/lib/orderInventoryReturn";
import { getWebsiteDataFile } from "@/lib/storagePaths";
import { sendInternalLineNotification } from "@/lib/internalLineNotifications";

/**
 * ============================================================
 * Website Data Persistent Storage
 * ============================================================
 *
 * 這支 API 在「取消訂單」時，
 * 需要把已扣除的庫存回補到 website-data.json。
 *
 * 原本固定使用：
 *
 * public/data/website-data.json
 *
 *
 * 現在統一交由 storagePaths.ts 管理。
 *
 * Windows 本機沒有 KD_DATA_DIR：
 *
 * → public/data/website-data.json
 *
 *
 * Railway 未來設定：
 *
 * KD_DATA_DIR=/data
 *
 * → /data/store/website-data.json
 *
 *
 * 這樣訂單取消後的庫存回補，
 * 才會寫回真正 Persistent Storage 裡的商品資料。
 */
const WEBSITE_FILE = getWebsiteDataFile();

/**
 * ============================================================
 * 庫存回補失敗 Metadata
 * ============================================================
 *
 * 如果取消訂單已經儲存成功，
 * 但 inventory return 發生問題，
 * 將錯誤資訊記錄到訂單內。
 *
 * 原本邏輯保留。
 */
function returnFailureMetadata(
  order: StoredOrder,
  warning: string,
): InventoryReturnMetadata {
  const existing =
    order.inventoryReturn as
      | InventoryReturnMetadata
      | undefined;

  return {
    ...(existing || {
      startedAt:
        new Date().toISOString(),

      changes: [],
    }),

    state: "return_failed",

    failedAt:
      new Date().toISOString(),

    warning,
  };
}

/**
 * ============================================================
 * PATCH 訂單狀態
 * ============================================================
 *
 * 後台更新：
 *
 * - 訂單狀態
 * - 物流編號
 * - status history
 *
 * 如果狀態改成 cancelled，
 * 還會執行庫存回補。
 */
export async function PATCH(
  request: Request,

  {
    params,
  }: {
    params: Promise<{
      orderNumber: string;
    }>;
  },
) {
  /**
   * 必須先通過 Admin Login。
   */
  if (
    !(await isAdminAuthenticated())
  ) {
    return NextResponse.json(
      {
        error: "未授權",
      },
      {
        status: 401,
      },
    );
  }

  const { orderNumber } =
    await params;

  /**
   * 基本訂單編號安全驗證。
   */
  if (
    !/^KD[0-9-]+$/.test(
      orderNumber,
    )
  ) {
    return NextResponse.json(
      {
        error: "找不到訂單",
      },
      {
        status: 404,
      },
    );
  }

  const body =
    await request.json();

  const status =
    String(
      body.status || "",
    );

  /**
   * 只允許系統既有訂單狀態。
   */
  if (
    !(
      orderStatuses as readonly string[]
    ).includes(status)
  ) {
    return NextResponse.json(
      {
        error:
          "訂單狀態不正確",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const requestedStatus = status as OrderStatus;
    const updateLockedOrder = () =>
      withStoredOrderUpdateLock(
        orderNumber,
        async (latestOrder, persistOrder) => {
          assertOrderStatusTransition(
            latestOrder,
            requestedStatus,
          );
          const cancellationReason =
            requestedStatus === "cancelled"
              ? normalizeCancellationReason(body.cancellationReason)
              : undefined;

          const previous = latestOrder.status;
          const updatedAt = new Date().toISOString();
          let order: StoredOrder = {
            ...latestOrder,
            status: requestedStatus,
            trackingNumber: String(
              body.trackingNumber || "",
            )
              .trim()
              .slice(0, 80),
            updatedAt,
            ...(requestedStatus === "cancelled"
              ? {
                  cancelledAt: updatedAt,
                  cancelledBy: "admin",
                  cancellationReason,
                }
              : {}),
            statusHistory: [
              ...(Array.isArray(latestOrder.statusHistory)
                ? latestOrder.statusHistory
                : []),
              {
                from: previous,
                to: requestedStatus,
                at: updatedAt,
              },
            ],
          };

          /**
           * ====================================================
           * 訂單取消 → 庫存回補
           * ====================================================
           *
           * websiteFile 現在使用 Persistent Storage 路徑。
           */
          if (requestedStatus === "cancelled") {
            try {
              const inventoryReturn =
                await returnCommittedInventoryForCancellation(
                  {
                    order,

                    websiteFile:
                      WEBSITE_FILE,

                    persistOrder: async (nextOrder) => {
                      await persistOrder(nextOrder);
                    },

                    websiteLockHeld: true,
                  },
                );

              order =
                inventoryReturn.order;

              /**
               * 訂單取消可能已經成功，
               * 但庫存回補失敗。
               *
               * 保留原本錯誤處理方式。
               */
              if (
                inventoryReturn.state ===
                "return_failed"
              ) {
                return {
                  ok:
                    false as const,

                  order,

                  warning:
                    inventoryReturn.warning ||
                    "取消狀態已儲存，但庫存回補失敗。",
                };
              }
            } catch (error) {
              const warning =
                error instanceof Error
                  ? `取消狀態已儲存，但庫存回補失敗：${error.message}`
                  : "取消狀態已儲存，但庫存回補失敗。";

              order = {
                ...order,
                inventoryReturn:
                  returnFailureMetadata(
                    order,
                    warning,
                  ),
              };

              await persistOrder(order);

              return {
                ok:
                  false as const,

                order,

                warning,
              };
            }
          } else {
            /**
             * 非取消狀態，
             * 正常儲存訂單狀態更新。
             */
            await persistOrder(order);
          }

          /**
           * ====================================================
           * LINE 訂單狀態通知
           * ====================================================
           *
           * 只有狀態真的發生變化時才通知。
           */
          if (
            previous !==
            status
          ) {
            const { sent } =
              await sendInternalLineNotification(
                `【KD Coffee 訂單狀態更新】\n\n訂單編號：${order.orderNumber}\n客戶：${order.customer?.name || "未填"}\n狀態：${orderStatusLabel(status)}\n物流編號：${order.trackingNumber || "尚未填寫"}`,
                { attempts: 1, timeoutMs: 5_000 },
              );

            order = {
              ...order,
              adminLineNotification: {
                sent,

                checkedAt:
                  new Date()
                    .toISOString(),
              },
            };

            await persistOrder(order);
          }

          return {
            ok:
              true as const,

            order,
          };
        },
      );

    /**
     * 取消流程固定先取得 website-data lock，再取得 order lock。
     * 其他狀態更新只需要 order lock。
     */
    const result =
      status === "cancelled"
        ? await withFileLock(
            WEBSITE_FILE,
            updateLockedOrder,
            { timeoutMs: 15_000 },
          )
        : await updateLockedOrder();

    /**
     * 訂單取消狀態已寫入，
     * 但庫存回補失敗。
     */
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,

          saved: true,

          error:
            result.warning,

          warning:
            result.warning,

          order:
            result.order,
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      ok: true,
      order:
        result.order,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "訂單狀態更新失敗";

    const responseStatus =
      error instanceof OrderFileNotFoundError
        ? 404
        : error instanceof OrderCancellationReasonError
          ? error.status
        : error instanceof OrderStatusTransitionError
          ? error.status
          : 500;

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: responseStatus,
      },
    );
  }
}
