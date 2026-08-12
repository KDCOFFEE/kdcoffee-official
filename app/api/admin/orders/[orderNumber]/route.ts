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
import { getWebsiteDataFile } from "@/lib/storagePaths";

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
 * LINE 群組通知
 * ============================================================
 *
 * 使用 LINE Messaging API
 * 通知管理群組訂單狀態更新。
 *
 * 原本邏輯完全保留。
 */
async function notifyGroup(text: string) {
  const token =
    process.env.LINE_CHANNEL_ACCESS_TOKEN;

  const to =
    process.env.LINE_ORDER_RECIPIENT_ID;

  /**
   * 如果 Production 沒有設定 LINE 環境變數，
   * 不阻擋訂單狀態更新。
   */
  if (!token || !to) {
    return false;
  }

  try {
    const response = await fetch(
      "https://api.line.me/v2/bot/message/push",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${token}`,

          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          to,

          messages: [
            {
              type: "text",
              text,
            },
          ],
        }),

        /**
         * LINE API 最多等待 5 秒。
         *
         * LINE 通知失敗不應卡住訂單後台。
         */
        signal:
          AbortSignal.timeout(
            5_000,
          ),
      },
    );

    return response.ok;
  } catch {
    return false;
  }
}

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
    /**
     * 對這張訂單加 File Lock，
     * 避免同一時間重複修改訂單。
     */
    const result =
      await withFileLock(
        orderFilePath(
          orderNumber,
        ),

        async () => {
          let order =
            await readOrder(
              orderNumber,
            );

          if (!order) {
            return {
              notFound:
                true as const,
            };
          }

          const previous =
            order.status;

          order.status =
            status;

          order.trackingNumber =
            String(
              body.trackingNumber ||
                "",
            )
              .trim()
              .slice(
                0,
                80,
              );

          order.updatedAt =
            new Date()
              .toISOString();

          order.statusHistory =
            Array.isArray(
              order.statusHistory,
            )
              ? order.statusHistory
              : [];

          order.statusHistory.push(
            {
              from: previous,
              to: status,
              at: order.updatedAt,
            },
          );

          /**
           * ====================================================
           * 訂單取消 → 庫存回補
           * ====================================================
           *
           * websiteFile 現在使用 Persistent Storage 路徑。
           */
          if (
            status ===
            "cancelled"
          ) {
            try {
              const inventoryReturn =
                await returnCommittedInventoryForCancellation(
                  {
                    order,

                    websiteFile:
                      WEBSITE_FILE,

                    persistOrder:
                      writeOrder,
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

              const latestOrder =
                (await readOrder(
                  orderNumber,
                )) ||
                order;

              latestOrder.status =
                status;

              latestOrder.trackingNumber =
                order.trackingNumber;

              latestOrder.updatedAt =
                order.updatedAt;

              latestOrder.statusHistory =
                order.statusHistory;

              latestOrder.inventoryReturn =
                returnFailureMetadata(
                  latestOrder,
                  warning,
                );

              await writeOrder(
                latestOrder,
              );

              return {
                ok:
                  false as const,

                order:
                  latestOrder,

                warning,
              };
            }
          } else {
            /**
             * 非取消狀態，
             * 正常儲存訂單狀態更新。
             */
            await writeOrder(
              order,
            );
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
            const sent =
              await notifyGroup(
                `【KD Coffee 訂單狀態更新】\n\n訂單編號：${order.orderNumber}\n客戶：${order.customer?.name || "未填"}\n狀態：${orderStatusLabel(status)}\n物流編號：${order.trackingNumber || "尚未填寫"}`,
              );

            order.adminLineNotification =
              {
                sent,

                checkedAt:
                  new Date()
                    .toISOString(),
              };

            await writeOrder(
              order,
            );
          }

          return {
            ok:
              true as const,

            order,
          };
        },

        {
          timeoutMs:
            15_000,
        },
      );

    /**
     * 訂單不存在。
     */
    if (
      result.notFound
    ) {
      return NextResponse.json(
        {
          error:
            "找不到訂單",
        },
        {
          status: 404,
        },
      );
    }

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

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}