import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LineAutoReplySettings, LineQuickReplyType } from "../lib/lineAutoReplyTypes";
import { lineQuickReplyTypes } from "../lib/lineAutoReplyTypes";
import { defaultLineSettings, migrateLineAutoReplyV1, readLineSettings, saveLineSettings, validateLineSettings } from "../lib/lineAutoReplyStore";
import { normalizeLineText, resolveLineDestination, resolveLineReply, splitLineReply } from "../lib/lineAutoReplyEngine";
import { claimLineEvent, handleCustomerLineWebhook, replyCustomerLine, verifyCustomerLineSignature } from "../lib/lineAutoReplyWebhook";
import { handleLineReplyAdmin } from "../lib/lineAutoReplyAdmin";
import { getLineAutoReplyDir } from "../lib/storagePaths";

const temp = await mkdtemp(path.join(os.tmpdir(), "kd-line-auto-2-"));
const savedEnvironment = { ...process.env };
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
delete process.env.LINE_AUTO_REPLY_DATA_DIR;
process.env.KD_DATA_DIR = temp;
process.env.LINE_CUSTOMER_CHANNEL_SECRET = "synthetic-webhook-secret";
process.env.LINE_LOGIN_CHANNEL_SECRET = "synthetic-unrelated-login-secret";
process.env.LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN = "synthetic-customer-token";
process.env.LINE_INTERNAL_CHANNEL_ACCESS_TOKEN = "synthetic-internal-token";
process.env.LINE_CHANNEL_ACCESS_TOKEN = "synthetic-legacy-token";
process.env.MEMBER_SITE_URL = "https://canonical.example.test";

let realNetworkAttempts = 0;
globalThis.fetch = async () => {
  realNetworkAttempts++;
  throw new Error("Network forbidden in LINE.AUTO.2 tests");
};

const counts = { center: 0, security: 0, migration: 0 };
async function test(group: keyof typeof counts, name: string, run: () => unknown | Promise<unknown>) {
  await run();
  counts[group]++;
  console.log(`PASS ${group} ${counts[group]}: ${name}`);
}

const clone = <T,>(value: T): T => structuredClone(value);
function config() {
  const settings = defaultLineSettings();
  settings.enabled = true;
  return settings;
}

function item(settings: LineAutoReplySettings, id: LineQuickReplyType) {
  return settings.quickReplies.find((entry) => entry.id === id)!;
}

function enableQuick(settings: LineAutoReplySettings, id: LineQuickReplyType, overrides: Partial<ReturnType<typeof item>> = {}) {
  Object.assign(item(settings, id), {
    enabled: true,
    keywords: [`fixture-${id}`],
    replyText: `Fixture ${id} reply`,
    ...overrides,
  });
  return settings;
}

const resolve = (message: string, settings = config()) => resolveLineReply(message, settings, process.env.MEMBER_SITE_URL);
const settingsFile = () => path.join(getLineAutoReplyDir(), "settings.json");
const signature = (raw: string, secret = process.env.LINE_CUSTOMER_CHANNEL_SECRET!) => createHmac("sha256", secret).update(raw).digest("base64");
const event = (id = "fixture-event", text = "fixture-orderHelp") => ({ type: "message", webhookEventId: id, replyToken: "synthetic-reply-token", source: { userId: "synthetic-private-user" }, message: { type: "text", id: `fixture-message-${id}`, text } });
function webhookRequest(body: unknown, suppliedSignature?: string) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("https://canonical.example.test/api/webhooks/line/customer", { method: "POST", body: raw, headers: { "x-line-signature": suppliedSignature ?? signature(raw) } });
}
function adminRequest(body: unknown, url = "/api/admin/line-auto-reply") {
  return new Request(`https://canonical.example.test${url}`, { method: "PUT", headers: { "Content-Type": "application/json", Origin: "https://canonical.example.test" }, body: JSON.stringify(body) });
}

type Capture = { url: string; headers: Headers; body: { replyToken: string; messages: Array<{ type: string; text: string }> } };
const calls: Capture[] = [];
const mockFetch: typeof fetch = async (url, init) => {
  calls.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
  return new Response(null, { status: 200 });
};

function legacySettings() {
  const updatedAt = "2026-09-30T00:00:00.000Z";
  return {
    schemaVersion: 1,
    revision: 7,
    enabled: true,
    updatedAt,
    fallback: { enabled: true, text: "Fixture legacy fallback" },
    beanMenu: {
      enabled: true,
      matchMode: "contains",
      keywords: ["Fixture legacy menu"],
      title: "Fixture legacy title",
      intro: "Fixture legacy intro",
      helpText: "Fixture legacy help",
      emptyStateReply: "Fixture legacy empty",
      footer: "Fixture legacy footer",
      ctaLabel: "Fixture legacy CTA",
      ctaUrl: "https://old.example.test/duplicated-menu",
      displayFields: { price: true, roast: true, origin: true, process: true, flavors: true, variety: true, altitude: true, status: true, productUrl: true },
      labels: { price: "Price", roast: "Roast", origin: "Origin", process: "Process", flavors: "Flavors", variety: "Variety", altitude: "Altitude", status: "Status", productUrl: "URL" },
      availableText: "Fixture available",
      products: [{ productId: "fixture-product", enabled: true, order: 0, lineDescriptionOverride: "Fixture duplicated description" }],
      updatedAt,
    },
    rules: [{ id: "legacy-rule", enabled: true, name: "Fixture legacy rule", order: 0, matchMode: "exact", keywords: ["Fixture legacy question"], replyText: "Fixture legacy answer", createdAt: updatedAt, updatedAt }],
  };
}

try {
  await mkdir(getLineAutoReplyDir(), { recursive: true });

  await test("center", "beanMenu resolves to the existing monthly menu page", () => {
    const settings = enableQuick(config(), "beanMenu", { keywords: ["豆單"], replyText: "Fixture bean intro", buttonLabel: "Fixture open menu" });
    const result = resolve("豆單", settings);
    assert.equal(result.category, "quickReply");
    assert.equal(result.itemId, "beanMenu");
    assert.equal(result.resolvedDestination, "https://canonical.example.test/monthly-menu");
    assert.equal(result.text, "Fixture bean intro\n\nFixture open menu\nhttps://canonical.example.test/monthly-menu");
  });
  await test("center", "enabled beanMenu without a display label still outputs the canonical URL", () => {
    const settings = enableQuick(config(), "beanMenu", { keywords: ["無標籤豆單"], replyText: "Fixture bean intro", buttonLabel: "" });
    const result = resolve("無標籤豆單", validateLineSettings(settings));
    assert.equal(result.buttonLabel, "");
    assert.equal(result.resolvedDestination, "https://canonical.example.test/monthly-menu");
    assert.equal(result.text, "Fixture bean intro\n\nhttps://canonical.example.test/monthly-menu");
  });
  await test("center", "enabled beanMenu with a display label outputs label then URL", () => {
    const settings = enableQuick(config(), "beanMenu", { replyText: "Fixture labeled bean", buttonLabel: "查看本月豆單" });
    assert.equal(resolve("fixture-beanMenu", validateLineSettings(settings)).text, "Fixture labeled bean\n\n查看本月豆單\nhttps://canonical.example.test/monthly-menu");
  });
  await test("center", "enabled beanMenu with a blank destination is rejected", () => {
    const settings = enableQuick(config(), "beanMenu", { destination: "", buttonLabel: "" });
    assert.throws(() => validateLineSettings(settings), /啟用豆單時連結目的地不可空白/);
  });
  await test("center", "display labels without destinations are rejected for quick and custom items", () => {
    const quick = enableQuick(config(), "orderHelp", { buttonLabel: "Fixture label", destination: "" });
    assert.throws(() => validateLineSettings(quick), /有連結顯示文字時，連結目的地不可空白/);

    const custom = config();
    custom.customRules = [{ id: "fixture-label-only", enabled: false, name: "Fixture", order: 0, matchMode: "exact", keywords: [], replyText: "", buttonLabel: "Fixture label", destination: "", createdAt: custom.updatedAt, updatedAt: custom.updatedAt }];
    assert.throws(() => validateLineSettings(custom), /有連結顯示文字時，連結目的地不可空白/);
  });
  await test("center", "normal quick replies remain valid as text-only responses", () => {
    const settings = enableQuick(config(), "orderHelp", { replyText: "Fixture text only", buttonLabel: "", destination: "" });
    const result = resolve("fixture-orderHelp", validateLineSettings(settings));
    assert.equal(result.text, "Fixture text only");
    assert.equal(result.resolvedDestination, "");
  });
  await test("center", "custom rules remain valid as text-only responses", () => {
    const settings = config();
    settings.customRules = [{ id: "fixture-text-only", enabled: true, name: "Fixture", order: 0, matchMode: "exact", keywords: ["text only"], replyText: "Fixture custom text only", buttonLabel: "", destination: "", createdAt: settings.updatedAt, updatedAt: settings.updatedAt }];
    const result = resolve("text only", validateLineSettings(settings));
    assert.equal(result.text, "Fixture custom text only");
    assert.equal(result.resolvedDestination, "");
  });
  await test("center", "bean response does not read or copy a product list", async () => {
    const sources = await Promise.all(["lib/lineAutoReplyEngine.ts", "lib/lineAutoReplyStore.ts", "lib/lineAutoReplyWebhook.ts", "lib/lineAutoReplyAdmin.ts"].map((file) => readFile(file, "utf8")));
    assert.doesNotMatch(sources.join("\n"), /CoffeeArtwork|readLineProducts|resolveLineBeans|formatLineBeanMenu|getWebsiteDataFile/);
  });
  await test("center", "no LINE-specific product database or selection schema remains", () => {
    const serialized = JSON.stringify(defaultLineSettings());
    assert.doesNotMatch(serialized, /products|displayFields|lineDescriptionOverride|availableText|show price|stock|roast|origin|process|flavors|variety|altitude/i);
  });
  await test("center", "bean link works without Product Admin or website product data", async () => {
    assert.equal(await readFile(path.join(temp, "store", "website-data.json")).then(() => true, () => false), false);
    const settings = enableQuick(config(), "beanMenu", { replyText: "Fixture independent bean reply", buttonLabel: "Fixture menu" });
    assert.match(resolve("fixture-beanMenu", settings).text, /\/monthly-menu/);
  });
  await test("center", "bean reply text is Admin-editable", () => {
    const settings = enableQuick(config(), "beanMenu", { replyText: "Fixture edited bean copy" });
    assert.match(resolve("fixture-beanMenu", settings).text, /Fixture edited bean copy/);
  });
  await test("center", "bean keywords are Admin-editable", () => {
    const settings = enableQuick(config(), "beanMenu", { keywords: ["arbitrary fixture"] });
    assert.equal(resolve("fixture-beanMenu", settings).category, "noReply");
    assert.equal(resolve("arbitrary fixture", settings).itemId, "beanMenu");
  });
  await test("center", "bean CTA label is Admin-editable", () => {
    const settings = enableQuick(config(), "beanMenu", { buttonLabel: "Fixture custom CTA" });
    assert.equal(resolve("fixture-beanMenu", settings).buttonLabel, "Fixture custom CTA");
  });
  await test("center", "canonical internal destinations resolve safely", () => {
    assert.equal(resolveLineDestination("/monthly-menu", "https://canonical.example.test"), "https://canonical.example.test/monthly-menu");
    assert.equal(resolveLineDestination("/monthly-menu?from=line#menu", "https://canonical.example.test"), "https://canonical.example.test/monthly-menu?from=line#menu");
  });
  await test("center", "unsafe CTA protocols and protocol-relative destinations are rejected", () => {
    for (const unsafe of ["javascript:alert(1)", "http://unsafe.example.test", "//unsafe.example.test/path", "/\\unsafe", "https://user:pass@example.test/path"]) {
      const settings = enableQuick(config(), "beanMenu", { destination: unsafe });
      assert.throws(() => validateLineSettings(settings));
    }
  });

  for (const quickType of lineQuickReplyTypes.filter((entry) => entry !== "beanMenu")) {
    await test("center", `${quickType} is independently configurable`, () => {
      const settings = enableQuick(config(), quickType, { keywords: [`custom-${quickType}`], replyText: `Edited ${quickType} answer`, matchMode: "contains" });
      const result = resolve(`prefix custom-${quickType} suffix`, settings);
      assert.equal(result.itemId, quickType);
      assert.equal(result.replyText, `Edited ${quickType} answer`);
    });
  }

  await test("center", "custom rules support editable text and optional CTA", () => {
    const settings = config();
    settings.customRules = [{ id: "fixture-custom", enabled: true, name: "Fixture custom", order: 0, matchMode: "exact", keywords: ["custom question"], replyText: "Custom answer", buttonLabel: "Custom CTA", destination: "/pages/help", createdAt: settings.updatedAt, updatedAt: settings.updatedAt }];
    const result = resolve("custom question", settings);
    assert.equal(result.category, "customRule");
    assert.equal(result.resolvedDestination, "https://canonical.example.test/pages/help");
  });
  await test("center", "quick replies take priority over custom rules", () => {
    const settings = enableQuick(config(), "orderHelp", { keywords: ["same"], replyText: "Quick answer", order: 99 });
    settings.customRules = [{ id: "custom-priority", enabled: true, name: "Custom", order: 0, matchMode: "exact", keywords: ["same"], replyText: "Custom answer", buttonLabel: "", destination: "", createdAt: settings.updatedAt, updatedAt: settings.updatedAt }];
    assert.equal(resolve("same", settings).replyText, "Quick answer");
  });
  await test("center", "item order is deterministic and first match wins", () => {
    const settings = enableQuick(config(), "orderHelp", { keywords: ["same"], replyText: "Later", order: 20 });
    enableQuick(settings, "membership", { keywords: ["same"], replyText: "Earlier", order: 10 });
    assert.equal(resolve("same", settings).replyText, "Earlier");
  });
  await test("center", "ID breaks equal-order ties deterministically", () => {
    const settings = enableQuick(config(), "orderHelp", { keywords: ["same"], replyText: "Order", order: 0 });
    enableQuick(settings, "membership", { keywords: ["same"], replyText: "Member", order: 0 });
    assert.equal(resolve("same", settings).itemId, "membership");
  });
  await test("center", "fallback uses current editable text", () => {
    const settings = config();
    settings.fallback = { enabled: true, text: "Fixture fallback" };
    assert.equal(resolve("unmatched", settings).text, "Fixture fallback");
  });
  await test("center", "all items disabled and fallback off means no reply", () => {
    const result = resolve("anything", config());
    assert.equal(result.category, "noReply");
    assert.equal(result.messages.length, 0);
  });
  await test("center", "exact and contains matching remain explicit", () => {
    const settings = enableQuick(config(), "orderHelp", { keywords: ["fixture help"], matchMode: "exact" });
    assert.equal(resolve("prefix fixture help", settings).category, "noReply");
    item(settings, "orderHelp").matchMode = "contains";
    assert.equal(resolve("prefix fixture help", settings).itemId, "orderHelp");
  });
  await test("center", "Unicode and whitespace normalization remains deterministic", () => {
    assert.equal(normalizeLineText("  A\tＢ  "), "a b");
    const settings = enableQuick(config(), "orderHelp", { keywords: ["ＦＩＸＴＵＲＥ HELP"] });
    assert.equal(resolve("fixture   help", settings).itemId, "orderHelp");
  });
  await test("center", "all production customer copy defaults are blank and disabled", () => {
    const defaults = defaultLineSettings();
    assert.equal(defaults.enabled, false);
    assert.equal(defaults.fallback.enabled, false);
    assert.equal(defaults.fallback.text, "");
    assert.deepEqual(defaults.customRules, []);
    for (const quick of defaults.quickReplies) {
      assert.equal(quick.enabled, false);
      assert.deepEqual(quick.keywords, []);
      assert.equal(quick.replyText, "");
      assert.equal(quick.buttonLabel, "");
      assert.equal(quick.destination, quick.id === "beanMenu" ? "/monthly-menu" : "");
    }
  });
  await test("center", "management center retains Owner editing and preview controls in the six-section guided tree", async () => {
    const source = await readFile("components/admin/LineAutoReplyManager.tsx", "utf8");
    for (const heading of ["正式自動回覆", "顧客導覽架構", "問答內容", "會員個人功能", "未命中回覆", "模擬測試"]) assert.match(source, new RegExp(heading));
    assert.match(source, /顧客導覽樹/);
    assert.match(source, /ON/);
    assert.match(source, /replyPreview/);
    assert.match(source, /模擬測試會忽略正式自動回覆總開關/);
    assert.match(source, /正式自動回覆目前關閉；以下僅為模擬結果/);
  });
  await test("center", "Admin home description is neutral rather than bean-menu-centric", async () => {
    const source = await readFile("app/admin/page.tsx", "utf8");
    assert.match(source, /常見問題、關鍵字、回覆內容與測試/);
    assert.doesNotMatch(source, /豆單、關鍵字、說明文字與回覆測試/);
  });

  await test("migration", "LINE.AUTO.1 migrates in memory without rewriting settings.json", async () => {
    const legacy = legacySettings();
    const raw = JSON.stringify(legacy);
    await writeFile(settingsFile(), raw);
    const migrated = await readLineSettings();
    assert.equal(migrated.schemaVersion, 2);
    assert.equal(await readFile(settingsFile(), "utf8"), raw);
    await rm(settingsFile());
  });
  await test("migration", "migration keeps production auto reply disabled for Owner review", () => {
    assert.equal(migrateLineAutoReplyV1(legacySettings()).enabled, false);
  });
  await test("migration", "migration preserves useful bean triggers and copy but points only to monthly menu", () => {
    const migrated = migrateLineAutoReplyV1(legacySettings());
    const bean = item(migrated, "beanMenu");
    assert.equal(bean.enabled, true);
    assert.equal(bean.matchMode, "contains");
    assert.deepEqual(bean.keywords, ["Fixture legacy menu"]);
    assert.match(bean.replyText, /Fixture legacy title/);
    assert.equal(bean.buttonLabel, "Fixture legacy CTA");
    assert.equal(bean.destination, "/monthly-menu");
  });
  await test("migration", "migration drops duplicated bean product presentation fields", () => {
    const serialized = JSON.stringify(migrateLineAutoReplyV1(legacySettings()));
    assert.doesNotMatch(serialized, /fixture-product|duplicated description|displayFields|availableText|products/);
  });
  await test("migration", "migration preserves general custom rules and fallback copy", () => {
    const migrated = migrateLineAutoReplyV1(legacySettings());
    assert.equal(migrated.customRules[0].replyText, "Fixture legacy answer");
    assert.deepEqual(migrated.fallback, { enabled: true, text: "Fixture legacy fallback" });
  });
  await test("migration", "legacy bean menu without reusable reply copy remains disabled", () => {
    const legacy = legacySettings();
    legacy.beanMenu.title = "";
    legacy.beanMenu.intro = "";
    legacy.beanMenu.helpText = "";
    legacy.beanMenu.footer = "";
    assert.equal(item(migrateLineAutoReplyV1(legacy), "beanMenu").enabled, false);
  });

  await test("security", "missing config defaults disabled without creating a file", async () => {
    assert.deepEqual(await readLineSettings(), defaultLineSettings());
    assert.equal(await readFile(settingsFile()).then(() => true, () => false), false);
  });
  await test("security", "enabled items require keywords and reply text", () => {
    const noKeywords = config();
    item(noKeywords, "orderHelp").enabled = true;
    assert.throws(() => validateLineSettings(noKeywords));
    const noCopy = config();
    item(noCopy, "orderHelp").enabled = true;
    item(noCopy, "orderHelp").keywords = ["fixture"];
    assert.throws(() => validateLineSettings(noCopy));
  });
  await test("security", "duplicate normalized keywords and invalid match mode are rejected", () => {
    const settings = enableQuick(config(), "orderHelp", { keywords: ["Fixture", "ＦＩＸＴＵＲＥ"] });
    assert.throws(() => validateLineSettings(settings));
    const invalid = enableQuick(config(), "orderHelp");
    (item(invalid, "orderHelp") as unknown as { matchMode: string }).matchMode = "regex";
    assert.throws(() => validateLineSettings(invalid));
  });
  await test("security", "quick reply inventory must contain every canonical type exactly once", () => {
    const missing = config();
    missing.quickReplies.pop();
    assert.throws(() => validateLineSettings(missing));
    const duplicate = config();
    duplicate.quickReplies[1].id = "beanMenu";
    assert.throws(() => validateLineSettings(duplicate));
  });
  await test("security", "custom rules are bounded and duplicate IDs are rejected", () => {
    const settings = config();
    const base = { id: "fixture", enabled: false, name: "Fixture", order: 0, matchMode: "exact" as const, keywords: [], replyText: "", buttonLabel: "", destination: "", createdAt: settings.updatedAt, updatedAt: settings.updatedAt };
    settings.customRules = [base, clone(base)];
    assert.throws(() => validateLineSettings(settings));
    settings.customRules = Array.from({ length: 101 }, (_, index) => ({ ...base, id: `fixture-${index}` }));
    assert.throws(() => validateLineSettings(settings));
  });
  await test("security", "Admin authorization and same-origin protection remain enforced", async () => {
    for (const action of ["get", "save", "simulate"] as const) assert.equal((await handleLineReplyAdmin(adminRequest({}), action, { authorized: async () => false })).status, 401);
    const crossOrigin = new Request("https://canonical.example.test/api/admin/line-auto-reply", { method: "PUT", headers: { Origin: "https://other.example.test" }, body: "{}" });
    assert.equal((await handleLineReplyAdmin(crossOrigin, "save", { authorized: async () => true })).status, 403);
  });
  await test("security", "Admin save persists v2 and GET exposes no products payload", async () => {
    const settings = enableQuick(config(), "beanMenu", { replyText: "Fixture saved copy", buttonLabel: "Fixture CTA" });
    const response = await handleLineReplyAdmin(adminRequest({ settings, expectedRevision: 0 }), "save", { authorized: async () => true });
    assert.equal(response.status, 200);
    const stored = (await response.json()).settings;
    assert.equal(stored.schemaVersion, 2);
    assert.equal(stored.revision, 1);
    const getResponse = await handleLineReplyAdmin(new Request("https://canonical.example.test/api/admin/line-auto-reply"), "get", { authorized: async () => true });
    const body = await getResponse.json();
    assert.deepEqual(Object.keys(body), ["settings"]);
  });
  await test("security", "stale revisions and malformed JSON are rejected", async () => {
    await assert.rejects(() => saveLineSettings(config(), 0), (error: unknown) => (error as { status: number }).status === 409);
    const malformed = new Request("https://canonical.example.test/api/admin/line-auto-reply", { method: "PUT", body: "{broken" });
    assert.equal((await handleLineReplyAdmin(malformed, "save", { authorized: async () => true })).status, 400);
  });
  await test("security", "simulator uses the production engine and sends no LINE request", async () => {
    const settings = enableQuick(config(), "beanMenu", { keywords: ["豆單"], replyText: "Fixture simulator", buttonLabel: "Fixture CTA" });
    settings.revision = 1;
    const before = calls.length;
    const response = await handleLineReplyAdmin(adminRequest({ settings, message: "豆單" }, "/api/admin/line-auto-reply/simulate"), "simulate", { authorized: async () => true });
    const result = (await response.json()).result;
    assert.deepEqual(result, resolve("豆單", settings));
    assert.equal(calls.length, before);
  });
  await test("security", "simulator returns the same canonical URL when the display label is blank", async () => {
    const settings = enableQuick(config(), "beanMenu", { keywords: ["無標籤豆單"], replyText: "Fixture simulator no label", buttonLabel: "" });
    settings.revision = 1;
    const before = calls.length;
    const response = await handleLineReplyAdmin(adminRequest({ settings, message: "無標籤豆單" }, "/api/admin/line-auto-reply/simulate"), "simulate", { authorized: async () => true });
    const result = (await response.json()).result;
    assert.equal(result.text, "Fixture simulator no label\n\nhttps://canonical.example.test/monthly-menu");
    assert.equal(result.resolvedDestination, resolve("無標籤豆單", settings).resolvedDestination);
    assert.equal(calls.length, before);
  });
  await test("security", "simulator safely previews a configured bean reply while the production master switch is off", async () => {
    const settings = enableQuick(config(), "beanMenu", { keywords: ["豆單"], replyText: "Fixture safe preview", buttonLabel: "" });
    settings.enabled = false;
    settings.revision = 1;
    const persistedBefore = await readFile(settingsFile());
    const before = calls.length;
    const response = await handleLineReplyAdmin(adminRequest({ settings, message: "豆單" }, "/api/admin/line-auto-reply/simulate"), "simulate", { authorized: async () => true });
    const result = (await response.json()).result;
    assert.equal(response.status, 200);
    assert.equal(result.category, "quickReply");
    assert.equal(result.itemId, "beanMenu");
    assert.equal(result.resolvedDestination, "https://canonical.example.test/monthly-menu");
    assert.equal(calls.length, before);
    assert.equal(settings.enabled, false);
    assert.deepEqual(await readFile(settingsFile()), persistedBefore);
  });
  await test("security", "valid LINE signature is accepted and replied", async () => {
    const settings = enableQuick(config(), "orderHelp");
    const response = await handleCustomerLineWebhook(webhookRequest({ events: [event()] }), { loadSettings: async () => settings, claim: async () => true, fetcher: mockFetch });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).sent, 1);
  });
  await test("security", "invalid, missing and LINE Login signatures cannot verify customer webhook", async () => {
    const raw = JSON.stringify({ events: [] });
    for (const supplied of [null, "invalid", signature(raw, process.env.LINE_LOGIN_CHANNEL_SECRET)]) assert.equal(verifyCustomerLineSignature(Buffer.from(raw), supplied, process.env.LINE_CUSTOMER_CHANNEL_SECRET!), false);
    assert.equal((await handleCustomerLineWebhook(webhookRequest(raw, signature(raw, process.env.LINE_LOGIN_CHANNEL_SECRET)))).status, 401);
  });
  await test("security", "raw signed bytes remain unmodified", () => {
    const raw = '{ "events":[], "fixture":"你好\\n😀" }';
    assert.equal(verifyCustomerLineSignature(Buffer.from(raw), signature(raw), process.env.LINE_CUSTOMER_CHANNEL_SECRET!), true);
    assert.equal(verifyCustomerLineSignature(Buffer.from(JSON.stringify(JSON.parse(raw))), signature(raw), process.env.LINE_CUSTOMER_CHANNEL_SECRET!), false);
  });
  await test("security", "customer token is isolated from internal and legacy tokens", () => {
    const latest = calls.at(-1)!;
    assert.equal(latest.headers.get("Authorization"), "Bearer synthetic-customer-token");
    assert.equal(latest.url, "https://api.line.me/v2/bot/message/reply");
    assert.doesNotMatch(latest.headers.get("Authorization") || "", /internal|legacy/);
  });
  await test("security", "missing customer token never falls back to internal or legacy", async () => {
    delete process.env.LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN;
    const before = calls.length;
    assert.equal((await replyCustomerLine("fixture", ["Fixture"], mockFetch)).sent, false);
    assert.equal(calls.length, before);
    process.env.LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN = "synthetic-customer-token";
  });
  await test("security", "global disabled loads no event claim and sends nothing", async () => {
    const settings = enableQuick(config(), "beanMenu", { keywords: ["豆單"], replyText: "Fixture production off", buttonLabel: "" });
    settings.enabled = false;
    const before = calls.length;
    let claims = 0;
    const response = await handleCustomerLineWebhook(webhookRequest({ events: [event("disabled", "豆單")] }), { loadSettings: async () => settings, claim: async () => { claims++; return true; }, fetcher: mockFetch });
    assert.equal((await response.json()).sent, 0);
    assert.equal(claims, 0);
    assert.equal(calls.length, before);
    assert.equal(settings.enabled, false);
  });
  await test("security", "duplicate event claims remain idempotent", async () => {
    assert.deepEqual((await Promise.all([claimLineEvent("duplicate-fixture"), claimLineEvent("duplicate-fixture")])).sort(), [false, true]);
  });
  await test("security", "unsupported events and oversized payloads fail safely", async () => {
    const settings = enableQuick(config(), "orderHelp");
    const unsupported = await handleCustomerLineWebhook(webhookRequest({ events: [{ type: "follow", replyToken: "fixture" }, { ...event("image"), message: { type: "image" } }] }), { loadSettings: async () => settings, claim: async () => true, fetcher: mockFetch });
    assert.equal((await unsupported.json()).sent, 0);
    assert.equal((await handleCustomerLineWebhook(webhookRequest("x".repeat(256001)), { loadSettings: async () => assert.fail("must not load") })).status, 413);
  });
  await test("security", "multi-message split respects LINE limits and surrogate pairs", () => {
    const text = "😀".repeat(6000);
    const chunks = splitLineReply(text);
    assert.equal(chunks.join(""), text);
    assert.ok(chunks.every((chunk) => chunk.length <= 5000 && !/[\uD800-\uDBFF]$/u.test(chunk)));
    assert.equal(splitLineReply("x".repeat(25001)).length, 0);
  });
  await test("security", "malformed persisted settings fail closed without overwrite", async () => {
    const before = await readFile(settingsFile());
    await writeFile(settingsFile(), "{broken");
    await assert.rejects(() => readLineSettings());
    await assert.rejects(() => saveLineSettings(config(), 1));
    assert.equal(await readFile(settingsFile(), "utf8"), "{broken");
    await writeFile(settingsFile(), before);
  });
  await test("security", "current J6 customer webhook remains a public Node POST route", async () => {
    const route = await readFile("app/api/webhooks/line/customer/route.ts", "utf8");
    assert.match(route, /runtime = "nodejs"/);
    assert.match(route, /export async function POST/);
    assert.doesNotMatch(route, /redirect|readAdminSession/);
    assert.match(await readFile("app/api/webhooks/line/customer/route.ts", "utf8"), /handleCustomerLineWebhook/);
  });
  await test("security", "no real external network request occurred", () => assert.equal(realNetworkAttempts, 0));

  console.log(`LINE.AUTO.2 PASS: center=${counts.center}, migration=${counts.migration}, security=${counts.security}, total=${counts.center + counts.migration + counts.security}, failed=0, real-network-attempts=${realNetworkAttempts}`);
} finally {
  assert.ok(temp.startsWith(path.join(os.tmpdir(), "kd-line-auto-2-")));
  await rm(temp, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) if (!(key in savedEnvironment)) delete process.env[key];
  Object.assign(process.env, savedEnvironment);
}
