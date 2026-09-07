import Link from "next/link";
import { promises as fs } from "fs";
import path from "path";

import { getCurrentMember, getMemberLoginMethods, safeReturnPath } from "@/lib/memberAuth";
import { getOrdersDir, getWebsiteDataFile } from "@/lib/storagePaths";

import MemberProfileForm from "@/components/member/MemberProfileForm";
import MemberAvatarForm from "@/components/member/MemberAvatarForm";
import EmailAuthForms from "@/components/member/EmailAuthForms";
import MemberMobileDisclosure from "@/components/member/MemberMobileDisclosure";
import MemberSectionNav from "@/components/member/MemberSectionNav";
import MemberSubscriptionExperience from "@/components/member/MemberSubscriptionExperience";
import MemberReferralCenter from "@/components/member/MemberReferralCenter";
import { getMemberCommerceDashboard } from "@/lib/membershipCommerce";
import { getActiveMembershipRules } from "@/lib/membershipBusinessRules";
import { fulfillmentRecordForOrder, readFulfillmentStore } from "@/lib/fulfillment";
import { fulfillmentStateLabels, type FulfillmentState } from "@/lib/fulfillmentTypes";

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
  fulfillment?: {
    currentState: FulfillmentState;
    pickupDeadline?: string;
    events: Array<{ eventId:string; state:FulfillmentState; occurredAt:string }>;
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
    const fulfillmentStore = await readFulfillmentStore();
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
          const record = fulfillmentRecordForOrder(fulfillmentStore, order);
          orders.push({
            ...order,
            fulfillment: {
              currentState: record.currentState,
              pickupDeadline: record.pickupDeadline,
              events: record.events.map((event)=>({eventId:event.eventId,state:event.state,occurredAt:event.occurredAt})),
            },
          });
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

async function getSubscriptionProducts() {
  try {
    const website = JSON.parse(await fs.readFile(getWebsiteDataFile(), "utf8"));
    if (!Array.isArray(website?.menu?.products)) return [];
    return website.menu.products.flatMap((product: Record<string, unknown>) => {
      if (product.active !== true || product.purchasable === false || product.status !== "active" || typeof product.slug !== "string" || typeof product.name !== "string") return [];
      const options = Array.isArray(product.skus) ? product.skus : Array.isArray(product.purchase) ? product.purchase : [];
      const beans = options.find((option: Record<string, unknown>) => option.kind === "beans" && option.enabled !== false && Number(option.stock ?? 1) > 0 && Number.isSafeInteger(Number(option.price)));
      return beans ? [{ id: product.slug, name: product.name, price: Number(beans.price), roast: typeof product.roast === "string" ? product.roast : "工作室建議" }] : [];
    });
  } catch {
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
function formatTaipeiDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}/${map.month}/${map.day}`;
}

function formatTaipeiDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}/${map.month}/${map.day} ${map.hour}:${map.minute}`;
}

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
    linked?: string;
    returnTo?: string;
    ref?: string;
  }>;
}) {
  const params =
    await searchParams;
  const referralCode = typeof params.ref === "string" ? params.ref.trim().toUpperCase().slice(0, 40) : "";
  const returnTo = safeReturnPath(params.returnTo || (referralCode ? `/member?ref=${encodeURIComponent(referralCode)}` : "/member"));

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
              {params.error === "account_link_required"
                ? "此登入方式需要完成帳號連結驗證。請先登入既有帳號，再從會員中心連結 LINE。"
                : "LINE 登入未完成，請再試一次。"}
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
  const memberName = member.pickupName?.trim() || member.displayName?.trim() || "";
  const [loginMethods, commerce, rulesVersion, subscriptionProducts] = await Promise.all([getMemberLoginMethods(member), getMemberCommerceDashboard(member.id), getActiveMembershipRules(), getSubscriptionProducts()]);
  const availableCredit = commerce.credits
    .filter((item) => item.status === "available")
    .reduce((sum, item) => sum + item.remainingAmount, 0);
  const latestOrder = orders[0];

  return (
    <main className="member-page">
      <section className="member-card">
        {params.linked === "line" && (
          <p className="member-notice success">LINE 登入方式已連結完成。</p>
        )}
        {params.error === "account_link_required" && (
          <p className="member-notice">此登入方式需要完成帳號連結驗證。請先登入既有帳號，再從「登入方式」連結 LINE。</p>
        )}
        {params.error === "line_link_failed" && (
          <p className="member-notice">LINE 連結未完成。此 LINE 可能已連結其他會員，或驗證已逾時；會員資料沒有變更。</p>
        )}
        <MemberSectionNav />

        <section className="member-welcome-hero" id="member-overview">
          <div className="member-welcome-main">
            {(member.avatarUrl || member.pictureUrl) ? (
              <img className="member-welcome-avatar" src={member.avatarUrl || member.pictureUrl} alt="會員頭像" />
            ) : (
              <div className="member-welcome-avatar member-avatar-fallback">KD</div>
            )}

            <div className="member-profile-copy">
              <p className="eyebrow dark">KD COFFEE MEMBER</p>
              <h1>{memberName ? `${memberName}，歡迎回來` : "歡迎回來"}</h1>
              <p>享受每一杯咖啡，也感謝你成為 KD Coffee 的一份子。</p>
              <div className="member-welcome-meta">
                <span>會員編號 <strong>{loginMethods.memberNumber}</strong></span>
                <span>加入日期 <strong>{formatTaipeiDate(member.createdAt)}</strong></span>
              </div>
            </div>
          </div>

          <div className="member-welcome-art" aria-hidden="true">
            <span className="member-welcome-steam">Good Coffee</span>
            <strong>A Better Day</strong>
            <div className="member-welcome-cup"><i /></div>
          </div>
        </section>

        <section className="member-dashboard" aria-label="會員總覽">
          <div className="member-dashboard-grid">
            <a className="member-dashboard-card" href="#credit">
              <small>可用抵用金</small>
              <strong>NT$ {availableCredit.toLocaleString("zh-TW")}</strong>
              <span>結帳時可自行選擇使用</span>
            </a>
            <a className="member-dashboard-card" href="#credit">
              <small>待入帳回饋</small>
              <strong>NT$ {commerce.pendingCredit.toLocaleString("zh-TW")}</strong>
              <span>符合目前規則後轉為可用抵用金</span>
            </a>
            <a className="member-dashboard-card" href="#referral">
              <small>直接推薦</small>
              <strong>{commerce.referrals.length} 人</strong>
              <span>查看推薦與團隊進度</span>
            </a>
            <a className="member-dashboard-card" href="#orders">
              <small>最近訂單</small>
              <strong>{latestOrder ? (latestOrder.fulfillment ? fulfillmentStateLabels[latestOrder.fulfillment.currentState] : statusLabel(latestOrder.status)) : "尚無訂單"}</strong>
              <span>{latestOrder ? latestOrder.orderNumber : "完成第一筆訂購後會顯示於此"}</span>
            </a>
          </div>

        </section>

        <section className="member-qualification-banner">
          <div>
            <small>MEMBER STATUS</small>
            <strong>{commerce.pendingCredit > 0 ? "目前有推薦回饋等待入帳" : "會員帳戶已啟用"}</strong>
            <span>推薦資格與回饋狀態可在下方「推薦與回饋」查看完整資訊。</span>
          </div>
          <a href="#referral">查看推薦與回饋 <b>→</b></a>
        </section>

        <section className="member-quick-actions" aria-label="快速功能">
          <header>
            <div>
              <p className="eyebrow dark">QUICK ACTIONS</p>
              <h2>快速功能</h2>
            </div>
            <span>常用功能，快速前往</span>
          </header>
          <div className="member-quick-action-grid">
            <Link href="/works"><i>01</i><strong>選購咖啡作品</strong><span>瀏覽 KD Coffee 作品</span></Link>
            <a href="#referral"><i>02</i><strong>分享推薦連結</strong><span>邀請朋友加入</span></a>
            <a href="#orders"><i>03</i><strong>查看我的訂單</strong><span>掌握訂單最新狀態</span></a>
            <a href="#subscription"><i>04</i><strong>管理定期配送</strong><span>查看配送設定</span></a>
            <a href="#account"><i>05</i><strong>編輯帳戶資料</strong><span>管理會員資訊</span></a>
          </div>
        </section>

        <MemberMobileDisclosure id="account" className="member-account-summary" eyebrow="ACCOUNT" title="帳戶資料" summary="個人資料、頭像與常用門市">
          <div className="member-account-inline-layout">
            <div className="member-account-static-grid">
              <div>
                <small>會員編號</small>
                <strong>{loginMethods.memberNumber}</strong>
                <span>固定會員識別，不可變更。</span>
              </div>
              <div>
                <small>會員建立日期</small>
                <strong>{formatTaipeiDate(member.createdAt)}</strong>
                <span>最近登入：{formatTaipeiDateTime(member.lastLoginAt)}</span>
              </div>
              <div>
                <small>常用門市</small>
                <strong>{member.favoriteStore?.name || "尚未設定"}</strong>
                {member.favoriteStore?.address && <span>{member.favoriteStore.address}</span>}
              </div>
            </div>

            <MemberProfileForm
              initial={{
                pickupName: member.pickupName,
                phone: member.phone,
                email: member.email,
              }}
            />

            <MemberAvatarForm customAvatarUrl={member.avatarUrl} providerPictureUrl={member.pictureUrl} />
          </div>
        </MemberMobileDisclosure>

        <div className="member-dashboard-content">
        <MemberMobileDisclosure eyebrow="SUBSCRIPTION" title="定期配送與抵用金" summary="配送安排、抵用金與推薦摘要">
          <MemberSubscriptionExperience {...commerce} products={subscriptionProducts} rules={{ intervalsDays: rulesVersion.rules.subscription.intervalOptions.filter((item) => item.enabled).map((item) => item.days), customCycleEnabled: rulesVersion.rules.subscription.customCycleEnabled, customCycleMinDays: rulesVersion.rules.subscription.customCycleMinDays, customCycleMaxDays: rulesVersion.rules.subscription.customCycleMaxDays, delayQuickOptionsDays: rulesVersion.rules.subscription.delayQuickOptionsDays, advanceQuickOptionsDays: rulesVersion.rules.subscription.advanceQuickOptionsDays, preparationLeadDays: rulesVersion.rules.subscription.preparationLeadDays, discountPercent: rulesVersion.rules.subscription.discountPercent, datePickerMode: rulesVersion.rules.subscription.datePickerMode, maxModificationsPerCycle: rulesVersion.rules.subscription.maxModificationsPerCycle }} />
        </MemberMobileDisclosure>
        <MemberMobileDisclosure eyebrow="REFERRAL" title="推薦與回饋" summary={`直接推薦 ${commerce.referrals.length} 人・待入帳 NT$ ${commerce.pendingCredit.toLocaleString("zh-TW")}`}>
          <MemberReferralCenter />
        </MemberMobileDisclosure>

        <MemberMobileDisclosure eyebrow="ACCOUNT" title="登入方式" summary="管理 Email 與 LINE 登入">
        <section className="member-login-methods" id="login-methods">
          <div className="member-section-head">
            <div>
              <p className="eyebrow dark">會員帳號</p>
              <h2>登入方式</h2>
            </div>
          </div>
          <div className="member-login-method-row">
            <div><strong>電子郵件</strong><span>{loginMethods.emailLinked ? "已連結" : "尚未連結"}</span></div>
            <b className={loginMethods.emailLinked ? "is-linked" : ""}>{loginMethods.emailLinked ? "✓ 可使用" : "信箱驗證功能準備中"}</b>
          </div>
          <div className="member-login-method-row">
            <div><strong>LINE</strong><span>{loginMethods.lineLinked ? "已連結" : "尚未連結"}</span></div>
            {loginMethods.lineLinked ? (
              <b className="is-linked">✓ 可使用</b>
            ) : (
              <form action="/api/auth/line/link" method="post"><button type="submit">連結 LINE</button></form>
            )}
          </div>
          <p className="member-login-method-note">登入方式只用來確認是您本人；訂單與會員紀錄都會保留在同一個會員帳號。</p>
        </section>
        </MemberMobileDisclosure>

        <MemberMobileDisclosure eyebrow="ORDERS" title="我的訂單" summary={latestOrder ? `最近：${latestOrder.orderNumber}` : "尚無訂單紀錄"}>
        <section className="member-orders" id="orders">
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
                      {formatTaipeiDateTime(order.createdAt)}
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

                    {order.fulfillment ? (
                      <div className="member-fulfillment-summary">
                        <strong>{fulfillmentStateLabels[order.fulfillment.currentState]}</strong>
                        {order.fulfillment.pickupDeadline ? <span>取貨期限：{formatTaipeiDate(order.fulfillment.pickupDeadline)}</span> : null}
                        {order.fulfillment.events.length ? <ol>{order.fulfillment.events.slice(-4).map((event)=><li key={event.eventId}><time>{formatTaipeiDate(event.occurredAt)}</time><span>{fulfillmentStateLabels[event.state]}</span></li>)}</ol> : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="member-order-meta">
                    <span className="order-status-chip">
                      {order.fulfillment
                        ? fulfillmentStateLabels[order.fulfillment.currentState]
                        : statusLabel(order.status)}
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

                    <Link
                      className="member-order-detail-link"
                      href={`/orders/${encodeURIComponent(order.orderNumber)}`}
                    >
                      查看訂單／詢問此訂單
                    </Link>
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
        </MemberMobileDisclosure>

        <form
          action="/api/auth/logout"
          method="post"
        >
          <button className="logout-button">
            登出會員
          </button>
        </form>
        </div>
      </section>
    </main>
  );
}
