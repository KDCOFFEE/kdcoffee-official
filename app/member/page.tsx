import { MemberCopyValue, MemberCopyElement } from "@/components/member/MemberCenterCopyProvider";
import Link from "next/link";
import { promises as fs } from "fs";
import path from "path";

import { getCurrentMember, getMemberLoginMethods, safeReturnPath } from "@/lib/memberAuth";
import { getOrdersDir, getWebsiteDataFile } from "@/lib/storagePaths";

import MemberProfileForm from "@/components/member/MemberProfileForm";
import MemberAvatarForm from "@/components/member/MemberAvatarForm";
import EmailAuthForms from "@/components/member/EmailAuthForms";
import PhoneAuthForms from "@/components/member/PhoneAuthForms";
import MemberMobileDisclosure from "@/components/member/MemberMobileDisclosure";
import MemberSectionNav from "@/components/member/MemberSectionNav";
import MemberSubscriptionExperience from "@/components/member/MemberSubscriptionExperience";
import MemberReferralCenter from "@/components/member/MemberReferralCenter";
import MemberQualificationSummary from "@/components/member/MemberQualificationSummary";
import memberExperienceStyles from "@/components/member/MemberCenterExperience.module.css";
import { getMemberCommerceDashboard, getMemberReferralCenter } from "@/lib/membershipCommerce";
import { getActiveMembershipRules } from "@/lib/membershipBusinessRules";
import { fulfillmentRecordForOrder, readFulfillmentStore } from "@/lib/fulfillment";
import { fulfillmentStateLabels, type FulfillmentState } from "@/lib/fulfillmentTypes";
import type { MemberSubscriptionProduct } from "@/components/member/memberSubscriptionEditorModel";
import { MEMBER_SUBSCRIPTION_MAX_ITEMS } from "@/lib/subscriptionItemTypes";

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

async function getSubscriptionProducts(): Promise<MemberSubscriptionProduct[]> {
  try {
    const website = JSON.parse(await fs.readFile(getWebsiteDataFile(), "utf8"));
    if (!Array.isArray(website?.menu?.products)) return [];
    return website.menu.products.flatMap((product: Record<string, unknown>) => {
      if (product.active !== true || product.purchasable === false || product.status !== "active" || typeof product.slug !== "string" || typeof product.name !== "string") return [];
      const options = Array.isArray(product.skus) && product.skus.length ? product.skus : Array.isArray(product.purchase) ? product.purchase : [];
      const eligibleOptions = options.flatMap((option: Record<string, unknown>) => {
        const kind = option.kind === "beans" || option.kind === "drip" ? option.kind : null;
        const price = Number(option.price);
        if (!kind || typeof option.id !== "string" || !option.id.trim() || option.enabled === false || Number(option.stock ?? 1) <= 0 || !Number.isSafeInteger(price) || price < 0) return [];
        return [{ skuId: option.id, kind, label: String(option.label || ""), detail: String(option.detail || ""), price }];
      });
      return eligibleOptions.length ? [{ id: product.slug, name: product.name, roast: typeof product.roast === "string" ? product.roast : "工作室建議", options: eligibleOptions }] : [];
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
    : mode === "home_delivery" ? "宅配" : "工作室自取";
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
          <p className="eyebrow dark"><MemberCopyValue value={"KD COFFEE MEMBER"} /></p>

          <h1><MemberCopyValue value={"快速會員登入"} /></h1>

          <p><MemberCopyValue value={"可使用 LINE、手機號碼或 Email 登入。登入後可查看自己的訂單與常用資料。"} /></p>

          {params.error && (
            <p className="form-error">
              <MemberCopyValue value={params.error === "account_link_required"
                ? "此登入方式需要完成帳號連結驗證。請先登入既有帳號，再從會員中心連結 LINE。"
                : "LINE 登入未完成，請再試一次。"} />
            </p>
          )}

          <a
            className="line-login-button"
            href={`/api/auth/line/login?returnTo=${encodeURIComponent(returnTo)}`}
          ><MemberCopyValue value={"使用 LINE 登入／註冊"} /></a>

          <PhoneAuthForms returnTo={returnTo} />

          <div className="member-auth-divider" aria-hidden="true">
            <span><MemberCopyValue value={"或"} /></span>
          </div>

          <EmailAuthForms returnTo={returnTo} />

          <Link
            className="text-link"
            href="/"
          ><MemberCopyValue value={"返回首頁"} /></Link>
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
  const [loginMethods, commerce, rulesVersion, subscriptionProducts, referralCenter] = await Promise.all([
    getMemberLoginMethods(member),
    getMemberCommerceDashboard(member.id),
    getActiveMembershipRules(),
    getSubscriptionProducts(),
    getMemberReferralCenter(member.id, { baseUrl: process.env.MEMBER_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "" }),
  ]);
  const availableCredit = commerce.credits
    .filter((item) => item.status === "available")
    .reduce((sum, item) => sum + item.remainingAmount, 0);
  const rawPointDisplayName = rulesVersion.rules.referral.pointDisplayName || "KD點";
  const pointDisplayName = /^[A-Za-z]+$/.test(rawPointDisplayName)
    ? rawPointDisplayName.toUpperCase()
    : rawPointDisplayName;
  const pendingRewardPoints = commerce.pendingRewardSummary.rewardPoints;
  const pendingRewardCount = commerce.pendingRewardSummary.rewardCount;
  const pendingRewardCredit = commerce.pendingRewardSummary.projectedCreditAmount;
  const latestOrder = orders[0];
  const primarySubscription = commerce.subscriptions.find((item) => ["active", "pending_activation", "paused"].includes(item.status)) ?? commerce.subscriptions[0];
  const nextSubscriptionCycle = commerce.cycles
    .filter((item) => ["scheduled", "modifiable", "order_created"].includes(item.status))
    .sort((left, right) => left.plannedDate.localeCompare(right.plannedDate))[0];
  const subscriptionStatus = primarySubscription
    ? primarySubscription.status === "active" ? "進行中" : primarySubscription.status === "paused" ? "已暫停" : primarySubscription.status === "terminated" ? "已停止" : "待啟用"
    : "尚未建立";
  const subscriptionShipping = primarySubscription
    ? primarySubscription.shippingMethod === "711_cod" ? `7-ELEVEN${primarySubscription.storeSelection?.storeName ? `・${primarySubscription.storeSelection.storeName}` : ""}` : primarySubscription.shippingMethod === "home_delivery" ? "宅配" : "工作室自取"
    : "尚未設定";
  const referralRules = rulesVersion.rules.referral;
  const referralExperienceData = {
    ...referralCenter,
    availableCreditBalance: availableCredit,
    rewardCreditSources: commerce.rewardCreditSources,
    pendingRetailPromotionRewards: commerce.pendingRetailPromotionRewards,
    displayRules: {
      pointDisplayName: referralRules.pointDisplayName,
      pvRewardMoneyValue: referralRules.pvRewardMoneyValue,
      payoutQualification: {
        mode: referralRules.payoutQualification.mode,
        qualificationBasis: referralRules.payoutQualification.qualificationBasis,
        generalMember: {
          windowDays: referralRules.payoutQualification.generalMember.rollingWindowDays,
          threshold: referralRules.payoutQualification.qualificationBasis === "pv"
            ? referralRules.payoutQualification.generalMember.cumulativeValidPVThreshold
            : referralRules.payoutQualification.generalMember.cumulativeValidConsumptionThreshold,
        },
        activeSubscriptionMember: {
          windowDays: referralRules.payoutQualification.activeSubscriptionMember.rollingWindowDays,
          threshold: referralRules.payoutQualification.qualificationBasis === "pv"
            ? referralRules.payoutQualification.activeSubscriptionMember.cumulativeValidPVThreshold
            : referralRules.payoutQualification.activeSubscriptionMember.cumulativeValidConsumptionThreshold,
        },
      },
      baseWaitingDays: referralRules.referralRewardBaseWaitingDays,
      returnProtectionDays: referralRules.referralRewardReturnProtectionDays,
    },
  };

  return (
    <main className="member-page">
      <section className="member-card">
        {params.linked === "line" && (
          <p className="member-notice success"><MemberCopyValue value={"LINE 登入方式已連結完成。"} /></p>
        )}
        {params.error === "account_link_required" && (
          <p className="member-notice"><MemberCopyValue value={"此登入方式需要完成帳號連結驗證。請先登入既有帳號，再從「登入方式」連結 LINE。"} /></p>
        )}
        {params.error === "line_link_failed" && (
          <p className="member-notice"><MemberCopyValue value={"LINE 連結未完成。此 LINE 可能已連結其他會員，或驗證已逾時；會員資料沒有變更。"} /></p>
        )}
        <MemberSectionNav />

        <div id="member-overview" className="member-overview-panel" data-member-section role="tabpanel">
        <section className="member-welcome-hero">
          <div className="member-welcome-main">
            {(member.avatarUrl || member.pictureUrl) ? (
              <MemberCopyElement as="img" className="member-welcome-avatar" src={member.avatarUrl || member.pictureUrl} alt="會員頭像" />
            ) : (
              <div className="member-welcome-avatar member-avatar-fallback"><MemberCopyValue value={"KD"} /></div>
            )}

            <div className="member-profile-copy">
              <p className="eyebrow dark"><MemberCopyValue value={"KD COFFEE MEMBER"} /></p>
              <h1><MemberCopyValue value={memberName ? `${memberName}，歡迎回來` : "歡迎回來"} /></h1>
              <p><MemberCopyValue value={"享受每一杯咖啡，也感謝你成為 KD Coffee 的一份子。"} /></p>
              <div className="member-welcome-meta">
                <span><MemberCopyValue value={"會員編號 "} /><strong>{loginMethods.memberNumber}</strong></span>
              </div>
            </div>
          </div>

          <div className="member-welcome-art" aria-hidden="true">
            <span className="member-welcome-steam">Good Coffee</span>
            <strong>A Better Day</strong>
            <div className="member-welcome-cup"><i /></div>
          </div>
        </section>

        <MemberCopyElement as="section" className="member-dashboard" aria-label="會員總覽">
          <div className="member-dashboard-grid">
            <Link
              className="member-dashboard-card"
              href="/member?rewardView=released#rewards"
              data-reward-shortcut="released"
            >
              <small><MemberCopyValue value={"可用折抵額"} /></small>
              <strong>{availableCredit.toLocaleString("zh-TW")}<MemberCopyValue value={" 元"} /></strong>
              <span><MemberCopyValue value={"已正式入帳，結帳時可自行選擇使用"} /></span>
            </Link>
            <Link
              className="member-dashboard-card"
              href="/member?rewardView=pending#rewards"
              data-reward-shortcut="pending"
            >
              <small><MemberCopyValue value={"待入帳回饋"} /></small>
              <strong>{pendingRewardPoints.toLocaleString("zh-TW")} <MemberCopyValue value={pointDisplayName} /></strong>
              <span><MemberCopyValue value={"共 "} />{pendingRewardCount}<MemberCopyValue value={" 筆・預估折抵 NT$ "} />{pendingRewardCredit.toLocaleString("zh-TW")}<MemberCopyValue value={commerce.pendingRewardSummary.hasIncompletePointHistory ? "・部分歷史點數未記錄" : ""} /></span>
            </Link>
            <a className="member-dashboard-card" href="#subscription">
              <small><MemberCopyValue value={"下一次配送"} /></small>
              <strong><MemberCopyValue value={nextSubscriptionCycle ? formatTaipeiDate(nextSubscriptionCycle.plannedDate) : "尚未排定"} /></strong>
              <span><MemberCopyValue value={primarySubscription ? `${subscriptionStatus}・${subscriptionShipping}` : "建立定期配送後會顯示於此"} /></span>
            </a>
            <a className="member-dashboard-card" href="#orders">
              <small><MemberCopyValue value={"最近訂單"} /></small>
              <strong><MemberCopyValue value={latestOrder ? (latestOrder.fulfillment ? fulfillmentStateLabels[latestOrder.fulfillment.currentState] : statusLabel(latestOrder.status)) : "尚無訂單"} /></strong>
              <span><MemberCopyValue value={latestOrder ? latestOrder.orderNumber : "完成第一筆訂購後會顯示於此"} /></span>
            </a>
          </div>

        </MemberCopyElement>
        <MemberQualificationSummary progress={referralCenter.qualificationProgress} />
        <MemberCopyElement as="section" className="member-quick-actions" aria-label="快速功能">
          <header><h2><MemberCopyValue value={"快速功能"} /></h2></header>
          <div className="member-quick-action-grid">
            <a href="#rewards"><strong><MemberCopyValue value={"我的回饋"} /></strong></a>
            <a href="#subscription"><strong><MemberCopyValue value={"配送設定"} /></strong></a>
            <a href="#orders"><strong><MemberCopyValue value={"我的訂單"} /></strong></a>
            <a href="#account"><strong><MemberCopyValue value={"帳戶設定"} /></strong></a>
          </div>
        </MemberCopyElement>

        <section className={`member-recent-activity ${memberExperienceStyles.recentActivity}`} aria-labelledby="member-recent-activity-title">
          <header><h2 id="member-recent-activity-title"><MemberCopyValue value={"最近動態"} /></h2></header>
          <div className="member-activity-list">
            {latestOrder ? (
              <a className="member-activity-row" href="#orders">
                <span className="member-activity-copy">
                  <small><MemberCopyValue value={"最近訂單"} /></small>
                  <strong><MemberCopyValue value={latestOrder.fulfillment ? fulfillmentStateLabels[latestOrder.fulfillment.currentState] : statusLabel(latestOrder.status)} /></strong>
                  <span>{latestOrder.orderNumber}</span>
                </span>
                <span className="member-activity-action"><span><MemberCopyValue value={"查看訂單"} /></span><b aria-hidden="true">→</b></span>
              </a>
            ) : null}
            {nextSubscriptionCycle ? (
              <a className="member-activity-row" href="#subscription">
                <span className="member-activity-copy">
                  <small><MemberCopyValue value={"定期配送"} /></small>
                  <strong><MemberCopyValue value={"下一次配送"} /></strong>
                  <span>{formatTaipeiDate(nextSubscriptionCycle.plannedDate)} · <MemberCopyValue value={subscriptionShipping} /></span>
                </span>
                <span className="member-activity-action"><span><MemberCopyValue value={"配送設定"} /></span><b aria-hidden="true">→</b></span>
              </a>
            ) : null}
            {pendingRewardPoints > 0 ? (
              <a className="member-activity-row" href="#rewards">
                <span className="member-activity-copy">
                  <small><MemberCopyValue value={"會員回饋"} /></small>
                  <strong><MemberCopyValue value={"回饋待入帳"} /></strong>
                  <span>{pendingRewardPoints.toLocaleString("zh-TW")} <MemberCopyValue value={pointDisplayName} /></span>
                </span>
                <span className="member-activity-action"><span><MemberCopyValue value={"查看回饋"} /></span><b aria-hidden="true">→</b></span>
              </a>
            ) : null}
            {!latestOrder && !nextSubscriptionCycle && pendingRewardPoints <= 0 ? <p><MemberCopyValue value={"目前沒有需要處理的新動態。"} /></p> : null}
          </div>
        </section>
        </div>

        <section id="account" data-member-section role="tabpanel" hidden>
        <MemberMobileDisclosure
          className="member-account-summary"
          eyebrow="ACCOUNT"
          title="帳戶資料"
          actionLabel="編輯"
          summary={<span className="member-ia-summary"><span className="member-ia-account-identity"><b>{memberName || loginMethods.memberNumber}</b></span><span><MemberCopyValue value={member.email || "Email 尚未設定"} /></span><span><MemberCopyValue value={member.phone || "電話尚未設定"} /></span><span><MemberCopyValue value={loginMethods.emailLinked ? "Email 已連結" : "Email 未連結"} />・<MemberCopyValue value={loginMethods.lineLinked ? "LINE 已連結" : "LINE 未連結"} /></span></span>}
        >
          <div className="member-account-inline-layout">
            <div className="member-account-static-grid">
              <div>
                <small><MemberCopyValue value={"會員編號"} /></small>
                <strong>{loginMethods.memberNumber}</strong>
                <span><MemberCopyValue value={"固定會員識別，不可變更。"} /></span>
              </div>
              <div>
                <small><MemberCopyValue value={"會員建立日期"} /></small>
                <strong>{formatTaipeiDate(member.createdAt)}</strong>
                <span><MemberCopyValue value={"最近登入："} />{formatTaipeiDateTime(member.lastLoginAt)}</span>
              </div>
              <div>
                <small><MemberCopyValue value={"常用門市"} /></small>
                <strong><MemberCopyValue value={member.favoriteStore?.name || "尚未設定"} /></strong>
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
            <section className="member-login-methods" id="login-methods">
              <div className="member-section-head"><div><p className="eyebrow dark"><MemberCopyValue value={"會員帳號"} /></p><h2><MemberCopyValue value={"登入方式"} /></h2></div></div>
              <div className="member-login-method-row"><div><strong><MemberCopyValue value={"電子郵件"} /></strong><span><MemberCopyValue value={loginMethods.emailLinked ? "已連結" : "尚未連結"} /></span></div><b className={loginMethods.emailLinked ? "is-linked" : ""}><MemberCopyValue value={loginMethods.emailLinked ? "✓ 可使用" : "信箱驗證功能準備中"} /></b></div>
              <div className="member-login-method-row"><div><strong><MemberCopyValue value={"LINE"} /></strong><span><MemberCopyValue value={loginMethods.lineLinked ? "已連結" : "尚未連結"} /></span></div>{loginMethods.lineLinked ? <b className="is-linked"><MemberCopyValue value={"✓ 可使用"} /></b> : <form action="/api/auth/line/link" method="post"><button type="submit"><MemberCopyValue value={"連結 LINE"} /></button></form>}</div>
              <p className="member-login-method-note"><MemberCopyValue value={"登入方式只用來確認是您本人；訂單與會員紀錄都會保留在同一個會員帳號。"} /></p>
            </section>
            <form action="/api/auth/logout" method="post"><button className="logout-button"><MemberCopyValue value={"登出會員"} /></button></form>
          </div>
        </MemberMobileDisclosure>
        </section>

        <div className="member-dashboard-content">
        <section id="subscription" data-member-section role="tabpanel" hidden>
        <MemberMobileDisclosure eyebrow="SUBSCRIPTION" title="定期配送" actionLabel="管理配送" summary={<span className="member-ia-summary"><span><MemberCopyValue value={primarySubscription ? `每 ${primarySubscription.intervalDays} 天` : "尚未建立方案"} /></span><span><MemberCopyValue value={subscriptionStatus} /></span><span><MemberCopyValue value={nextSubscriptionCycle ? `下一次 ${formatTaipeiDate(nextSubscriptionCycle.plannedDate)}` : "下一次尚未排定"} /></span><span><MemberCopyValue value={subscriptionShipping} /></span></span>}>
          <MemberSubscriptionExperience {...commerce} products={subscriptionProducts} rules={{ intervalsDays: rulesVersion.rules.subscription.intervalOptions.filter((item) => item.enabled).map((item) => item.days), customCycleEnabled: rulesVersion.rules.subscription.customCycleEnabled, customCycleMinDays: rulesVersion.rules.subscription.customCycleMinDays, customCycleMaxDays: rulesVersion.rules.subscription.customCycleMaxDays, delayQuickOptionsDays: rulesVersion.rules.subscription.delayQuickOptionsDays, advanceQuickOptionsDays: rulesVersion.rules.subscription.advanceQuickOptionsDays, preparationLeadDays: rulesVersion.rules.subscription.preparationLeadDays, customRoastPreparationLeadDays: rulesVersion.rules.subscription.customRoastPreparationLeadDays, discountPercent: rulesVersion.rules.subscription.discountPercent, sevenElevenShippingFee: rulesVersion.rules.shipping.sevenElevenShippingFee, homeDeliveryShippingFee: rulesVersion.rules.shipping.homeDeliveryShippingFee, homeDeliveryCodFee: rulesVersion.rules.shipping.homeDeliveryCodFee, subscriptionShippingDiscount: rulesVersion.rules.shipping.subscriptionShippingDiscount, datePickerMode: rulesVersion.rules.subscription.datePickerMode, maxModificationsPerCycle: rulesVersion.rules.subscription.maxModificationsPerCycle, allowOtherSubscriptionProducts: rulesVersion.rules.subscription.allowOtherSubscriptionProducts, allowHalfToOnePound: rulesVersion.rules.subscription.allowHalfToOnePound, allowOneToHalfPound: rulesVersion.rules.subscription.allowOneToHalfPound, allowMixedOnePound: rulesVersion.rules.subscription.allowMixedOnePound, allowQuantityChange: rulesVersion.rules.subscription.allowQuantityChange, maxItems: MEMBER_SUBSCRIPTION_MAX_ITEMS }} />
        </MemberMobileDisclosure>
        </section>
        <MemberReferralCenter initialData={referralExperienceData} />

        <section id="orders" data-member-section role="tabpanel" hidden>
        <MemberMobileDisclosure eyebrow="ORDERS" title="我的訂單" actionLabel="查看" summary={<span className="member-ia-summary"><span><MemberCopyValue value={latestOrder ? (latestOrder.fulfillment ? fulfillmentStateLabels[latestOrder.fulfillment.currentState] : statusLabel(latestOrder.status)) : "尚無訂單"} /></span><span><MemberCopyValue value={latestOrder ? latestOrder.orderNumber : "完成第一筆訂購後會顯示於此"} /></span><span>{latestOrder ? `NT$ ${(latestOrder.total ?? latestOrder.subtotal ?? 0).toLocaleString("zh-TW")}` : ""}</span></span>}>
        <section className="member-orders">
          <div className="member-section-head">
            <div>
              <p className="eyebrow dark"><MemberCopyValue value={"ORDER HISTORY"} /></p>

              <h2><MemberCopyValue value={"最近訂單"} /></h2>
            </div>

            <span><MemberCopyValue value={"顯示最近 "} />{Math.min(orders.length, 3)}<MemberCopyValue value={" 筆・共 "} />{orders.length}<MemberCopyValue value={" 筆"} /></span>
          </div>

          {orders.length ? (
            orders.slice(0, 3).map(
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
                      <small><MemberCopyValue value={"取貨門市："} />{
                          order
                            .store
                            .name
                        }
                      </small>
                    )}

                    {order.fulfillment ? (
                      <div className="member-fulfillment-summary">
                        <strong><MemberCopyValue value={fulfillmentStateLabels[order.fulfillment.currentState]} /></strong>
                        {order.fulfillment.pickupDeadline ? <span><MemberCopyValue value={"取貨期限："} />{formatTaipeiDate(order.fulfillment.pickupDeadline)}</span> : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="member-order-meta">
                    <span className="order-status-chip">
                      <MemberCopyValue value={order.fulfillment
                        ? fulfillmentStateLabels[order.fulfillment.currentState]
                        : statusLabel(order.status)} />
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
                      <MemberCopyValue value={order
                        .lineNotification
                        ?.sent
                        ? "LINE 已通知工作室"
                        : "訂單已保存"} />
                    </small>

                    <Link
                      className="member-order-detail-link"
                      href={`/orders/${encodeURIComponent(order.orderNumber)}`}
                    ><MemberCopyValue value={"查看／管理此訂單"} /></Link>
                  </div>
                </article>
              ),
            )
          ) : (
            <div className="member-empty-orders">
              <strong><MemberCopyValue value={"目前還沒有會員訂單"} /></strong>

              <p><MemberCopyValue value={"完成第一筆訂購後，訂單紀錄會顯示在這裡。"} /></p>

              <Link href="/works"><MemberCopyValue value={"開始選購咖啡"} /></Link>
            </div>
          )}
        </section>
        </MemberMobileDisclosure>
        </section>
        </div>
      </section>
    </main>
  );
}
