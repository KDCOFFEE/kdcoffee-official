import { NextResponse } from "next/server";

import { getCurrentMember } from "@/lib/memberAuth";
import {
  MembershipCommerceError,
  MembershipRevisionConflictError,
  generateSubscriptionCycle,
  getMemberCommerceDashboard,
  hideTerminatedSubscriptionFromMember,
  lockSubscriptionCycle,
  memberSkipCycle,
  modifyCycleDate,
  setSubscriptionStatus,
  updateCycleItems,
  updateSubscriptionPreferences,
} from "@/lib/membershipCommerce";
import { getActiveMembershipRules } from "@/lib/membershipBusinessRules";
import { addTaipeiCalendarDays } from "@/lib/membershipPolicies";
import { getLiveWebsiteData } from "@/data/websiteData";
import { isSameOriginRequest } from "@/lib/requestSecurity";
import { resolveMemberSubscriptionItems } from "@/lib/subscriptionSkuModel";
import { validateDeliveryAddress } from "@/lib/deliveryAddress";

export const dynamic = "force-dynamic";

async function currentMember() {
  const member = await getCurrentMember();
  if (!member) throw new MembershipCommerceError("請先登入會員");
  return member;
}

export async function GET() {
  try {
    const member = await currentMember();
    const [dashboard, version] = await Promise.all([getMemberCommerceDashboard(member.id), getActiveMembershipRules()]);
    return NextResponse.json({ ...dashboard, rules: { intervalsDays: version.rules.subscription.intervalOptions.filter((item) => item.enabled).map((item) => item.days), customCycleEnabled: version.rules.subscription.customCycleEnabled, customCycleMinDays: version.rules.subscription.customCycleMinDays, customCycleMaxDays: version.rules.subscription.customCycleMaxDays, delayQuickOptionsDays: version.rules.subscription.delayQuickOptionsDays, advanceQuickOptionsDays: version.rules.subscription.advanceQuickOptionsDays, preparationLeadDays: version.rules.subscription.preparationLeadDays, datePickerMode: version.rules.subscription.datePickerMode, maxModificationsPerCycle: version.rules.subscription.maxModificationsPerCycle } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "讀取失敗" }, { status: 401 });
  }
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "無法確認請求來源" }, { status: 403 });
  try {
    const member = await currentMember();
    const body = await request.json();
    const action = String(body.action || "");
    const idempotencyKey = String(body.idempotencyKey || "").slice(0, 120);
    if (!idempotencyKey) throw new MembershipCommerceError("操作識別遺失，請再試一次");
    const actionResult: { action: string; plannedDate?: string; subscriptionId?: string } = { action };

    if (["advance", "delay", "change-date"].includes(action)) {
      const cycle = await modifyCycleDate({ memberId: member.id, cycleId: String(body.cycleId), expectedRevision: Number(body.expectedRevision), plannedDate: String(body.plannedDate), recalculateAnchor: Boolean(body.recalculateAnchor), rushWarningAcknowledged: body.rushWarningAcknowledged === true, idempotencyKey });
      actionResult.plannedDate = cycle.plannedDate;
      actionResult.subscriptionId = cycle.subscriptionId;
    } else if (action === "skip") {
      const cycle = await memberSkipCycle({ memberId: member.id, cycleId: String(body.cycleId), expectedRevision: Number(body.expectedRevision), idempotencyKey });
      actionResult.subscriptionId = cycle.subscriptionId;
    } else if (action === "hide-terminated") {
      const subscription =
        await hideTerminatedSubscriptionFromMember({
          memberId: member.id,
          subscriptionId: String(body.subscriptionId),
          expectedRevision: Number(body.expectedRevision),
          idempotencyKey,
        });

      actionResult.subscriptionId = subscription.subscriptionId;
    } else if (["pause", "resume", "terminate"].includes(action)) {
      const beforeDashboard = action === "resume"
        ? await getMemberCommerceDashboard(member.id)
        : null;

      const subscription = await setSubscriptionStatus({
        memberId: member.id,
        subscriptionId: String(body.subscriptionId),
        expectedRevision: Number(body.expectedRevision),
        status: action === "pause" ? "paused" : action === "resume" ? "active" : "terminated",
        resumeDate: body.resumeDate ? String(body.resumeDate) : undefined,
        intervalDays: body.intervalDays == null ? undefined : Number(body.intervalDays),
        reason: action === "pause"
          ? "會員暫停配送"
          : action === "resume"
            ? "會員選擇新日期恢復配送"
            : "會員停止定期配送",
        idempotencyKey,
      });

      actionResult.subscriptionId = subscription.subscriptionId;

      if (action === "resume") {
        const scheduledCycles = (beforeDashboard?.cycles ?? [])
          .filter((cycle) =>
            cycle.subscriptionId === subscription.subscriptionId &&
            cycle.kind === "scheduled"
          );

        const editableCycle = scheduledCycles
          .filter((cycle) => ["scheduled", "modifiable"].includes(cycle.status))
          .sort((a, b) => b.sequence - a.sequence)[0];

        const committedCycle = scheduledCycles.some((cycle) =>
          ["locked", "order_created", "shipped", "ready_for_pickup", "blocked_stock"].includes(cycle.status)
        );

        if (editableCycle) {
          await modifyCycleDate({
            memberId: member.id,
            cycleId: editableCycle.cycleId,
            expectedRevision: editableCycle.revision,
            plannedDate: subscription.anchorDate,
            recalculateAnchor: false,
            idempotencyKey: `${idempotencyKey}:resume-cycle-date`,
          });
        } else if (!committedCycle) {
          const maxScheduledSequence = scheduledCycles.reduce(
            (maximum, cycle) => Math.max(maximum, cycle.sequence),
            0,
          );

          await generateSubscriptionCycle({
            subscriptionId: subscription.subscriptionId,
            sequence: maxScheduledSequence + 1,
            plannedDate: subscription.anchorDate,
            kind: "scheduled",
            idempotencyKey: `${idempotencyKey}:resume-cycle`,
          });
        }

        actionResult.plannedDate = subscription.anchorDate;
      }
    } else if (action === "replenish") {
      const dashboard = await getMemberCommerceDashboard(member.id);
      const subscription = dashboard.subscriptions.find((item) => item.subscriptionId === String(body.subscriptionId));
      if (!subscription) throw new MembershipCommerceError("找不到定期購");
      const version = await getActiveMembershipRules();
      const plannedDate = addTaipeiCalendarDays(new Date().toISOString().slice(0, 10), version.rules.subscription.preparationLeadDays);
      const cycle = await generateSubscriptionCycle({ subscriptionId: subscription.subscriptionId, sequence: Date.now(), plannedDate, kind: "manual_replenishment", idempotencyKey });
      await lockSubscriptionCycle({
        cycleId: cycle.cycleId,
        idempotencyKey: `${idempotencyKey}:lock`,
      });
      actionResult.plannedDate = cycle.plannedDate;
      actionResult.subscriptionId = cycle.subscriptionId;
    } else if (["change-shipping", "change-store"].includes(action)) {
      const shippingMethod = action === "change-store" ? "711_cod" : String(body.shippingMethod || "");
      if (!["studio_pickup", "711_cod", "home_delivery"].includes(shippingMethod)) throw new MembershipCommerceError("不支援的取貨方式");
      if (shippingMethod !== "home_delivery" && body.deliveryAddress != null) throw new MembershipCommerceError("此配送方式不可填寫宅配地址");
      if (shippingMethod === "home_delivery" && (body.storeId != null || body.storeName != null)) throw new MembershipCommerceError("宅配不可同時指定門市");
      const storeSelection = shippingMethod === "711_cod"
        ? { storeId: String(body.storeId || "").trim().slice(0, 10), storeName: String(body.storeName || "").trim().slice(0, 60) }
        : null;
      if (shippingMethod === "711_cod" && (!storeSelection?.storeId || !storeSelection.storeName)) throw new MembershipCommerceError("請先選擇有效的 7-ELEVEN 取貨門市");
      let deliveryAddress = null;
      if (shippingMethod === "home_delivery") {
        try { deliveryAddress = validateDeliveryAddress(body.deliveryAddress); }
        catch (error) { throw new MembershipCommerceError(error instanceof Error ? error.message : "宅配地址不正確"); }
      }
      const paymentMethod = shippingMethod === "home_delivery" ? String(body.paymentMethod || "") : null;
      if (shippingMethod === "home_delivery" && paymentMethod !== "atm_transfer" && paymentMethod !== "cash_on_delivery") throw new MembershipCommerceError("請選擇可用的宅配付款方式");
      await updateSubscriptionPreferences({ memberId: member.id, subscriptionId: String(body.subscriptionId), expectedRevision: Number(body.expectedRevision), shippingMethod, storeSelection, deliveryAddress, paymentMethod: paymentMethod as "atm_transfer" | "cash_on_delivery" | null, idempotencyKey });
    } else if (action === "change-items") {
      const dashboard = await getMemberCommerceDashboard(member.id);
      const cycle = dashboard.cycles.find((item) => item.cycleId === String(body.cycleId));
      if (!cycle) throw new MembershipCommerceError("找不到配送期次");
      const version = await getActiveMembershipRules();
      const website = await getLiveWebsiteData();
      const usesLegacySingleItemPayload = !Array.isArray(body.items);
      const requestedItems = !usesLegacySingleItemPayload
        ? body.items
        : [{
            skuKind: "beans",
            packageWeight: body.packageWeight === "one-pound" ? "one-pound" : "half-pound",
            quantity: Number(body.quantity),
            roast: String(body.roast || ""),
            components: body.packageWeight === "one-pound"
              ? [{ productId: String(body.productA || "") }, { productId: String(body.productB || body.productA || "") }]
              : [{ productId: String(body.productA || "") }],
          }];
      let items;
      try {
        items = resolveMemberSubscriptionItems({
          items: requestedItems,
          currentItems: cycle.itemsDraft,
          website,
          rules: version.rules,
          legacyPositionalMatching: usesLegacySingleItemPayload,
        });
      } catch (error) {
        throw new MembershipCommerceError(error instanceof Error ? error.message : "定期購商品設定不正確");
      }
      await updateCycleItems({ memberId: member.id, cycleId: cycle.cycleId, expectedRevision: Number(body.expectedRevision), items, rushWarningAcknowledged: body.rushWarningAcknowledged === true, idempotencyKey });
    } else {
      throw new MembershipCommerceError("不支援的操作");
    }
    const dashboard = await getMemberCommerceDashboard(member.id);
    if (action === "skip" && actionResult.subscriptionId) {
      actionResult.plannedDate = dashboard.cycles.find((cycle) => cycle.subscriptionId === actionResult.subscriptionId && ["scheduled", "modifiable"].includes(cycle.status))?.plannedDate;
    }
    return NextResponse.json({ ok: true, ...dashboard, actionResult });
  } catch (error) {
    const status = error instanceof MembershipRevisionConflictError ? 409 : error instanceof MembershipCommerceError ? 400 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "操作失敗" }, { status });
  }
}
