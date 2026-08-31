import { getActiveMembershipRules } from "./membershipBusinessRules";
import { processSevenElevenEmail, readLogisticsSettings, updateGmailConnectionStatus } from "./fulfillment";

type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };
type GmailMessage = { id: string; internalDate?: string; payload?: { headers?: Array<{ name: string; value: string }>; body?: { data?: string }; parts?: GmailPart[] } };

function decodeBase64Url(value = "") {
  return Buffer.from(value.replaceAll("-", "+").replaceAll("_", "/"), "base64").toString("utf8");
}

function textParts(part?: GmailPart): string[] {
  if (!part) return [];
  const own = part.mimeType === "text/plain" && part.body?.data ? [decodeBase64Url(part.body.data)] : [];
  return [...own, ...(part.parts ?? []).flatMap(textParts)];
}

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

async function accessToken(fetcher: typeof fetch) {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) return null;
  const response = await fetcher("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("Gmail OAuth 更新失敗");
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error("Gmail OAuth 未回傳 access token");
  return data.access_token;
}

export function gmailFulfillmentConnectionReadiness() {
  const missing = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"].filter((key) => !process.env[key]?.trim());
  return { ready: missing.length === 0, missing };
}

export async function syncSevenElevenGmail(options: { fetcher?: typeof fetch; maxMessages?: number } = {}) {
  const fetcher = options.fetcher ?? fetch;
  const settings = await readLogisticsSettings();
  if (!settings.automaticTrackingEnabled) return { connected: false, processed: 0, reviewed: 0, reason: "尚未啟用自動追蹤" };
  const token = await accessToken(fetcher);
  if (!token) return { connected: false, processed: 0, reviewed: 0, reason: "Gmail OAuth 尚未設定" };
  const version = await getActiveMembershipRules();
  const query = `from:(no-reply@sp88.com) newer_than:${version.rules.fulfillment.gmailScanLookbackDays}d`;
  const label = process.env.GMAIL_FULFILLMENT_LABEL?.trim();
  const params = new URLSearchParams({ q: query, maxResults: String(Math.min(100, Math.max(1, options.maxMessages ?? 50))) });
  if (label) params.append("labelIds", label);
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const listing = await fetcher(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`, { headers, signal: AbortSignal.timeout(15_000) });
    if (!listing.ok) throw new Error("Gmail 郵件清單讀取失敗");
    const ids = ((await listing.json()) as { messages?: Array<{ id: string }> }).messages ?? [];
    let processed = 0;
    let reviewed = 0;
    for (const item of ids) {
      const response = await fetcher(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`, { headers, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) continue;
      const message = await response.json() as GmailMessage;
      const body = textParts({ mimeType: message.payload?.parts ? "multipart/mixed" : "text/plain", body: message.payload?.body, parts: message.payload?.parts }).join("\n");
      const result = await processSevenElevenEmail({ from: header(message, "From"), subject: header(message, "Subject"), text: body, messageId: header(message, "Message-ID") || message.id, receivedAt: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : undefined });
      if (result.mutated) processed += 1;
      if (result.review) reviewed += 1;
    }
    await updateGmailConnectionStatus({ status: "connected", recentProcessedCount: processed, reviewCount: reviewed, syncedAt: new Date().toISOString() });
    return { connected: true, scanned: ids.length, processed, reviewed };
  } catch (error) {
    await updateGmailConnectionStatus({ status: "error", recentProcessedCount: 0, reviewCount: 0 });
    throw error;
  }
}
