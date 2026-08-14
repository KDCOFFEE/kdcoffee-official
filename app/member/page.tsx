import Link from "next/link";
import { promises as fs } from "fs";
import path from "path";

import { getCurrentMember, safeReturnPath } from "@/lib/memberAuth";
import { getOrdersDir } from "@/lib/storagePaths";

import MemberProfileForm from "@/components/member/MemberProfileForm";
import EmailAuthForms from "@/components/member/EmailAuthForms";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 * 會員頁顯示使用的訂單摘要格式
 * ============================================================
 *
 * 這裡只列出會員頁實際需要顯示的欄位，
 * 不修改正式訂單資料結構。
 */
type OrderSummary = {
  orderNumber: string;
  createdAt: string;
  orderMode: string;
  status: string;
  total?: number;
  subtotal?: number;

  lineNotification?: {
    sent?: boolean;
    status?: string;
  };

  store?: {
    name?: string;
  };
};

/**
 * ============================================================
 * 取得目前會員的最近訂單
 * ============================================================
 *
 * 原本：
 *
 * data/orders
 *
 *
 * 現在統一改用：
 *
 * getOrdersDir()
 *
 *
 * Windows 本機沒有 KD_DATA_DIR：
 *
 * → data/orders
 *
 *
 * Railway 未來設定：
 *
 * KD_DATA_DIR=/data
 *
 * → /data/orders
 *
 *
 * 這樣會員頁與正式訂單 API
 * 才會讀取同一份 Persistent Storage 訂單資料。
 */
async function getMemberOrders(
  memberId: string,
) {
  const dir =
    getOrdersDir();

  try {
    /**
     * 取得所有訂單 JSON。
     */
    const files =
      (
        await fs.readdir(
          dir,
        )
      ).filter(
        (file) =>
          file.endsWith(
            ".json",
          ),
      );

    const orders:
      OrderSummary[] = [];

    /**
     * 一張一張讀取訂單，
     * 只保留屬於目前登入會員的訂單。
     */
    for (const file of files) {
      try {
        const order =
          JSON.parse(
            await fs.readFile(
              path.join(
                dir,
                file,
              ),
              "utf8",
            ),
          );

        if (
          order.member?.memberId ===
          memberId
        ) {
          orders.push(
            order,
          );
        }
      } catch {
        /**
         * 單一訂單 JSON 如果讀取失敗，
         * 不阻擋整個會員頁。
         *
         * 保留原本既有行為。
         */
      }
    }

    /**
     * 最新訂單排前面，
     * 最多顯示最近 20 筆。
     */
    return orders
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(
            a.createdAt,
          ),
      )
      .slice(
        0,
        20,
      );
  } catch {
    /**
     * 訂單資料夾不存在或讀取失敗時，
     * 顯示空訂單列表。
     */
    return [];
  }
}

/**
 * 訂單取貨方式顯示文字。
 *
 * 原本邏輯不修改。
 */
function modeLabel(
  mode: string,
) {
  return mode === "711_cod"
    ? "7-ELEVEN 取貨付款"
    : "工作室自取";
}

/**
 * 訂單狀態顯示文字。
 *
 * 原本邏輯不修改。
 */
function statusLabel(
  status: string,
) {
  if (
    status ===
    "waiting_merchant_create_cod_shipment"
  ) {
    return "待建立寄件單";
  }

  if (
    status ===
    "waiting_studio_pickup_confirmation"
  ) {
    return "待確認自取時間";
  }

  if (
    status ===
    "completed"
  ) {
    return "已完成";
  }

  if (
    status ===
    "cancelled"
  ) {
    return "已取消";
  }

  return "訂單已成立";
}

/**
 * ============================================================
 * 會員中心頁面
 * ============================================================
 */
export default async function MemberPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    returnTo?: string;
  }>;
}) {
  const params =
    await searchParams;
  const returnTo = safeReturnPath(params.returnTo);

  const member =
    await getCurrentMember();

  /**
   * 尚未登入會員。
   */
  if (!member) {
    return (
      <main className="member-page">
        <section className="member-login-card">
          <p className="eyebrow dark">
            KD COFFEE MEMBER
          </p>

          <h1>
            快速會員登入
          </h1>

          <p>
            可使用 LINE 快速登入，或以 Email 建立會員。登入後可查看自己的訂單與常用資料。
          </p>

          {params.error && (
            <p className="form-error">
              LINE 登入未完成，請再試一次。
            </p>
          )}

          <a
            className="line-login-button"
            href={`/api/auth/line/login?returnTo=${encodeURIComponent(returnTo)}`}
          >
            使用 LINE 登入／註冊
          </a>

          <EmailAuthForms returnTo={returnTo} />

          <Link
            className="text-link"
            href="/"
          >
            返回首頁
          </Link>
        </section>
      </main>
    );
  }

  /**
   * 使用目前會員 ID
   * 取得他的最近訂單。
   */
  const orders =
    await getMemberOrders(
      member.id,
    );
  const displayName = member.displayName?.trim() || "KD Coffee 會員";

  return (
    <main className="member-page">
      <section className="member-card">
        <div className="member-profile">
          {member.pictureUrl ? (
            <img
              src={member.pictureUrl}
              alt="會員頭像"
            />
          ) : (
            <div className="member-avatar-fallback">
              KD
            </div>
          )}

          <div className="member-profile-copy">
            <p className="eyebrow dark">
              KD COFFEE MEMBER
            </p>

            <h1>
              {displayName}
            </h1>

            <p>
              歡迎回來。常用資料會在結帳時自動帶入。
            </p>
          </div>
        </div>

        <div className="member-actions">
          <Link href="/works">
            選購咖啡作品
          </Link>

          <Link
            className="member-primary-action"
            href="/checkout"
          >
            前往結帳
          </Link>
        </div>

        <div className="member-info-grid">
          <div>
            <small>
              常用姓名
            </small>

            <strong>
              {member.pickupName ||
                "尚未設定"}
            </strong>
          </div>

          <div>
            <small>
              手機號碼
            </small>

            <strong>
              {member.phone ||
                "尚未設定"}
            </strong>
          </div>

          <div>
            <small>
              常用門市
            </small>

            <strong>
              {member.favoriteStore
                ?.name ||
                "尚未設定"}
            </strong>

            {member.favoriteStore
              ?.address && (
              <span>
                {
                  member
                    .favoriteStore
                    .address
                }
              </span>
            )}
          </div>

          <div>
            <small>
              會員建立日期
            </small>

            <strong>
              {new Date(
                member.createdAt,
              ).toLocaleDateString(
                "zh-TW",
              )}
            </strong>

            <span>
              最近登入：
              {new Date(
                member.lastLoginAt,
              ).toLocaleString(
                "zh-TW",
              )}
            </span>
          </div>
        </div>

        <MemberProfileForm
          initial={{
            pickupName:
              member.pickupName,

            phone:
              member.phone,

            email:
              member.email,
          }}
        />

        <section className="member-orders">
          <div className="member-section-head">
            <div>
              <p className="eyebrow dark">
                ORDER HISTORY
              </p>

              <h2>
                最近訂單
              </h2>
            </div>

            <span>
              {orders.length} 筆
            </span>
          </div>

          {orders.length ? (
            orders.map(
              (order) => (
                <article
                  className="member-order-card"
                  key={
                    order.orderNumber
                  }
                >
                  <div className="member-order-main">
                    <strong>
                      {
                        order.orderNumber
                      }
                    </strong>

                    <small>
                      {new Date(
                        order.createdAt,
                      ).toLocaleString(
                        "zh-TW",
                      )}
                      ・
                      {modeLabel(
                        order.orderMode,
                      )}
                    </small>

                    {order.store
                      ?.name && (
                      <small>
                        取貨門市：
                        {
                          order
                            .store
                            .name
                        }
                      </small>
                    )}
                  </div>

                  <div className="member-order-meta">
                    <span className="order-status-chip">
                      {statusLabel(
                        order.status,
                      )}
                    </span>

                    <b>
                      NT${" "}
                      {(
                        order.total ??
                        order.subtotal ??
                        0
                      ).toLocaleString(
                        "zh-TW",
                      )}
                    </b>

                    <small
                      className={
                        order
                          .lineNotification
                          ?.sent
                          ? "line-status sent"
                          : "line-status pending"
                      }
                    >
                      {order
                        .lineNotification
                        ?.sent
                        ? "LINE 已通知工作室"
                        : "訂單已保存"}
                    </small>
                  </div>
                </article>
              ),
            )
          ) : (
            <div className="member-empty-orders">
              <strong>
                目前還沒有會員訂單
              </strong>

              <p>
                完成第一筆訂購後，訂單紀錄會顯示在這裡。
              </p>

              <Link href="/works">
                開始選購咖啡
              </Link>
            </div>
          )}
        </section>

        <form
          action="/api/auth/logout"
          method="post"
        >
          <button className="logout-button">
            登出會員
          </button>
        </form>
      </section>
    </main>
  );
}
