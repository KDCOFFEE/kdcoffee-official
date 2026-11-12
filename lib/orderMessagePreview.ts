import type {OrderMessage} from './orderConversation';

export const ORDER_MESSAGE_PREVIEW_LIMIT = 80;

/** Conservative best-effort preview, not a general PII detector. Call only on a saved
 * OrderMessage.message. Risky topics/markup/links are omitted, not sent to a model or log. */
export function createOrderMessagePreview(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 4000) return;
  let text = value.normalize('NFKC').replace(/[\r\n\t\u2028\u2029]+/gu, ' ')
    .replace(/\p{Cc}/gu, '').replace(/(?!\u200D)\p{Cf}/gu, '').replace(/\s+/gu, ' ').trim();
  if (!text || Array.from(text).some(c => c.length === 1 && /[\uD800-\uDFFF]/u.test(c))) return;
  if (/[<>{}]|&(?:[a-z]+|#\d+|#x[0-9a-f]+);/iu.test(text)) return;
  // Omit contextual secrets/addresses rather than guessing which words are safe.
  if (/密碼|驗證碼|身分|身份|證號|證件|護照|住址|地址|戶籍|姓名|收件人|銀行|帳號|帳戶|戶名|信用卡|卡號|安全碼|生日|出生|病歷|診斷|password|\b(?:otp|token|secret|cvv|cvc|iban|ssn)\b|api[ _-]?key/iu.test(text)) return;
  if (/[\p{Script=Han}]{1,8}(?:市|縣)[\p{Script=Han}]{1,8}(?:區|鄉|鎮)|[\p{Script=Han}]{1,12}(?:路|街|巷|弄)[\p{L}\p{N}之 -]{0,18}(?:號|樓)/u.test(text)) return;
  const email = /[^\s@]+@[^\s@]+/gu;
  // Over-mask numeric runs (including short codes) instead of guessing their purpose.
  const digits = /\+?\d(?:[\s()+\-./]*\d){3,}/gu;
  const identity = /\b[A-Z](?:[12]|[A-D89])\d{8}\b/giu;
  const alphaNumericId = /\b(?=[a-z0-9]*[a-z])(?=[a-z0-9]*\d)[a-z0-9]{7,}\b/giu;
  // Preserve emoji ZWJ sequences, but do not let a joiner hide contact/ID patterns.
  const skeleton = text.replace(/\u200D/gu, '');
  if (skeleton !== text && [email,digits,identity,alphaNumericId].some(pattern => new RegExp(pattern.source, pattern.flags).test(skeleton))) return;
  text = text.replace(email, '〔已遮罩〕').replace(identity, '〔已遮罩〕')
    .replace(alphaNumericId, '〔已遮罩〕').replace(digits, '〔已遮罩〕');
  if (/@/u.test(text)) return; // Incomplete/obfuscated contact strings are not guessed safe.
  if (/(?:https?|ftp):|www\.|(?:javascript|data|file|mailto|tel|line):|(?:[a-z0-9-]+\.)+(?:[a-z]{2,})(?:\b|\/)/iu.test(text)) return;
  if (/\b[a-zA-Z0-9_-]{24,}\b/u.test(text)) return;
  // A preview consisting only of redactions/punctuation provides no useful context.
  if (!/[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(text.replaceAll('〔已遮罩〕',''))) return;
  const points = Array.from(text);
  return points.length > ORDER_MESSAGE_PREVIEW_LIMIT
    ? points.slice(0,ORDER_MESSAGE_PREVIEW_LIMIT-1).join('')+'…' : text;
}

/** The caller supplies the exact append result after persistence, never request body/latest. */
export function orderConversationCardData(orderNumber: string, savedMessage?: Pick<OrderMessage,'message'>): Record<string,string> {
  const data: Record<string,string> = {orderNumber};
  const preview = createOrderMessagePreview(savedMessage?.message);
  if (preview) data.messagePreview = preview;
  return data;
}
