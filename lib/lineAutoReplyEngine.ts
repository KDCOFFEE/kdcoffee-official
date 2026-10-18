import type { LineAutoReplySettings, LineReplyItem, LineReplyResult, MatchMode } from "./lineAutoReplyTypes";

export const DEFAULT_MEMBER_SITE_ORIGIN = "https://www.kdcoffee1962.com";

export function normalizeLineText(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

export function matchLineKeywords(message: string, keywords: readonly string[], mode: MatchMode) {
  return keywords.find((keyword) => {
    const normalized = normalizeLineText(keyword);
    return Boolean(normalized) && (mode === "exact" ? message === normalized : message.includes(normalized));
  });
}

function safeOrigin(value?: string) {
  try {
    const url = new URL(value?.trim() || DEFAULT_MEMBER_SITE_ORIGIN);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return DEFAULT_MEMBER_SITE_ORIGIN;
    return url.origin;
  } catch {
    return DEFAULT_MEMBER_SITE_ORIGIN;
  }
}

export function validateLineDestination(value: string) {
  const destination = value.trim();
  if (!destination) return "";
  if (destination.startsWith("/")) {
    if (destination.startsWith("//") || destination.includes("\\")) throw new Error("Destination must be a safe internal route");
    const parsed = new URL(destination, DEFAULT_MEMBER_SITE_ORIGIN);
    if (parsed.origin !== DEFAULT_MEMBER_SITE_ORIGIN) throw new Error("Destination must be a safe internal route");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }
  const parsed = new URL(destination);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("Destination must use HTTPS");
  return parsed.href;
}

export function resolveLineDestination(destination: string, publicOrigin?: string) {
  const safe = validateLineDestination(destination);
  if (!safe) return "";
  return safe.startsWith("/") ? new URL(safe, safeOrigin(publicOrigin)).href : safe;
}

export function splitLineReply(text: string) {
  if (!text.trim() || text.length > 25_000) return [];
  const chunks: string[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 5000, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1])) end--;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks.length <= 5 ? chunks : [];
}

function finalText(item: Pick<LineReplyItem, "replyText" | "buttonLabel" | "destination">, publicOrigin?: string) {
  const replyText = item.replyText.trim();
  const buttonLabel = item.buttonLabel.trim();
  const resolvedDestination = item.destination.trim()
    ? resolveLineDestination(item.destination, publicOrigin)
    : "";
  const destinationText = resolvedDestination
    ? [buttonLabel, resolvedDestination].filter(Boolean).join("\n")
    : "";
  return {
    replyText,
    buttonLabel: resolvedDestination ? buttonLabel : "",
    destination: item.destination.trim(),
    resolvedDestination,
    text: [replyText, destinationText].filter(Boolean).join("\n\n"),
  };
}

export function resolveLineReply(message: string, settings: LineAutoReplySettings, publicOrigin?: string): LineReplyResult {
  const normalizedMessage = normalizeLineText(message);
  const empty: LineReplyResult = {
    normalizedMessage,
    category: "noReply",
    replyText: "",
    buttonLabel: "",
    destination: "",
    resolvedDestination: "",
    text: "",
    messages: [],
  };
  if (settings.enabled !== true) return { ...empty, reason: "disabled" };

  const finish = (candidate: LineReplyResult): LineReplyResult => {
    const messages = splitLineReply(candidate.text);
    return messages.length
      ? { ...candidate, messages }
      : { ...candidate, category: "noReply", text: "", messages: [], reason: candidate.text ? "reply-too-long" : "empty-reply" };
  };

  const quickReplies = settings.quickReplies.filter((item) => item.enabled).slice()
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  for (const item of quickReplies) {
    const keyword = matchLineKeywords(normalizedMessage, item.keywords, item.matchMode);
    if (!keyword) continue;
    const formatted = finalText(item, publicOrigin);
    return finish({ ...empty, ...formatted, category: "quickReply", itemId: item.id, itemName: item.name, keyword });
  }

  const customRules = settings.customRules.filter((item) => item.enabled).slice()
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  for (const item of customRules) {
    const keyword = matchLineKeywords(normalizedMessage, item.keywords, item.matchMode);
    if (!keyword) continue;
    const formatted = finalText(item, publicOrigin);
    return finish({ ...empty, ...formatted, category: "customRule", itemId: item.id, itemName: item.name, keyword });
  }

  if (!settings.fallback.enabled) return empty;
  const replyText = settings.fallback.text.trim();
  return finish({ ...empty, category: "fallback", replyText, text: replyText });
}
