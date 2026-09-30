#!/usr/bin/env node

const baseUrl = (
  process.env.REWARD_RELEASE_BASE_URL
  || "https://www.kdcoffee1962.com"
).replace(/\/+$/, "");

const secret = process.env.REWARD_RELEASE_CRON_SECRET?.trim();

if (!secret) {
  console.error("[reward-release-cron] Missing REWARD_RELEASE_CRON_SECRET");
  process.exit(1);
}

const url = `${baseUrl}/api/internal/reward-release`;

console.log(`[reward-release-cron] POST ${url}`);

try {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
  });
  const result = await response.json().catch(() => null);

  console.log(`[reward-release-cron] HTTP ${response.status}`);
  if (result?.release) {
    console.log(
      `[reward-release-cron] release processed=${result.release.processed} released=${result.release.released} expired=${result.release.expired} capBlocked=${result.release.capBlocked} failed=${result.release.failed}`,
    );
  }
  if (result?.notifications) {
    console.log(
      `[reward-release-cron] notifications processed=${result.notifications.processed} delivered=${result.notifications.delivered} pending=${result.notifications.pending} failed=${result.notifications.failed}`,
    );
  }
  if (result?.notificationWarning) {
    console.warn(
      `[reward-release-cron] warning=${result.notificationWarning.code || "notification_delivery_incomplete"} pending=${result.notificationWarning.pending ?? 0} failed=${result.notificationWarning.failed ?? 0}`,
    );
  }
  if (!response.ok || result?.ok === false) {
    console.error(`[reward-release-cron] ${result?.error || "Reward release request failed"}`);
    process.exit(1);
  }

  process.exit(0);
} catch (error) {
  console.error(
    "[reward-release-cron] Request failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exit(1);
}
