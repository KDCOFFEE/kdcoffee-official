import type {
  CustomerNotificationPhoto,
  CustomerNotificationResult,
  CustomerNotificationTemplate,
} from "@/lib/customerNotifications";
import {
  absoluteOrderNotificationUrl,
  LineImageAttachmentError,
  prepareLineImageAttachment,
  verifyPublicLineImageAttachment,
} from "@/lib/orderNotificationPhotos";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function absolutePhotoUrl(photo?: CustomerNotificationPhoto) {
  if (!photo) return undefined;
  try {
    return absoluteOrderNotificationUrl(photo.url);
  } catch {
    return undefined;
  }
}

export async function sendCustomerLineNotification(input: {
  userId: string;
  template: CustomerNotificationTemplate;
  photo?: CustomerNotificationPhoto;
  fetcher?: typeof fetch;
  publicImageFetcher?: typeof fetch;
}): Promise<CustomerNotificationResult> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!token) return { status: "not_configured", error: "LINE 通知服務尚未設定" };
  const messages: Record<string, string>[] = [{ type: "text", text: input.template.text }];
  let imageIssue: string | undefined;
  let imageHost: string | undefined;
  let lineHttpStatus: number | undefined;
  if (input.photo) {
    try {
      const attachment = await prepareLineImageAttachment(input.photo);
      await verifyPublicLineImageAttachment(attachment, input.publicImageFetcher ?? fetch);
      messages.push({
        type: "image",
        originalContentUrl: attachment.originalContentUrl,
        previewImageUrl: attachment.previewImageUrl,
      });
      imageHost = new URL(attachment.originalContentUrl).host;
    } catch (error) {
      imageIssue = error instanceof LineImageAttachmentError
        ? error.message
        : "圖片準備失敗";
      console.error("Customer LINE image preparation failed", {
        code: error instanceof LineImageAttachmentError ? error.code : "unexpected",
      });
    }
  }
  try {
    const response = await (input.fetcher ?? fetch)("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: input.userId, messages }),
      signal: AbortSignal.timeout(8_000),
    });
    lineHttpStatus = response.status;
    const diagnostics = {
      messageTypes: messages.map((message) => message.type) as Array<"text" | "image">,
      ...(messages.some((message) => message.type === "image") ? { imageMimeType: "image/jpeg" as const } : {}),
      ...(imageHost ? { imageHost } : {}),
      lineHttpStatus,
    };
    if (response.ok) {
      return imageIssue
        ? { status: "partial", error: `文字通知已送出，但${imageIssue}。`, diagnostics }
        : { status: "sent", diagnostics };
    }
    const errorBody = await response.text().catch(() => "");
    console.error("Customer LINE notification rejected", {
      status: response.status,
      messageTypes: diagnostics.messageTypes,
      body: errorBody.slice(0, 500),
    });
  } catch {
    console.error("Customer LINE notification request failed");
  }
  return {
    status: "failed",
    error: "LINE 通知發送失敗",
    diagnostics: {
      messageTypes: messages.map((message) => message.type) as Array<"text" | "image">,
      ...(messages.some((message) => message.type === "image") ? { imageMimeType: "image/jpeg" as const } : {}),
      ...(imageHost ? { imageHost } : {}),
      ...(lineHttpStatus !== undefined ? { lineHttpStatus } : {}),
    },
  };
}

export async function sendCustomerOrderEmail(input: {
  recipientEmail: string;
  orderNumber: string;
  template: CustomerNotificationTemplate;
  subject?: string;
  photo?: CustomerNotificationPhoto;
  fetcher?: typeof fetch;
}): Promise<CustomerNotificationResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MEMBER_EMAIL_FROM?.trim();
  if (!apiKey || !from) return { status: "not_configured", error: "Email 通知服務尚未設定" };
  const photoUrl = absolutePhotoUrl(input.photo);
  const safeText = escapeHtml(input.template.text).replaceAll("\n", "<br>");
  const safePhotoUrl = photoUrl ? escapeHtml(photoUrl) : undefined;
  try {
    const response = await (input.fetcher ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [input.recipientEmail],
        subject: input.subject || `KD Coffee 訂單進度｜${input.orderNumber}`,
        text: input.template.text,
        html: `<div style="font-family:Arial,'Noto Sans TC',sans-serif;line-height:1.75;color:#2b211b;max-width:600px;margin:auto;padding:24px"><h1 style="font-size:24px">KD Coffee</h1><p>${safeText}</p>${safePhotoUrl ? `<p><img src="${safePhotoUrl}" alt="訂單準備照片" style="max-width:100%;height:auto;border-radius:10px"></p>` : ""}</div>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return { status: "sent" };
    console.error("Customer order email rejected", { status: response.status });
  } catch {
    console.error("Customer order email request failed");
  }
  return { status: "failed", error: "Email 通知發送失敗" };
}
