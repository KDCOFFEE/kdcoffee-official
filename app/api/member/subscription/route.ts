import { NextResponse } from "next/server";

import { getCurrentMember } from "@/lib/memberAuth";
import {
  MembershipCommerceError,
  MembershipRevisionConflictError,
  generateSubscriptionCycle,
  getMemberCommerceDashboard,
  memberSkipCycle,
  modifyCycleDate,
  setSubscriptionStatus,
  updateCycleItems,
  updateSubscriptionPreferences,
} from "@/lib/membershipCommerce";
import { getActiveMembershipRules } from "@/lib/membershipBusinessRules";
import { addTaipeiCalendarDays } from "@/lib/membershipPolicies";
import { getLiveWebsiteData } from "@/data/websiteData";
import { isAllowedRoastLevel } from "@/lib/checkoutRules";

export const dynamic = "force-dynamic";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

async function currentMember() {
  const member = await getCurrentMember();
  if (!member) throw new MembershipCommerceError("請先登入會員");
  return member;
}

export async function GET() {
  try {
    const member = await currentMember();
    const [dashboard, version] = await Promise.all([getMemberCommerceDashboard(member.id), getActiveMembershipRules()]);
    return NextResponse.json({ ...dashboard, rules: { intervalsDays: version.rules.subscription.intervalsDays, delayQuickOptionsDays: version.rules.subscription.delayQuickOptionsDays, preparationLeadDays: version.rules.subscription.preparationLeadDays } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "讀取失敗" }, { status: 401 });
  }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "無法確認請求來源" }, { status: 403 });
  try {
    const member = await currentMember();
    const body = await request.json();
    const action = String(body.action || "");
    const idempotencyKey = String(body.idempotencyKey || "").slice(0, 120);
    if (!idempotencyKey) throw new MembershipCommerceError("操作識別遺失，請再試一次");

    if (["advance", "delay", "change-date"].includes(action)) {
      await modifyCycleDate({ memberId: member.id, cycleId: String(body.cycleId), expectedRevision: Number(body.expectedRevision), plannedDate: String(body.plannedDate), recalculateAnchor: Boolean(body.recalculateAnchor), idempotencyKey });
    } else if (action === "skip") {
      await memberSkipCycle({ memberId: member.id, cycleId: String(body.cycleId), expectedRevision: Number(body.expectedRevision), idempotencyKey });
    } else if (["pause", "resume", "terminate"].includes(action)) {
      await setSubscriptionStatus({ memberId: member.id, subscriptionId: String(body.subscriptionId), expectedRevision: Number(body.expectedRevision), status: action === "pause" ? "paused" : action === "resume" ? "active" : "terminated", resumeDate: body.resumeDate ? String(body.resumeDate) : undefined, intervalDays: body.intervalDays == null ? undefined : Number(body.intervalDays), reason: action === "pause" ? "會員暫停配送" : action === "resume" ? "會員選擇新日期恢復配送" : "會員停止定期配送", idempotencyKey });
    } else if (action === "replenish") {
      const dashboard = await getMemberCommerceDashboard(member.id);
      const subscription = dashboard.subscriptions.find((item) => item.subscriptionId === String(body.subscriptionId));
      if (!subscription) throw new MembershipCommerceError("找不到定期購");
      const version = await getActiveMembershipRules();
      const plannedDate = addTaipeiCalendarDays(new Date().toISOString().slice(0, 10), version.rules.subscription.preparationLeadDays);
      await generateSubscriptionCycle({ subscriptionId: subscription.subscriptionId, sequence: Date.now(), plannedDate, kind: "manual_replenishment", idempotencyKey });
    } else if (action === "change-store") {
      await updateSubscriptionPreferences({ memberId: member.id, subscriptionId: String(body.subscriptionId), expectedRevision: Number(body.expectedRevision), shippingMethod: "711_cod", storeSelection: { storeId: String(body.storeId || "").slice(0, 10), storeName: String(body.storeName || "").slice(0, 60) }, idempotencyKey });
    } else if (action === "change-items") {
      const dashboard = await getMemberCommerceDashboard(member.id);
      const cycle = dashboard.cycles.find((item) => item.cycleId === String(body.cycleId));
      if (!cycle) throw new MembershipCommerceError("找不到配送期次");
      const version = await getActiveMembershipRules();
      const current = cycle.itemsDraft[0];
      const packageWeight = body.packageWeight === "one-pound" ? "one-pound" as const : "half-pound" as const;
      if (current.packageWeight === "half-pound" && packageWeight === "one-pound" && !version.rules.subscription.allowHalfToOnePound) throw new MembershipCommerceError("目前未開放半磅改為一磅");
      if (current.packageWeight === "one-pound" && packageWeight === "half-pound" && !version.rules.subscription.allowOneToHalfPound) throw new MembershipCommerceError("目前未開放一磅改為半磅");
      const productA = String(body.productA || "");
      const productB = packageWeight === "one-pound" ? String(body.productB || productA) : productA;
      if (packageWeight === "one-pound" && productA !== productB && !version.rules.subscription.allowMixedOnePound) throw new MembershipCommerceError("目前一磅只開放同款組合");
      const quantity = Number(body.quantity);
      if ((!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 12) || (quantity !== current.quantity && !version.rules.subscription.allowQuantityChange)) throw new MembershipCommerceError("數量設定不正確");
      const roast = String(body.roast || "");
      if (!isAllowedRoastLevel(roast)) throw new MembershipCommerceError("請選擇可用的烘焙度");
      const website = await getLiveWebsiteData();
      const productMap = new Map(website.menu.products.filter((product) => product.active && product.purchasable !== false && product.status === "active").map((product) => { const sku = (product.skus || product.purchase || []).find((option) => option.kind === "beans" && option.enabled !== false && Number(option.stock ?? 1) > 0); return [product.slug, sku ? { name: product.name, price: Number(sku.price) } : null] as const; }).filter((entry): entry is [string, { name: string; price: number }] => Boolean(entry[1])));
      const selectedA = productMap.get(productA); const selectedB = productMap.get(productB);
      if (!selectedA || !selectedB) throw new MembershipCommerceError("選擇的咖啡目前不可加入定期配送");
      const components = packageWeight === "one-pound" ? [{ productId: productA, weightHalfPounds: 1 as const }, { productId: productB, weightHalfPounds: 1 as const }] : [{ productId: productA, weightHalfPounds: 1 as const }];
      await updateCycleItems({ memberId: member.id, cycleId: cycle.cycleId, expectedRevision: Number(body.expectedRevision), items: [{ itemId: `${productA}:${packageWeight}:${productB}`, packageWeight, quantity, roast, components, unitPrice: packageWeight === "one-pound" ? selectedA.price + selectedB.price : selectedA.price }], idempotencyKey });
    } else {
      throw new MembershipCommerceError("不支援的操作");
    }
    return NextResponse.json({ ok: true, ...(await getMemberCommerceDashboard(member.id)) });
  } catch (error) {
    const status = error instanceof MembershipRevisionConflictError ? 409 : error instanceof MembershipCommerceError ? 400 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "操作失敗" }, { status });
  }
}
