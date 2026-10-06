export type SevenElevenEmailSummary = {
  recipient?: string;
  store?: string;
  market?: string;
  payment?: string;
  total?: number;
  shipping?: number;
  note?: string;
  pickupDeadline?: string;
  items?: Array<{ name: string; quantity: number }>;
};

export function emailVisibleText(html: string) {
  return html.slice(0, 100_000)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?\s*>|<\/p>|<\/div>|<\/tr>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "\t")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) => {
      const n = code.toLowerCase().startsWith("x") ? parseInt(code.slice(1),16) : Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    });
}

function oneLine(value: string, limit = 180) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function money(value: string) {
  const match = value.trim().match(/^(?:NT\s*\$|\$)?\s*(\d[\d,]*)(?:\.00)?\s*(?:元)?$/i);
  const amount = match ? Number(match[1].replaceAll(",", "")) : NaN;
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : undefined;
}

export function parseSevenElevenEmailSummary(body: string): SevenElevenEmailSummary {
  const html = body.slice(0, 100_000);
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row =>
    [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => emailVisibleText(cell[1]).trim()));
  const visible = emailVisibleText(html);
  const field = (labels: string[]) => {
    const row = rows.find(cells => cells.length >= 2 && labels.includes(oneLine(cells[0]).replace(/[：:]$/, "")));
    if (row) return row[1];
    for (const label of labels) {
      const match = visible.match(new RegExp(`(?:^|\\n)\\s*${label}[：:]\\s*([^\\n]+)`));
      if (match) return match[1].trim();
    }
    return "";
  };
  const recipientInfo = field(["收件者資訊", "收件人資訊"]);
  const recipientLines = recipientInfo.split(/\n/).map(line => line.trim()).filter(Boolean);
  const store = recipientLines.slice(1).join(" ").replace(/\s+09[\d*＊-]{7,}\s*$/, "");
  const summary: SevenElevenEmailSummary = {};
  const recipient = recipientLines[0] || field(["收件人", "收件者"]);
  if (recipient) summary.recipient = oneLine(recipient, 60);
  const storeValue = store || field(["取貨門市", "取件門市"]);
  if (storeValue) summary.store = oneLine(storeValue);
  for (const [key, value] of [["market",field(["賣場名稱"])],["payment",field(["付款方式"])],["pickupDeadline",field(["取貨期限","取件期限"])]] as const) {
    if (value) summary[key] = oneLine(value);
  }
  const total = money(field(["訂單總額", "訂單金額"]));
  const shipping = money(field(["運費"]));
  if (total !== undefined) summary.total = total;
  if (shipping !== undefined) summary.shipping = shipping;
  const headerIndex = rows.findIndex(cells => cells.length === 4 && oneLine(cells[0]) === "商品名稱" && oneLine(cells[2]) === "數量");
  if (headerIndex >= 0) {
    const items: NonNullable<SevenElevenEmailSummary["items"]> = [];
    for (const cells of rows.slice(headerIndex + 1)) {
      if (cells.length !== 4 || !/^\d+$/.test(cells[2].trim()) || money(cells[1]) === undefined || money(cells[3]) === undefined) break;
      const quantity = Number(cells[2].trim());
      if (quantity > 0 && Number.isSafeInteger(quantity) && items.length < 20) items.push({name:oneLine(cells[0]),quantity});
    }
    if (items.length) summary.items = items;
  }
  const note = visible.match(/訂單備註[：:]([^]*?)(?:\n\s*\n|$)/)?.[1]?.trim();
  if (note) summary.note = oneLine(note, 200);
  return summary;
}

export function validSevenElevenShipmentId(value: string | undefined): value is string {
  return Boolean(value && /^E[A-Z0-9]{7,20}$/i.test(value) && /\d/.test(value));
}

export function extractSevenElevenShipmentId(body: string) {
  // Require a labeled visible field; URL domains and help text are not shipment IDs.
  const match = emailVisibleText(body).match(/(?:交貨便(?:單號|編號|代碼)|配送單號|寄件(?:單號|編號)|物流單號)[：:\s]*\b(E[A-Z0-9]{7,20})\b/i)?.[1]?.toUpperCase();
  return validSevenElevenShipmentId(match) ? match : undefined;
}
