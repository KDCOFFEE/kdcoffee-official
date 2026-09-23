import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

let checks = 0;
function expect(condition: unknown, message: string) {
  checks += 1;
  if (!condition) throw new Error(`FAIL ${checks}: ${message}`);
}

const checkout = source("app/checkout/page.tsx");
expect(checkout.includes('const subscriptionHomeDeliveryBlocked = mode === "home_delivery" && paymentMethod === "atm_transfer";'), "checkout derives ATM subscription block");
expect(checkout.includes('setSubscriptionBlockedDialogOpen(true)'), "checkout intercepts home ATM subscription activation with explanation");
expect(checkout.includes("ATM 轉帳僅提供單次宅配訂單"), "checkout explains ATM is single-order only");
expect(checkout.includes('宅配定期配送目前固定使用「貨到付款」'), "checkout explains subscription COD-only rule");
expect(checkout.includes('setPaymentMethod("atm_transfer"); setJoinSubscription(false);'), "switching to ATM clears subscription intent immediately");
expect(checkout.includes('if (subscriptionHomeDeliveryBlocked && joinSubscription)'), "checkout clears stale subscription intent defensively");
expect(checkout.includes('subscriptionRenewalCodServiceFee'), "subscription preview uses COD service fee");

const orders = source("app/api/orders/route.ts");
expect(orders.includes('subscriptionIntent && orderMode === "home_delivery" && paymentMethod !== "cash_on_delivery"'), "orders API rejects non-COD home subscription enrollment");
expect(orders.includes("宅配定期配送僅支援貨到付款"), "orders API has customer-safe rejection message");

const memberRoute = source("app/api/member/subscription/route.ts");
expect(memberRoute.includes('body.paymentMethod != null && String(body.paymentMethod) !== "cash_on_delivery"'), "member API rejects explicit non-COD home subscription payment");
expect(memberRoute.includes('const paymentMethod = shippingMethod === "home_delivery" ? "cash_on_delivery" : null;'), "member API fixes home subscription preference to COD");

const memberUi = source("components/member/MemberSubscriptionExperience.tsx");
expect(memberUi.includes("宅配定期配送付款方式：貨到付款"), "member center shows fixed COD payment method");
expect(memberUi.includes("貨到付款手續費 NT$"), "member center shows COD service fee");
expect(!memberUi.includes("未來宅配付款方式"), "member center no longer offers home payment selector");
expect(!memberUi.includes('name="homePaymentChoice"'), "member center has no hidden home payment radio inputs");
expect(!memberUi.includes("paymentMethodDraft"), "member center has no payment-method draft state");
expect(memberUi.includes('paymentMethod: shippingMethodDraft === "home_delivery" ? "cash_on_delivery" : null'), "member center submits COD for home subscription");
expect(memberUi.includes('supportedShippingMethod === "home_delivery" ? "cash_on_delivery" : null'), "unlocked future home preview treats payment as COD");

const commerce = source("lib/membershipCommerce.ts");
expect(commerce.includes('paymentMethod: "cash_on_delivery" as const'), "commerce normalizes future home subscription preference to COD");
expect(!commerce.includes('input.paymentMethod !== "atm_transfer" && input.paymentMethod !== "cash_on_delivery"'), "commerce no longer preserves ATM as a future home subscription preference");

const scheduler = source("lib/subscriptionOrderScheduler.ts");
expect(scheduler.includes('lockedDelivery.paymentMethod !== "cash_on_delivery"'), "scheduler refuses non-COD home subscription snapshots");
expect(scheduler.includes('const homePayment = method === "home_delivery" ? "cash_on_delivery" : null;'), "scheduler creates home subscription orders as COD only");
expect(!scheduler.includes("createAtmTransferSnapshot"), "scheduler does not create ATM transfer snapshots for subscription orders");
expect(!scheduler.includes("atmTransferSnapshot:"), "scheduler subscription order has no ATM snapshot field");

console.log(`PASS: Phase 2D.2 subscription home delivery COD-only — ${checks} checks`);
