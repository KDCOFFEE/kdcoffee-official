import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const checkout = read("app/checkout/page.tsx");
const conversation = read("components/orders/OrderConversation.tsx");
const messages = read("app/api/orders/[orderNumber]/messages/route.ts");
const dialog = read("components/orders/AtmTransferInfoDialog.tsx");
const photos = read("lib/orderNotificationPhotos.ts");
const transferClaim = read("app/api/orders/[orderNumber]/transfer-claim/route.ts");

let checks = 0;
function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  checks += 1;
}

assert(checkout.includes('AtmTransferInfoDialog'), "checkout uses ATM information dialog");
assert(checkout.includes('查看銀行帳號、複製全部匯款資料或存簿圖片'), "checkout has compact ATM callout");
assert(checkout.includes('setSubscriptionBlockedDialogOpen(true)'), "ATM subscription click opens explanation");
assert(checkout.includes('ATM 轉帳無法使用定期配送'), "subscription explanation dialog is present");
assert(checkout.includes('改用貨到付款並啟用定期配送'), "dialog offers COD switch");
assert(checkout.includes('維持 ATM 單次購買'), "dialog offers single-order ATM");
assert(!/(?:^|\s)disabled=\{subscriptionHomeDeliveryBlocked\}/m.test(checkout), "blocked checkbox remains interactive for explanation");

assert(dialog.includes('複製全部匯款資料'), "ATM dialog supports copy all");
assert(dialog.includes('複製帳號'), "ATM dialog has explicit account copy button");
assert(dialog.includes('查看存簿圖片'), "ATM dialog can view bankbook image");
assert(dialog.includes('下載存簿圖片'), "ATM dialog can download bankbook image");
assert(dialog.includes('showBankbookImage'), "bankbook visibility still respects setting/snapshot");

assert(messages.includes('cancellation: order.status === "cancelled"'), "customer DTO includes cancellation metadata");
assert(messages.includes('order.cancellationReason.trim()'), "customer DTO exposes stored cancellation reason");
assert(conversation.includes('取消原因：'), "order detail displays cancellation reason");
assert(conversation.includes('此筆歷史訂單未記錄取消原因'), "legacy cancelled orders have safe fallback copy");
assert(conversation.includes('gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))"'), "home delivery data uses responsive grid");
assert(conversation.includes('order.status !== "cancelled" && order.orderMode === "home_delivery"'), "cancelled ATM orders do not show transfer report form");

assert(conversation.includes('上傳後系統會自動縮小尺寸並轉為 WebP 儲存'), "ATM receipt UI explains image optimization");
assert(photos.includes('.resize({ width: 1600, height: 1600'), "existing receipt storage resizes images");
assert(photos.includes('.webp({ quality: 84 })'), "existing receipt storage converts to WebP");
assert(transferClaim.includes('sendInternalLineNotification('), "ATM report still triggers internal LINE alert");
assert(transferClaim.includes('assertAtmClaimable'), "ATM claim safety gate remains present");
assert(transferClaim.includes('order.status === "cancelled"'), "cancelled order is still server-blocked from ATM claim");

console.log(`PASS: Phase 2D.3 ATM payment UX — ${checks} checks`);
