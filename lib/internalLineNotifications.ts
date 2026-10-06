import "server-only";

export type InternalLineNotificationResult = {
  sent: boolean;
  requestId?: string;
  reason?: string;
};

export async function sendInternalLineNotification(
  text: string,
  options: {
    attempts?: number;
    timeoutMs?: number;
    retryDelayMs?: number;
    fetcher?: typeof fetch;
    retryKey?: string;
  } = {},
): Promise<InternalLineNotificationResult> {
  // LEGACY compatibility only: remove these fallbacks after Railway migration.
  const token = process.env.LINE_INTERNAL_CHANNEL_ACCESS_TOKEN?.trim()
    || process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  const to = process.env.LINE_INTERNAL_RECIPIENT_ID?.trim()
    || process.env.LINE_ORDER_RECIPIENT_ID?.trim();
  if (!token || !to) {
    return { sent: false, reason: "LINE environment variables are not configured" };
  }

  const attempts = Math.max(1, options.attempts ?? 2);
  const timeoutMs = options.timeoutMs ?? 12_000;
  const retryDelayMs = options.retryDelayMs ?? 800;
  let lastError = "LINE notification failed";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await (options.fetcher ?? fetch)("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.retryKey ? { "X-Line-Retry-Key": options.retryKey } : {}) },
        body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok || (response.status === 409 && options.retryKey && response.headers.get("x-line-accepted-request-id"))) {
        return {
          sent: true,
          requestId: response.headers.get("x-line-request-id") || undefined,
        };
      }
      const responseText = await response.text();
      lastError = `LINE ${response.status}: ${responseText.replaceAll(token, "[REDACTED]").slice(0, 300)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message.replaceAll(token, "[REDACTED]") : "LINE notification failed";
    }

    if (attempt < attempts && retryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  return { sent: false, reason: lastError };
}
