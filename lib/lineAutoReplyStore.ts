import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { atomicWriteJson, withFileLock } from "./jsonFileStore";
import { getLineAutoReplyDir } from "./storagePaths";
import { normalizeLineText, validateLineDestination } from "./lineAutoReplyEngine";
import {
  lineQuickReplyAdminNames,
  lineQuickReplyTypes,
  type LineAutoReplySettings,
  type LineCustomReplyRule,
  type LineQuickReplyItem,
  type LineQuickReplyType,
  type MatchMode,
} from "./lineAutoReplyTypes";

export class LineSettingsError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "LineSettingsError";
    this.status = status;
  }
}

const fail = (field: string): never => {
  throw new LineSettingsError(`設定格式或長度不正確：${field}`);
};

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail(field);
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number, field: string) {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) return fail(field);
  return value.trim();
}

function bool(value: unknown, field: string) {
  if (typeof value !== "boolean") return fail(field);
  return value;
}

function number(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 1_000_000) return fail(field);
  return value;
}

function id(value: unknown, field: string) {
  const valueText = text(value, 120, field);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(valueText)) return fail(field);
  return valueText;
}

function timestamp(value: unknown, field: string) {
  const valueText = text(value, 40, field);
  if (!valueText || !Number.isFinite(Date.parse(valueText))) return fail(field);
  return valueText;
}

function mode(value: unknown): MatchMode {
  if (value !== "exact" && value !== "contains") return fail("比對方式");
  return value;
}

function array(value: unknown, max: number, field: string): unknown[] {
  if (!Array.isArray(value) || value.length > max) return fail(field);
  return value;
}

function unique(values: string[], field: string) {
  if (new Set(values).size !== values.length) fail(field);
}

function keywords(value: unknown) {
  const words = array(value, 30, "關鍵字").map((item) => {
    const word = text(item, 100, "關鍵字");
    if (!normalizeLineText(word)) return fail("空白關鍵字");
    return word;
  });
  unique(words.map(normalizeLineText), "重複關鍵字");
  return words;
}

function destination(value: unknown, field = "連結") {
  const valueText = text(value, 2000, field);
  try {
    return validateLineDestination(valueText);
  } catch {
    return fail("連結必須是安全站內路徑或 HTTPS 網址");
  }
}

function quickReplyId(value: unknown): LineQuickReplyType {
  const valueText = id(value, "快速回覆編號");
  if (!(lineQuickReplyTypes as readonly string[]).includes(valueText)) return fail("快速回覆編號");
  return valueText as LineQuickReplyType;
}

function replyFields(raw: Record<string, unknown>, field: string) {
  const enabled = bool(raw.enabled, `${field}開關`);
  const name = text(raw.name, 100, `${field}名稱`);
  const words = keywords(raw.keywords);
  const replyText = text(raw.replyText, 4500, `${field}回覆`);
  const buttonLabel = text(raw.buttonLabel, 100, `${field}連結顯示文字`);
  const safeDestination = destination(raw.destination, `${field}連結`);
  if (!name) return fail(`${field}名稱不可空白`);
  if (enabled && !words.length) return fail(`啟用${field}時至少需要一個關鍵字`);
  if (enabled && !replyText) return fail(`啟用${field}時回覆文字不可空白`);
  if (buttonLabel && !safeDestination) return fail(`${field}有連結顯示文字時，連結目的地不可空白`);
  return {
    enabled,
    name,
    order: number(raw.order, `${field}順序`),
    matchMode: mode(raw.matchMode),
    keywords: words,
    replyText,
    buttonLabel,
    destination: safeDestination,
    updatedAt: timestamp(raw.updatedAt, `${field}更新時間`),
  };
}

export function validateLineSettings(value: unknown): LineAutoReplySettings {
  const root = record(value, "設定");
  if (root.schemaVersion !== 2) return fail("版本");
  const fallback = record(root.fallback, "預設回覆");
  const quickReplies: LineQuickReplyItem[] = array(root.quickReplies, lineQuickReplyTypes.length, "快速回覆").map((raw) => {
    const item = record(raw, "快速回覆");
    return { id: quickReplyId(item.id), ...replyFields(item, "快速回覆") };
  });
  if (quickReplies.length !== lineQuickReplyTypes.length) return fail("快速回覆項目不完整");
  unique(quickReplies.map((item) => item.id), "重複快速回覆項目");
  for (const required of lineQuickReplyTypes) if (!quickReplies.some((item) => item.id === required)) return fail("快速回覆項目不完整");
  const beanMenu = quickReplies.find((item) => item.id === "beanMenu")!;
  if (beanMenu.enabled && !beanMenu.destination) return fail("啟用豆單時連結目的地不可空白");

  const customRules: LineCustomReplyRule[] = array(root.customRules, 100, "自訂規則").map((raw) => {
    const item = record(raw, "自訂規則");
    return {
      id: id(item.id, "規則編號"),
      ...replyFields(item, "自訂規則"),
      createdAt: timestamp(item.createdAt, "建立時間"),
    };
  });
  unique(customRules.map((item) => item.id), "重複規則");

  const fallbackEnabled = bool(fallback.enabled, "預設回覆開關");
  const fallbackText = text(fallback.text, 4500, "預設回覆");
  if (fallbackEnabled && !fallbackText) return fail("啟用預設回覆時文字不可空白");
  quickReplies.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  customRules.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  return {
    schemaVersion: 2,
    revision: number(root.revision, "版本序號"),
    enabled: bool(root.enabled, "總開關"),
    updatedAt: timestamp(root.updatedAt, "更新時間"),
    quickReplies,
    customRules,
    fallback: { enabled: fallbackEnabled, text: fallbackText },
  };
}

export function defaultLineSettings(): LineAutoReplySettings {
  const updatedAt = "1970-01-01T00:00:00.000Z";
  return {
    schemaVersion: 2,
    revision: 0,
    enabled: false,
    updatedAt,
    quickReplies: lineQuickReplyTypes.map((itemId, order) => ({
      id: itemId,
      enabled: false,
      name: lineQuickReplyAdminNames[itemId],
      order,
      matchMode: "exact",
      keywords: [],
      replyText: "",
      buttonLabel: "",
      destination: itemId === "beanMenu" ? "/monthly-menu" : "",
      updatedAt,
    })),
    customRules: [],
    fallback: { enabled: false, text: "" },
  };
}

export function migrateLineAutoReplyV1(value: unknown): LineAutoReplySettings {
  const root = record(value, "舊版設定");
  if (root.schemaVersion !== 1) return fail("舊版版本");
  const updatedAt = timestamp(root.updatedAt, "舊版更新時間");
  const next = defaultLineSettings();
  next.revision = number(root.revision, "舊版版本序號");
  next.updatedAt = updatedAt;
  // Migration always remains off until the Owner reviews the new response center.
  next.enabled = false;

  const fallback = record(root.fallback, "舊版預設回覆");
  next.fallback = {
    enabled: bool(fallback.enabled, "舊版預設回覆開關"),
    text: text(fallback.text, 4500, "舊版預設回覆"),
  };
  if (next.fallback.enabled && !next.fallback.text) next.fallback.enabled = false;

  const menu = record(root.beanMenu, "舊版豆單");
  const bean = next.quickReplies.find((item) => item.id === "beanMenu")!;
  const migratedCopy = [
    text(menu.title, 200, "舊版豆單標題"),
    text(menu.intro, 1000, "舊版豆單前言"),
    text(menu.helpText, 1000, "舊版豆單說明"),
    text(menu.footer, 1000, "舊版豆單結尾"),
  ].filter(Boolean).join("\n\n");
  bean.matchMode = mode(menu.matchMode);
  bean.keywords = keywords(menu.keywords);
  bean.replyText = migratedCopy;
  bean.buttonLabel = text(menu.ctaLabel, 100, "舊版豆單連結文字");
  bean.destination = "/monthly-menu";
  bean.updatedAt = timestamp(menu.updatedAt, "舊版豆單更新時間");
  bean.enabled = bool(menu.enabled, "舊版豆單開關") && bean.keywords.length > 0 && Boolean(bean.replyText);

  next.customRules = array(root.rules, 100, "舊版規則").map((raw): LineCustomReplyRule => {
    const item = record(raw, "舊版規則");
    const enabled = bool(item.enabled, "舊版規則開關");
    const name = text(item.name, 100, "舊版規則名稱");
    const words = keywords(item.keywords);
    const replyText = text(item.replyText, 4500, "舊版規則回覆");
    if (!name || !words.length || !replyText) return fail("舊版規則內容不完整");
    return {
      id: id(item.id, "舊版規則編號"),
      enabled,
      name,
      order: number(item.order, "舊版規則順序"),
      matchMode: mode(item.matchMode),
      keywords: words,
      replyText,
      buttonLabel: "",
      destination: "",
      createdAt: timestamp(item.createdAt, "舊版規則建立時間"),
      updatedAt: timestamp(item.updatedAt, "舊版規則更新時間"),
    };
  });
  unique(next.customRules.map((item) => item.id), "舊版重複規則");
  return validateLineSettings(next);
}

function parseLineSettings(value: unknown) {
  const root = record(value, "設定");
  return root.schemaVersion === 1 ? migrateLineAutoReplyV1(root) : validateLineSettings(root);
}

export async function readLineSettings() {
  try {
    return parseLineSettings(JSON.parse(await fs.readFile(path.join(getLineAutoReplyDir(), "settings.json"), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return defaultLineSettings();
    if (error instanceof LineSettingsError) throw error;
    throw new LineSettingsError("自動回覆設定無法安全讀取，請先修復設定檔。", 503);
  }
}

function comparable(item: LineQuickReplyItem | LineCustomReplyRule) {
  const { updatedAt: _updatedAt, ...rest } = item;
  return JSON.stringify(rest);
}

export async function saveLineSettings(candidate: unknown, expectedRevision: unknown) {
  const validated = validateLineSettings(candidate);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== validated.revision) throw new LineSettingsError("設定版本不正確。");
  const dir = getLineAutoReplyDir();
  const file = path.join(dir, "settings.json");
  await fs.mkdir(dir, { recursive: true });
  return withFileLock(file, async () => {
    const current = await readLineSettings();
    if (current.revision !== expectedRevision) throw new LineSettingsError("設定已由其他視窗更新，請重新載入。", 409);
    const now = new Date().toISOString();
    const oldQuick = new Map(current.quickReplies.map((item) => [item.id, item]));
    const oldCustom = new Map(current.customRules.map((item) => [item.id, item]));
    const next: LineAutoReplySettings = {
      ...validated,
      revision: current.revision + 1,
      updatedAt: now,
      quickReplies: validated.quickReplies.map((item) => {
        const previous = oldQuick.get(item.id);
        return { ...item, updatedAt: previous && comparable(previous) === comparable(item) ? previous.updatedAt : now };
      }),
      customRules: validated.customRules.map((item) => {
        const previous = oldCustom.get(item.id);
        return {
          ...item,
          createdAt: previous?.createdAt || now,
          updatedAt: previous && comparable(previous) === comparable(item) ? previous.updatedAt : now,
        };
      }),
    };
    await atomicWriteJson(file, next);
    return next;
  });
}
