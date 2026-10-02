import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { format } from "node:util";
import sharp from "sharp";

const keys = [
  "LINE_INTERNAL_CHANNEL_ACCESS_TOKEN", "LINE_INTERNAL_RECIPIENT_ID",
  "LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_ACCESS_TOKEN", "LINE_ORDER_RECIPIENT_ID",
  "KD_DATA_DIR", "RAILWAY_VOLUME_MOUNT_PATH", "MEMBER_SITE_URL", "NEXT_PUBLIC_SITE_URL",
] as const;
const savedEnv = new Map(keys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
const originalConsole = { log: console.log, warn: console.warn, error: console.error };
const logs: string[] = [];
let unexpectedFetches = 0;
globalThis.fetch = async () => { unexpectedFetches += 1; throw new Error("Real network is disabled in this test"); };
console.log = console.warn = console.error = (...args: unknown[]) => { logs.push(format(...args)); };

const root = await mkdtemp(path.join(os.tmpdir(), "kd-line-messaging-split-"));
process.env.KD_DATA_DIR = root;
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
delete process.env.MEMBER_SITE_URL;
process.env.NEXT_PUBLIC_SITE_URL = "https://public.example.test";

const internalToken = "synthetic-internal-token-never-sent";
const customerToken = "synthetic-customer-token-never-sent";
const legacyToken = "synthetic-legacy-token-never-sent";
const internalRecipient = "synthetic-internal-group";
const legacyRecipient = "synthetic-legacy-group";
const customerRecipient = `U${"a".repeat(32)}`;
const template = { eventType: "order_shipped", subject: "Fixture", text: "Synthetic notification" };
type Capture = { url: string; method?: string; authorization: string | null; payload: { to: string; messages: Array<{ type: string; text?: string; originalContentUrl?: string; previewImageUrl?: string }> }; signal?: AbortSignal | null };
let checks = 0;
function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  checks += 1;
  originalConsole.log(`PASS ${String(checks).padStart(2, "0")} ${label}`);
}
function configure(values: Partial<Record<(typeof keys)[number], string>> = {}) {
  for (const key of keys.slice(0, 5)) delete process.env[key];
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
}
function mock(captures: Capture[], status = 200, body = "") : typeof fetch {
  return async (url, init) => {
    captures.push({ url: String(url), method: init?.method, authorization: new Headers(init?.headers).get("Authorization"), payload: JSON.parse(String(init?.body)), signal: init?.signal });
    return new Response(body || null, { status, headers: { "x-line-request-id": "synthetic-request-id" } });
  };
}

try {
  const { sendInternalLineNotification } = await import("../lib/internalLineNotifications");
  const { sendCustomerLineNotification } = await import("../lib/customerNotificationDelivery");
  const photos = await import("../lib/orderNotificationPhotos");
  const storage = await import("../lib/storagePaths");

  configure({ LINE_INTERNAL_CHANNEL_ACCESS_TOKEN: ` ${internalToken} `, LINE_INTERNAL_RECIPIENT_ID: ` ${internalRecipient} `, LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN: customerToken, LINE_CHANNEL_ACCESS_TOKEN: legacyToken, LINE_ORDER_RECIPIENT_ID: legacyRecipient });
  const internalCalls: Capture[] = [];
  const internal = await sendInternalLineNotification(template.text, { fetcher: mock(internalCalls) });
  check(internal.sent && internalCalls[0]?.authorization === `Bearer ${internalToken}`, "A internal token takes precedence and is trimmed");
  check(internalCalls[0]?.payload.to === internalRecipient, "B internal recipient takes precedence and is trimmed");
  check(internal.requestId === "synthetic-request-id", "internal request ID remains captured");
  check(internalCalls[0]?.payload.messages.length === 1 && internalCalls[0]?.payload.messages[0]?.text === template.text, "internal text payload is unchanged");

  const customerCalls: Capture[] = [];
  process.env.LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN = ` ${customerToken} `;
  const customer = await sendCustomerLineNotification({ userId: customerRecipient, template, fetcher: mock(customerCalls) });
  check(customer.status === "sent" && customerCalls[0]?.authorization === `Bearer ${customerToken}`, "D customer token takes precedence and is trimmed");
  check(customerCalls[0]?.payload.to === customerRecipient, "customer recipient remains input.userId");

  configure({ LINE_CHANNEL_ACCESS_TOKEN: legacyToken, LINE_ORDER_RECIPIENT_ID: legacyRecipient });
  const legacyInternalCalls: Capture[] = [];
  const legacyInternal = await sendInternalLineNotification(template.text, { fetcher: mock(legacyInternalCalls) });
  check(legacyInternal.sent && legacyInternalCalls[0]?.authorization === `Bearer ${legacyToken}` && legacyInternalCalls[0]?.payload.to === legacyRecipient, "C internal token and recipient fall back to legacy");
  const legacyCustomerCalls: Capture[] = [];
  const legacyCustomer = await sendCustomerLineNotification({ userId: customerRecipient, template, fetcher: mock(legacyCustomerCalls) });
  check(legacyCustomer.status === "sent" && legacyCustomerCalls[0]?.authorization === `Bearer ${legacyToken}`, "E customer falls back to legacy token");

  configure({ LINE_INTERNAL_CHANNEL_ACCESS_TOKEN: internalToken, LINE_ORDER_RECIPIENT_ID: legacyRecipient });
  const mixedRecipient: Capture[] = [];
  await sendInternalLineNotification(template.text, { fetcher: mock(mixedRecipient) });
  check(mixedRecipient[0]?.authorization === `Bearer ${internalToken}` && mixedRecipient[0]?.payload.to === legacyRecipient, "internal recipient fallback is independent of token selection");
  configure({ LINE_CHANNEL_ACCESS_TOKEN: legacyToken, LINE_INTERNAL_RECIPIENT_ID: internalRecipient });
  const mixedToken: Capture[] = [];
  await sendInternalLineNotification(template.text, { fetcher: mock(mixedToken) });
  check(mixedToken[0]?.authorization === `Bearer ${legacyToken}` && mixedToken[0]?.payload.to === internalRecipient, "internal token fallback is independent of recipient selection");

  configure({ LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN: customerToken, LINE_INTERNAL_RECIPIENT_ID: internalRecipient });
  const crossInternal: Capture[] = [];
  const noInternalToken = await sendInternalLineNotification(template.text, { fetcher: mock(crossInternal) });
  check(!noInternalToken.sent && crossInternal.length === 0, "F internal never borrows customer token");
  configure({ LINE_INTERNAL_CHANNEL_ACCESS_TOKEN: internalToken, LINE_INTERNAL_RECIPIENT_ID: internalRecipient });
  const crossCustomer: Capture[] = [];
  const noCustomerToken = await sendCustomerLineNotification({ userId: customerRecipient, template, fetcher: mock(crossCustomer) });
  check(noCustomerToken.status === "not_configured" && crossCustomer.length === 0, "G customer never borrows internal token");

  configure();
  const missingCalls: Capture[] = [];
  check(!(await sendInternalLineNotification(template.text, { fetcher: mock(missingCalls) })).sent, "K missing internal config returns sent:false");
  check((await sendCustomerLineNotification({ userId: customerRecipient, template, fetcher: mock(missingCalls) })).status === "not_configured" && missingCalls.length === 0, "K missing customer config preserves not_configured result without sending");
  configure({ LINE_INTERNAL_CHANNEL_ACCESS_TOKEN: internalToken });
  check(!(await sendInternalLineNotification(template.text, { fetcher: mock(missingCalls) })).sent && missingCalls.length === 0, "missing internal recipient also prevents sending");

  configure({ LINE_INTERNAL_CHANNEL_ACCESS_TOKEN: "  ", LINE_INTERNAL_RECIPIENT_ID: " ", LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN: " ", LINE_CHANNEL_ACCESS_TOKEN: legacyToken, LINE_ORDER_RECIPIENT_ID: legacyRecipient });
  const blankInternal: Capture[] = []; const blankCustomer: Capture[] = [];
  await sendInternalLineNotification(template.text, { fetcher: mock(blankInternal) });
  await sendCustomerLineNotification({ userId: customerRecipient, template, fetcher: mock(blankCustomer) });
  check(blankInternal[0]?.authorization === `Bearer ${legacyToken}` && blankInternal[0]?.payload.to === legacyRecipient && blankCustomer[0]?.authorization === `Bearer ${legacyToken}`, "blank canonical variables use legacy compatibility");

  configure({ LINE_INTERNAL_CHANNEL_ACCESS_TOKEN: internalToken, LINE_INTERNAL_RECIPIENT_ID: internalRecipient, LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN: customerToken });
  const retryCalls: Capture[] = [];
  const internalFailure = await sendInternalLineNotification(template.text, { fetcher: mock(retryCalls, 500, `synthetic rejection ${internalToken}`), retryDelayMs: 0 });
  check(!internalFailure.sent && retryCalls.length === 2 && internalFailure.reason?.startsWith("LINE 500:"), "internal default retry count and failure schema are preserved");
  check(!internalFailure.reason?.includes(internalToken) && internalFailure.reason?.includes("[REDACTED]"), "H reflected token is redacted from internal errors that callers may log");
  const thrownFailure = await sendInternalLineNotification(template.text, { attempts: 1, fetcher: async () => { throw new Error(`synthetic failure ${internalToken}`); } });
  check(!thrownFailure.sent && !thrownFailure.reason?.includes(internalToken), "H internal exception text cannot expose active token");

  const rejectedCalls: Capture[] = [];
  const rejected = await sendCustomerLineNotification({ userId: customerRecipient, template, fetcher: mock(rejectedCalls, 400, `synthetic rejection ${customerToken}`) });
  check(rejected.status === "failed" && rejected.diagnostics?.lineHttpStatus === 400, "customer failure result and diagnostics remain unchanged");

  const imageBytes = await sharp({ create: { width: 96, height: 64, channels: 3, background: "#765432" } }).png().toBuffer();
  const bytes = new Uint8Array(imageBytes);
  const photo = await photos.validateAndStoreOrderNotificationPhoto(new File([bytes.buffer], "fixture.png", { type: "image/png" }), randomUUID());
  const publicFetcher: typeof fetch = async (url) => {
    const filename = path.basename(new URL(String(url)).pathname);
    return new Response(await readFile(path.join(storage.getOrderNotificationUploadsDir(), filename)), { headers: { "Content-Type": "image/jpeg" } });
  };
  const imageCalls: Capture[] = [];
  const imageResult = await sendCustomerLineNotification({ userId: customerRecipient, template, photo, fetcher: mock(imageCalls), publicImageFetcher: publicFetcher });
  const image = imageCalls[0]?.payload.messages[1];
  check(imageResult.status === "sent" && imageCalls[0]?.payload.messages.map((entry) => entry.type).join(",") === "text,image" && imageCalls[0]?.authorization === `Bearer ${customerToken}`, "J customer image still sends text + image with customer token");
  check(image?.originalContentUrl?.startsWith("https://public.example.test/") && image.previewImageUrl?.endsWith("-line-preview.jpg"), "customer original and preview JPEG URLs are preserved");
  const partialCalls: Capture[] = [];
  const partial = await sendCustomerLineNotification({ userId: customerRecipient, template, photo, fetcher: mock(partialCalls), publicImageFetcher: async () => new Response("invalid image", { headers: { "Content-Type": "text/html" } }) });
  check(partial.status === "partial" && partialCalls[0]?.payload.messages.length === 1, "image failure preserves partial text success");

  const allCalls = [internalCalls, customerCalls, legacyInternalCalls, legacyCustomerCalls, mixedRecipient, mixedToken, blankInternal, blankCustomer, retryCalls, rejectedCalls, imageCalls, partialCalls].flat();
  check(allCalls.every((call) => call.url === "https://api.line.me/v2/bot/message/push" && call.method === "POST"), "I all mocked sends retain the LINE push endpoint and POST method");
  check(allCalls.every((call) => call.signal instanceof AbortSignal), "internal and customer requests retain timeout signals");
  check([internalToken, customerToken, legacyToken].every((token) => logs.every((entry) => !entry.includes(token))), "H no synthetic secret value appears in captured logs");
  check(logs.some((entry) => entry.includes("[REDACTED]")), "H customer response reflection is redacted before logging");
  check(unexpectedFetches === 0, "all external requests used injected mocks; real network was never attempted");
  originalConsole.log(`LINE messaging split regression PASS — ${checks} checks; no real sends`);
} finally {
  globalThis.fetch = originalFetch;
  Object.assign(console, originalConsole);
  for (const [key, value] of savedEnv) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith("kd-line-messaging-split-"));
  await rm(root, { recursive: true, force: true });
}
