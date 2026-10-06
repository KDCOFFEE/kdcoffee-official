import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { trackLogisticsEmail } from "../lib/logisticsTracking";
import { parseSevenElevenEmail } from "../lib/sevenElevenEmailParser";
import type { LogisticsSettings, FulfillmentStore } from "../lib/fulfillmentTypes";
import { sendInternalLineNotification } from "../lib/internalLineNotifications";

const root = await mkdtemp(path.join(os.tmpdir(), "kd-external-logistics-"));
const filePath = path.join(root, "state.json");
const now = new Date("2026-10-06T02:00:00Z");
const settings: LogisticsSettings = { schemaVersion: 1, revision: 0, notificationEmail: "test@example.test", automaticTrackingEnabled: true, pickupDeadlineDays: 7, expiryPolicy: "manual_review", trackedEvents: { orderCreated: true, shipped: true, arrived: true, completed: true }, internalLineEvents: { orderCreated: true, shipped: false, arrived: true, completed: true }, gmailConnection: { status: "connected", lastSyncedAt: null, recentProcessedCount: 0, reviewCount: 0 }, updatedAt: now.toISOString() };
const cm = "CM2610056833338";
function evidence(kind: "created" | "shipped" | "arrived" | "completed", id: string, order = cm) {
  const subjects = { created: "賣貨便：訂單成立通知", shipped: "賣貨便：賣家完成寄貨訂單通知", arrived: `賣貨便：您的訂單(${order})已送達`, completed: "賣貨便：買家完成取貨訂單通知" };
  return parseSevenElevenEmail({ from: "7-ELEVEN <no-reply@sp88.com>", subject: subjects[kind], text: `訂單 ${order} 寄貨交寄 送達門市 買家完成取貨`, messageId: id, receivedAt: now.toISOString() });
}
let sends = 0;
const sender: typeof sendInternalLineNotification = async (_text, options) => { assert.ok(options?.retryKey); sends++; return { sent: true }; };
const options = { filePath, settings, now, sender };
try {
  await Promise.all(Array.from({length: 8}, (_,i)=>trackLogisticsEmail(evidence("created", `buyer-seller-${i}`), options)));
  assert.equal(sends, 1, "different buyer/seller mails and concurrent scans send once");
  await trackLogisticsEmail(evidence("shipped", "shipment"), options);
  assert.equal(sends, 1, "disabled state is tracked without notifying");
  await trackLogisticsEmail(evidence("arrived", "arrival"), options);
  await trackLogisticsEmail(evidence("completed", "pickup"), options);
  await trackLogisticsEmail(evidence("arrived", "late-arrival"), options);
  assert.equal(sends, 3);
  const store = JSON.parse(await readFile(filePath, "utf8")) as FulfillmentStore;
  assert.equal(store.logisticsTracking?.[cm].currentState, "completed");
  assert.equal(store.logisticsTracking?.[cm].events.length, 4);
  assert.deepEqual(store.records, {}, "external tracking never creates commerce records");
  assert.deepEqual(store.consequenceStatus, {});
  let fail = true;
  const retryKeys: string[] = [];
  const failingSender: typeof sender = async (_text, opts) => { retryKeys.push(opts!.retryKey!); return { sent: !fail, reason: "temporary failure" }; };
  const failed = evidence("created", "retry", "CMRETRY00001");
  await trackLogisticsEmail(failed, {...options, sender: failingSender});
  fail = false;
  await trackLogisticsEmail(failed, {...options, sender: failingSender});
  await trackLogisticsEmail(failed, {...options, sender: failingSender});
  assert.equal(retryKeys.length, 2);
  assert.equal(retryKeys[0], retryKeys[1], "failed retries keep the persisted LINE deduplication key");
  const wrong = {...evidence("created", "wrong"), recognized: false};
  assert.equal((await trackLogisticsEmail(wrong, options)).changed, false);
  process.env.LINE_INTERNAL_CHANNEL_ACCESS_TOKEN = "test-token";
  process.env.LINE_INTERNAL_RECIPIENT_ID = "internal-group";
  const accepted = await sendInternalLineNotification("test", { retryKey: retryKeys[0], fetcher: async (_url, init) => {
    assert.equal((init?.headers as Record<string,string>)["X-Line-Retry-Key"], retryKeys[0]);
    assert.equal(JSON.parse(String(init?.body)).to, "internal-group");
    return new Response("", {status: 409, headers: {"x-line-accepted-request-id": "already-accepted"}});
  }});
  assert.equal(accepted.sent, true);
  // Previously unknown-order reviews can be recovered without clearing unrelated history.
  for (const key of ["LINE_INTERNAL_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_ACCESS_TOKEN", "LINE_INTERNAL_RECIPIENT_ID", "LINE_ORDER_RECIPIENT_ID"]) delete process.env[key];
  const legacyPath = path.join(root, "legacy-state.json");
  const settingsPath = path.join(root, "settings.json");
  const legacyMail = { from: "no-reply@sp88.com", subject: "賣貨便：訂單成立通知", text: `訂單 ${cm} 已成立`, messageId: "legacy-review", receivedAt: now.toISOString() };
  const parsedLegacy = parseSevenElevenEmail(legacyMail);
  await writeFile(settingsPath, JSON.stringify(settings));
  await writeFile(legacyPath, JSON.stringify({schemaVersion:1,revision:0,records:{},reviews:[{reviewId:"old-review",reason:"unknown_order",externalOrderId:cm,sourceFingerprint:parsedLegacy.sourceFingerprint,message:"not mapped",status:"open",createdAt:now.toISOString()}],processedFingerprints:{[parsedLegacy.sourceFingerprint]:{reviewId:"old-review"}},consequenceStatus:{},createdAt:now.toISOString(),updatedAt:now.toISOString()}));
  const { processSevenElevenEmail } = await import("../lib/fulfillment");
  const recovered = await processSevenElevenEmail(legacyMail, {filePath:legacyPath,settingsFilePath:settingsPath,now});
  assert.equal(recovered.review, false);
  assert.equal(recovered.mutated, true);
  const recoveredStore = JSON.parse(await readFile(legacyPath, "utf8")) as FulfillmentStore;
  assert.equal(recoveredStore.reviews[0].status, "resolved");
  assert.deepEqual(recoveredStore.records, {});
  console.log("PASS external tracking, concurrent/state deduplication, disabled events, no commerce effects, failed retry, internal recipient, LINE accepted retry");
} finally { await rm(root, {recursive: true, force: true}); }
