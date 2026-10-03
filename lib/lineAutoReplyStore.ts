import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { CoffeeArtwork } from "@/data/websiteData";
import { atomicWriteJson, withFileLock } from "./jsonFileStore";
import { getLineAutoReplyDir, getWebsiteDataFile } from "./storagePaths";
import { beanFields, type LineAutoReplySettings, type MatchMode } from "./lineAutoReplyTypes";
import { normalizeLineText } from "./lineAutoReplyEngine";

export class LineSettingsError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.name = "LineSettingsError"; this.status = status; }
}
const fail = (field: string): never => { throw new LineSettingsError(`設定格式或長度不正確：${field}`); };
function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail(field);
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, field: string) {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) return fail(field);
  return value.trim();
}
function bool(value: unknown, field: string) { if (typeof value !== "boolean") return fail(field); return value; }
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
function mode(value: unknown): MatchMode { if (value !== "exact" && value !== "contains") return fail("比對方式"); return value; }
function array(value: unknown, max: number, field: string): unknown[] {
  if (!Array.isArray(value) || value.length > max) return fail(field); return value;
}
function keywords(value: unknown) {
  const words = array(value, 30, "關鍵字").map(item => { const word = text(item, 100, "關鍵字"); if (!normalizeLineText(word)) return fail("空白關鍵字"); return word; });
  unique(words.map(normalizeLineText), "重複關鍵字");
  return words;
}
function unique(values: string[], field: string) { if (new Set(values).size !== values.length) fail(field); }
export function validateLineSettings(value: unknown): LineAutoReplySettings {
  const v = record(value, "設定"), menu = record(v.beanMenu, "豆單"), fallback = record(v.fallback, "預設回覆");
  if (v.schemaVersion !== 1) return fail("版本");
  const display = record(menu.displayFields, "顯示欄位"), labels = record(menu.labels, "欄位名稱");
  const products = array(menu.products, 50, "商品").map(raw => {
    const p = record(raw, "商品");
    return { productId: id(p.productId, "商品編號"), enabled: bool(p.enabled, "商品開關"), order: number(p.order, "商品順序"), lineDescriptionOverride: text(p.lineDescriptionOverride, 800, "商品說明") };
  });
  unique(products.map(p => p.productId), "重複商品");
  const rules = array(v.rules, 100, "規則").map(raw => {
    const r = record(raw, "規則");
    const name = text(r.name, 100, "規則名稱"), words = keywords(r.keywords), replyText = text(r.replyText, 4500, "回覆");
    // Unfinished rules stay in the browser draft, regardless of their enabled switch.
    if (!name) return fail("規則名稱不可空白");
    if (!words.length) return fail("每個規則至少需要一個關鍵字");
    if (!replyText) return fail("規則回覆文字不可空白");
    return { id: id(r.id, "規則編號"), enabled: bool(r.enabled, "規則開關"), name, order: number(r.order, "規則順序"), matchMode: mode(r.matchMode), keywords: words, replyText, createdAt: timestamp(r.createdAt, "建立時間"), updatedAt: timestamp(r.updatedAt, "更新時間") };
  });
  unique(rules.map(r => r.id), "重複規則");
  const beanEnabled = bool(menu.enabled, "豆單開關"), beanKeywords = keywords(menu.keywords);
  const fallbackEnabled = bool(fallback.enabled, "預設回覆開關"), fallbackText = text(fallback.text, 4500, "預設回覆");
  if (beanEnabled && !beanKeywords.length) return fail("啟用豆單時至少需要一個關鍵字");
  if (fallbackEnabled && !fallbackText) return fail("啟用預設回覆時文字不可空白");
  products.sort((a,b) => a.order - b.order || a.productId.localeCompare(b.productId));
  rules.sort((a,b) => a.order - b.order || a.id.localeCompare(b.id));
  const ctaUrl = text(menu.ctaUrl, 2000, "連結");
  if (ctaUrl) {
    try { const u = new URL(ctaUrl); if (u.protocol !== "https:" || u.username || u.password) return fail("連結必須是 HTTPS"); }
    catch { return fail("連結必須是 HTTPS"); }
  }
  return {
    schemaVersion: 1, revision: number(v.revision, "版本序號"), enabled: bool(v.enabled, "總開關"), updatedAt: timestamp(v.updatedAt, "更新時間"),
    fallback: { enabled: fallbackEnabled, text: fallbackText },
    beanMenu: {
      enabled: beanEnabled, matchMode: mode(menu.matchMode), keywords: beanKeywords,
      title: text(menu.title, 200, "標題"), intro: text(menu.intro, 1000, "前言"), helpText: text(menu.helpText, 1000, "操作說明"),
      emptyStateReply: text(menu.emptyStateReply, 4500, "空豆單回覆"), footer: text(menu.footer, 1000, "結尾"),
      ctaLabel: text(menu.ctaLabel, 100, "連結文字"), ctaUrl, availableText: text(menu.availableText, 100, "供應狀態文字"),
      displayFields: Object.fromEntries(beanFields.map(k => [k, bool(display[k], k)])) as LineAutoReplySettings["beanMenu"]["displayFields"],
      labels: Object.fromEntries(beanFields.map(k => [k, text(labels[k], 40, k)])) as LineAutoReplySettings["beanMenu"]["labels"],
      products, updatedAt: timestamp(menu.updatedAt, "豆單更新時間"),
    }, rules,
  };
}
export function defaultLineSettings(): LineAutoReplySettings {
  const updatedAt = "1970-01-01T00:00:00.000Z";
  return { schemaVersion: 1, revision: 0, enabled: false, updatedAt, fallback: { enabled: false, text: "" },
    beanMenu: { enabled: false, matchMode: "exact", keywords: [], title: "", intro: "", helpText: "", emptyStateReply: "", footer: "", ctaLabel: "", ctaUrl: "", availableText: "",
      displayFields: Object.fromEntries(beanFields.map(k => [k, false])) as LineAutoReplySettings["beanMenu"]["displayFields"],
      labels: Object.fromEntries(beanFields.map(k => [k, ""])) as LineAutoReplySettings["beanMenu"]["labels"], products: [], updatedAt }, rules: [] };
}
export async function readLineSettings() {
  try { return validateLineSettings(JSON.parse(await fs.readFile(path.join(getLineAutoReplyDir(), "settings.json"), "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return defaultLineSettings(); throw new LineSettingsError("自動回覆設定無法安全讀取，請先修復設定檔。", 503); }
}
export async function readLineProducts(): Promise<CoffeeArtwork[]> {
  const data = JSON.parse(await fs.readFile(getWebsiteDataFile(), "utf8"));
  if (!Array.isArray(data?.menu?.products)) throw new LineSettingsError("商品資料無法安全讀取。", 503);
  return data.menu.products;
}
export async function saveLineSettings(candidate: unknown, expectedRevision: unknown) {
  const validated = validateLineSettings(candidate);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== validated.revision) throw new LineSettingsError("設定版本不正確。");
  const catalog = await readLineProducts();
  const known = new Set(catalog.map(p => p.id || p.slug));
  if (validated.beanMenu.products.some(p => p.enabled && !known.has(p.productId))) throw new LineSettingsError("找不到選取的商品，請重新整理商品清單。");
  const dir = getLineAutoReplyDir(), file = path.join(dir, "settings.json");
  await fs.mkdir(dir, { recursive: true });
  return withFileLock(file, async () => {
    const current = await readLineSettings();
    if (current.revision !== expectedRevision) throw new LineSettingsError("設定已由其他視窗更新，請重新載入。", 409);
    const now = new Date().toISOString();
    const oldRules = new Map(current.rules.map(r => [r.id, r]));
    const next = { ...validated, revision: current.revision + 1, updatedAt: now,
      beanMenu: { ...validated.beanMenu, updatedAt: now },
      rules: validated.rules.map(r => ({ ...r, createdAt: oldRules.get(r.id)?.createdAt || now, updatedAt: now })) };
    await atomicWriteJson(file, next);
    return next;
  });
}
