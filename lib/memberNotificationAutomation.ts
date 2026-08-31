import { isValidEmail, readMember } from "./memberAuth";
import { sendCustomerLineNotification, sendCustomerOrderEmail } from "./customerNotificationDelivery";
import { claimNextMembershipNotification, completeMembershipNotificationDelivery, type NotificationEvent } from "./membershipCommerce";

const eventLabels: Record<NotificationEvent["eventType"], string> = {
  modification_window: "下一次定期配送已可調整",
  deadline_tomorrow: "定期配送修改期限即將截止",
  order_created: "定期購訂單已建立",
  shipped: "定期購訂單已出貨",
  ready_for_pickup: "咖啡已到店，可以準備取貨",
  uncollected_terminated: "定期購狀態需要確認",
  gift_eligible: "本次配送已達贈品里程碑",
  stock_blocked: "本次配送商品需要重新選擇",
  subscription_paused: "定期配送已暫停",
  subscription_resumed: "定期配送已恢復",
  subscription_terminated: "定期配送已停止",
  cycle_skipped: "本次定期配送已跳過",
  referral_conversion: "推薦回饋已更新",
  credit_issued: "會員抵用金已入帳",
  credit_expiring: "會員抵用金即將到期",
};

function template(notice: NotificationEvent) {
  const title = eventLabels[notice.eventType];
  return { eventType: notice.eventType, subject: `KD Coffee｜${title}`, text: `KD Coffee｜${title}\n\n請登入會員中心查看最新安排與可操作項目。` };
}

export async function deliverNextMembershipNotification(options: { stateFilePath?: string; lineFetcher?: typeof fetch; emailFetcher?: typeof fetch; now?: Date } = {}) {
  const notice = await claimNextMembershipNotification({ stateFilePath: options.stateFilePath, now: options.now });
  if (!notice) return null;
  const delivered: NotificationEvent["channels"] = notice.channels.includes("member_center") ? ["member_center"] : [];
  const errors: string[] = [];
  const member = notice.memberId ? await readMember(notice.memberId) : null;
  const message = template(notice);

  let lineSucceeded = false;
  if (notice.channels.includes("line")) {
    if (member?.lineUserId) {
      const result = await sendCustomerLineNotification({ userId: member.lineUserId, template: message, fetcher: options.lineFetcher });
      lineSucceeded = result.status === "sent";
      if (lineSucceeded) delivered.push("line"); else errors.push(result.error || "LINE 通知失敗");
    } else errors.push("會員沒有可用的 LINE 身份");
  }

  const shouldEmail = notice.channels.includes("email") || (!lineSucceeded && notice.deliveryPolicy?.emailFallback === true);
  if (shouldEmail) {
    if (member?.email && isValidEmail(member.email)) {
      const result = await sendCustomerOrderEmail({ recipientEmail: member.email, orderNumber: "會員通知", template: message, subject: message.subject, fetcher: options.emailFetcher });
      if (result.status === "sent") delivered.push("email"); else errors.push(result.error || "Email 通知失敗");
    } else errors.push("會員沒有可用的 Email");
  }
  if (notice.channels.includes("admin")) delivered.push("admin");

  return completeMembershipNotificationDelivery({ notificationId: notice.notificationId, deliveredChannels: delivered, error: errors.join("；") || undefined, stateFilePath: options.stateFilePath, now: options.now });
}

export async function deliverPendingMembershipNotifications(options: { limit?: number; stateFilePath?: string; lineFetcher?: typeof fetch; emailFetcher?: typeof fetch; now?: Date } = {}) {
  const results = [];
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  for (let index = 0; index < limit; index += 1) {
    const result = await deliverNextMembershipNotification(options);
    if (!result) break;
    results.push(result);
  }
  return results;
}
