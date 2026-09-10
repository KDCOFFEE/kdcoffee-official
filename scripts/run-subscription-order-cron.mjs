const baseUrl = (
  process.env.SUBSCRIPTION_SCHEDULER_BASE_URL ||
  "https://www.kdcoffee1962.com"
).replace(/\/+$/, "");

const secret = process.env.SUBSCRIPTION_SCHEDULER_SECRET?.trim();

if (!secret) {
  console.error("Missing SUBSCRIPTION_SCHEDULER_SECRET");
  process.exit(1);
}

const url = `${baseUrl}/api/internal/subscription-orders`;

console.log(`[subscription-order-cron] POST ${url}`);

try {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
  });

  const text = await response.text();

  console.log(`[subscription-order-cron] HTTP ${response.status}`);
  console.log(text);

  if (!response.ok) {
    process.exit(1);
  }

  process.exit(0);
} catch (error) {
  console.error(
    "[subscription-order-cron] Request failed:",
    error instanceof Error ? error.message : error
  );
  process.exit(1);
}