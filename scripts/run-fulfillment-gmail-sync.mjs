const baseUrl = (
  process.env.FULFILLMENT_SYNC_BASE_URL ||
  process.env.MEMBER_SITE_URL ||
  process.env.KD_SITE_URL ||
  ""
).trim().replace(/\/+$/, "");

const secret = (process.env.FULFILLMENT_CRON_SECRET || "").trim();

if (!baseUrl) {
  console.error("STOP: FULFILLMENT_SYNC_BASE_URL / MEMBER_SITE_URL / KD_SITE_URL is not configured.");
  process.exit(1);
}

if (!/^https?:\/\//i.test(baseUrl)) {
  console.error("STOP: fulfillment sync base URL must start with http:// or https://");
  process.exit(1);
}

if (!secret) {
  console.error("STOP: FULFILLMENT_CRON_SECRET is not configured.");
  process.exit(1);
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 90_000);

try {
  const response = await fetch(`${baseUrl}/api/internal/fulfillment-gmail-sync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: "application/json",
      "User-Agent": "KD-Coffee-Railway-Cron/1.0",
    },
    signal: controller.signal,
  });

  const text = await response.text();
  let result;
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = { raw: text };
  }

  if (!response.ok) {
    console.error(`Gmail sync failed: HTTP ${response.status}`, result);
    process.exit(1);
  }

  console.log("KD Coffee 7-ELEVEN Gmail sync complete", {
    connected: result.connected,
    scanned: result.scanned ?? 0,
    processed: result.processed ?? 0,
    reviewed: result.reviewed ?? 0,
    reason: result.reason,
  });
} catch (error) {
  console.error(
    "Gmail sync request failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
} finally {
  clearTimeout(timeout);
}
