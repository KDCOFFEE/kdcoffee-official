import type { CoffeeArtwork, PurchaseOption } from "@/data/websiteData";
import { isProductListedInWorks } from "./productListing";
import { beanFields, type LineAutoReplySettings, type LineReplyResult, type MatchMode } from "./lineAutoReplyTypes";

export function normalizeLineText(value: string) { return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase(); }
export function matchLineKeywords(message: string, keywords: readonly string[], mode: MatchMode) {
  return keywords.find(keyword => { const normalized = normalizeLineText(keyword); return !!normalized && (mode === "exact" ? message === normalized : message.includes(normalized)); });
}
export function lineProductId(product: CoffeeArtwork) { return product.id || product.slug; }
function availableOptions(product: CoffeeArtwork) {
  const source = Array.isArray(product.skus) && product.skus.length ? product.skus : product.purchase;
  return (Array.isArray(source) ? source : []).filter((s: PurchaseOption) =>
    s.enabled !== false && Number.isFinite(s.price) && s.price >= 0 &&
    Number.isInteger(s.stock ?? product.stock) && Number(s.stock ?? product.stock) > 0);
}
export function isLineBeanAvailable(product: CoffeeArtwork) {
  return isProductListedInWorks(product) && product.active !== false &&
    product.status === "active" && product.purchasable !== false &&
    !!product.name?.trim() && /^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(product.slug) && availableOptions(product).length > 0;
}
export type ResolvedLineBean = { productId: string; name: string; description: string; fields: Record<string, string> };
export function resolveLineBeans(settings: LineAutoReplySettings["beanMenu"], catalog: readonly CoffeeArtwork[], publicOrigin = ""): ResolvedLineBean[] {
  let origin = "";
  try { const u = new URL(publicOrigin); if (u.protocol === "https:" && !u.username && !u.password) origin = u.origin; } catch { /* No guessed public origin. */ }
  return settings.products.filter(p => p.enabled).slice().sort((a,b) => a.order - b.order || a.productId.localeCompare(b.productId)).flatMap(selection => {
    const matches = catalog.filter(p => lineProductId(p) === selection.productId);
    const product = matches.length === 1 ? matches[0] : undefined;
    if (!product || !isLineBeanAvailable(product)) return [];
    const price = availableOptions(product).map(s => [s.label?.trim(), String(s.price)].filter(Boolean).join(": ")).join(" / ");
    return [{ productId: selection.productId, name: product.name, description: selection.lineDescriptionOverride.trim() || product.shortCopy?.trim() || product.mood?.trim() || "",
      fields: { price, roast: product.roast || "", origin: product.origin || "", process: product.process || "",
        flavors: (product.flavors || []).join(" · "), variety: product.variety || "", altitude: product.altitude || "",
        status: settings.availableText, productUrl: origin ? new URL(`/works/${encodeURIComponent(product.slug)}`, origin).href : "" } }];
  });
}
export function formatLineBeanMenu(menu: LineAutoReplySettings["beanMenu"], beans: readonly ResolvedLineBean[]) {
  if (!beans.length) return menu.emptyStateReply.trim();
  const rows = beans.map((bean,index) => [
    `${index+1}. ${bean.name}`,
    ...beanFields.flatMap(key => menu.displayFields[key] && menu.labels[key].trim() && bean.fields[key]
      ? [`${menu.labels[key].trim()}: ${bean.fields[key]}`] : []), bean.description,
  ].filter(Boolean).join("\n"));
  return [menu.title, menu.intro, menu.helpText, ...rows, menu.footer, ...(menu.ctaUrl ? [menu.ctaLabel, menu.ctaUrl] : [])].map(t => t.trim()).filter(Boolean).join("\n\n");
}
export function splitLineReply(text: string) {
  if (!text.trim() || text.length > 25_000) return [];
  const chunks: string[] = [];
  for (let start=0; start<text.length;) {
    let end = Math.min(start+5000, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end-1])) end--;
    chunks.push(text.slice(start,end)); start=end;
  }
  return chunks.length <= 5 ? chunks : [];
}
export function resolveLineReply(message: string, settings: LineAutoReplySettings, catalog: readonly CoffeeArtwork[], publicOrigin = ""): LineReplyResult {
  const normalizedMessage = normalizeLineText(message);
  const result: LineReplyResult = { normalizedMessage, category: "noReply", productIds: [], text: "", messages: [] };
  if (!settings.enabled) return { ...result, reason: "disabled" };
  const finish = (candidate: LineReplyResult): LineReplyResult => {
    const messages = splitLineReply(candidate.text);
    return messages.length ? { ...candidate, messages } : { ...candidate, category: "noReply", text: "", messages: [], reason: candidate.text ? "reply-too-long" : "empty-reply" };
  };
  const keyword = settings.beanMenu.enabled ? matchLineKeywords(normalizedMessage, settings.beanMenu.keywords, settings.beanMenu.matchMode) : undefined;
  if (keyword) {
    const beans = resolveLineBeans(settings.beanMenu,catalog,publicOrigin);
    return finish({ ...result, category: "beanMenu", keyword, productIds: beans.map(p=>p.productId), text: formatLineBeanMenu(settings.beanMenu,beans) });
  }
  const rules = settings.rules.filter(r=>r.enabled).slice().sort((a,b)=>a.order-b.order || a.id.localeCompare(b.id));
  for (const rule of rules) {
    const hit = matchLineKeywords(normalizedMessage,rule.keywords,rule.matchMode);
    if (hit && rule.replyText.trim()) return finish({ ...result, category: "rule", keyword: hit, ruleId: rule.id, ruleName: rule.name, text: rule.replyText });
  }
  return settings.fallback.enabled ? finish({ ...result, category: "fallback", text: settings.fallback.text }) : result;
}
