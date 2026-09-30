import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-reward-notification-isolation-"));
process.env.KD_DATA_DIR = root;
process.env.REWARD_RELEASE_CRON_SECRET = "focused-reward-release-secret";
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
delete process.env.RAILWAY_PROJECT_ID;
delete process.env.RAILWAY_ENVIRONMENT_ID;
delete process.env.RAILWAY_SERVICE_ID;
delete process.env.RAILWAY_VOLUME_NAME;

const storage = await import("../lib/storagePaths");
const rulesApi = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");
const automation = await import("../lib/memberNotificationAutomation");
const route = await import("../app/api/internal/reward-release/route");

let checks = 0;
function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  checks += 1;
  console.log(`PASS ${String(checks).padStart(2, "0")} ${label}`);
}

async function writeState(state: Awaited<ReturnType<typeof commerce.readMembershipCommerceState>>) {
  const filePath = storage.getMembershipCommerceStateFile();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function notice(input: {
  id: string;
  channels: Array<"member_center" | "line" | "email" | "admin">;
  attempts: number;
  maxAttempts: number;
}) {
  return {
    notificationId: input.id,
    eventType: "credit_issued" as const,
    channels: input.channels,
    status: "pending" as const,
    deliveryPolicy: { maxAttempts: input.maxAttempts, emailFallback: false },
    attempts: input.attempts,
    deliveredChannels: [] as Array<"member_center" | "line" | "email" | "admin">,
    sourceEvent: `test:${input.id}`,
    createdAt: "2026-09-30T00:00:00.000Z",
    safeData: { amount: 18, referralPayout: true },
  };
}

try {
  const rulesFilePath = storage.getMembershipRulesFile();
  await rulesApi.saveMembershipBusinessRules(
    {
      expectedRevision: 0,
      rules: structuredClone(rulesApi.DEFAULT_MEMBERSHIP_RULES),
      now: new Date("2026-09-30T00:00:00.000Z"),
    },
    rulesFilePath,
  );

  console.log("\n=== CASE A: EXHAUSTED PENDING NOTICE DOES NOT STARVE THE QUEUE ===");

  let state = await commerce.readMembershipCommerceState(storage.getMembershipCommerceStateFile());
  state.notifications = [
    notice({ id: "notice-exhausted-first", channels: ["line"], attempts: 1, maxAttempts: 1 }),
    notice({ id: "notice-deliverable-second", channels: ["member_center"], attempts: 0, maxAttempts: 1 }),
  ];
  await writeState(state);

  const deliveries = await automation.deliverPendingMembershipNotifications({
    limit: 10,
    stateFilePath: storage.getMembershipCommerceStateFile(),
    now: new Date("2026-09-30T00:05:00.000Z"),
  });

  state = await commerce.readMembershipCommerceState(storage.getMembershipCommerceStateFile());
  const exhausted = state.notifications.find((item) => item.notificationId === "notice-exhausted-first");
  const deliverable = state.notifications.find((item) => item.notificationId === "notice-deliverable-second");

  check(exhausted?.status === "failed", "01 exhausted pending notice is finalized as failed");
  check(deliverable?.status === "delivered", "02 later valid pending notice is still delivered");
  check(
    deliveries.length === 1 && deliveries[0]?.notificationId === "notice-deliverable-second",
    "03 queue processing continues past the exhausted first notice",
  );

  console.log("\n=== CASE B: NOTIFICATION FAILURE DOES NOT TURN ACCOUNTING SUCCESS INTO HTTP 500 ===");

  state.notifications = [
    notice({ id: "notice-route-failure", channels: ["line"], attempts: 0, maxAttempts: 1 }),
  ];
  state.referralRewards = {};
  state.creditEntries = {};
  state.events = [];
  await writeState(state);

  const response = await route.POST(new Request("http://localhost/api/internal/reward-release", {
    method: "POST",
    headers: { authorization: "Bearer focused-reward-release-secret" },
  }));
  const body = await response.json();

  check(response.status === 200 && body.ok === true, "04 notification-only failure returns HTTP 200 with accounting ok");
  check(body.notificationOk === false, "05 response explicitly reports notification delivery warning state");
  check(
    body.notifications?.failed === 1 && body.notificationWarning?.code === "notification_delivery_incomplete",
    "06 failed notification remains visible in response summary and warning",
  );

  state = await commerce.readMembershipCommerceState(storage.getMembershipCommerceStateFile());
  check(
    state.notifications[0]?.status === "failed",
    "07 failed delivery remains durably visible in notification state",
  );
  check(
    Object.keys(state.creditEntries).length === 0 && Object.keys(state.referralRewards).length === 0,
    "08 notification processing creates no reward or credit side effect",
  );

  console.log("\n=== CASE C: FATAL REWARD JOB FAILURE STILL RETURNS HTTP 500 ===");

  await fs.writeFile(storage.getMembershipCommerceStateFile(), "{invalid-json", "utf8");
  const fatalResponse = await route.POST(new Request("http://localhost/api/internal/reward-release", {
    method: "POST",
    headers: { authorization: "Bearer focused-reward-release-secret" },
  }));
  const fatalBody = await fatalResponse.json();

  check(fatalResponse.status === 500 && fatalBody.ok === false, "09 fatal reward job failure remains HTTP 500");

  console.log("\n=== CASE D: RUNNER KEEPS WARNING VISIBLE WITHOUT FAILING A 200/OK RESPONSE ===");

  const routeSource = await fs.readFile(
    path.join(process.cwd(), "app/api/internal/reward-release/route.ts"),
    "utf8",
  );
  const cronSource = await fs.readFile(
    path.join(process.cwd(), "scripts/run-reward-release-cron.mjs"),
    "utf8",
  );

  check(
    routeSource.includes("accountingOk") && routeSource.includes("notificationWarning"),
    "10 route separates accounting success from notification delivery status",
  );
  check(
    routeSource.includes("{ status: accountingOk ? 200 : 500 }"),
    "11 route reserves HTTP 500 for accounting/fatal reward failure",
  );
  check(
    cronSource.includes("result?.notificationWarning") && cronSource.includes("console.warn"),
    "12 cron logs notification warning visibly",
  );
  check(
    cronSource.includes("if (!response.ok || result?.ok === false)"),
    "13 cron still exits nonzero for HTTP or accounting failure",
  );

  console.log(`\nREWARD RELEASE NOTIFICATION ISOLATION PASS — ${checks}/13 checks passed`);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
