import assert from "node:assert/strict";
import fs from "node:fs";

import {
  normalizeAtmTransferClaims,
  validateAtmTransferClaimInput,
} from "../lib/homeDeliveryPayment";

let checks = 0;
const check = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const now = new Date("2026-09-23T01:00:00.000Z");
const valid = validateAtmTransferClaimInput({
  accountLast5: "82641",
  transferredAt: "2026-09-23T00:30:00.000Z",
  amount: 1420,
  now,
});
check(valid.accountLast5 === "82641", "last five digits should be preserved");
check(valid.amount === 1420, "order amount should be preserved");
check(valid.transferredAt === "2026-09-23T00:30:00.000Z", "transfer time should normalize to ISO");

assert.throws(() => validateAtmTransferClaimInput({ accountLast5: "1234", transferredAt: valid.transferredAt, amount: 1420, now }), /末五碼/);
checks += 1;
assert.throws(() => validateAtmTransferClaimInput({ accountLast5: "12A45", transferredAt: valid.transferredAt, amount: 1420, now }), /末五碼/);
checks += 1;
assert.throws(() => validateAtmTransferClaimInput({ accountLast5: "12345", transferredAt: "not-a-date", amount: 1420, now }), /日期與時間/);
checks += 1;
assert.throws(() => validateAtmTransferClaimInput({ accountLast5: "12345", transferredAt: "2026-09-23T03:30:00.000Z", amount: 1420, now }), /不能晚於現在太多/);
checks += 1;

const normalized = normalizeAtmTransferClaims([
  {
    actionId: "6e1f7a0e-8912-4a91-8812-123456789abc",
    accountLast5: "82641",
    amount: 1420,
    transferredAt: "2026-09-23T00:30:00.000Z",
    submittedAt: "2026-09-23T00:40:00.000Z",
    receipt: {
      url: "/uploads/order-notifications/6e1f7a0e-8912-4a91-8812-123456789abc.webp",
      mimeType: "image/webp",
      bytes: 12345,
      width: 800,
      height: 1200,
    },
  },
  { actionId: "bad", accountLast5: "x", amount: -1 },
]);
check(normalized.length === 1, "invalid persisted claims should be ignored");
check(normalized[0].receipt?.url.startsWith("/uploads/order-notifications/") === true, "receipt URL must stay inside order-notifications");

const checkout = fs.readFileSync("app/checkout/page.tsx", "utf8");
const atmDialog = fs.readFileSync("components/orders/AtmTransferInfoDialog.tsx", "utf8");
check(checkout.includes("AtmTransferInfoDialog"), "checkout should render ATM transfer information dialog");
check(atmDialog.includes("複製帳號"), "ATM dialog should provide account copy button");
check(atmDialog.includes("匯款帳號末五碼"), "ATM dialog should explain transfer reporting");

const conversation = fs.readFileSync("components/orders/OrderConversation.tsx", "utf8");
check(conversation.includes("ATM TRANSFER REPORT"), "customer order detail should include ATM report section");
check(conversation.includes("transfer-claim"), "customer order detail should call transfer claim API");
check(conversation.includes("等待工作室核對入帳"), "customer UI must distinguish transfer report from confirmed payment");

const claimRoute = fs.readFileSync("app/api/orders/[orderNumber]/transfer-claim/route.ts", "utf8");
check(claimRoute.includes("paymentDetails?.status === \"paid\""), "paid orders should reject additional transfer claims");
check(claimRoute.includes("projectOrderFinancialBreakdown"), "claim amount should come from order financials");
check(claimRoute.includes("validateAndStoreOrderNotificationPhoto"), "receipt upload should reuse existing validated image storage");
check(claimRoute.includes("atmTransferClaims"), "claim should persist on the order");
check(!claimRoute.includes("paymentDetails: { method: \"atm_transfer\", status: \"paid\""), "customer claim must not mark order paid");

const adminOrder = fs.readFileSync("app/admin/orders/[orderNumber]/page.tsx", "utf8");
check(adminOrder.includes("匯款帳號末五碼"), "Admin should show transfer last five digits");
check(adminOrder.includes("待核對入帳"), "Admin should distinguish reported from paid");

const messageRoute = fs.readFileSync("app/api/orders/[orderNumber]/messages/route.ts", "utf8");
check(messageRoute.includes("atmTransferClaims"), "customer order DTO should expose own transfer claims");

console.log(`PASS: Phase 2D.1 ATM transfer claim — ${checks} checks`);
