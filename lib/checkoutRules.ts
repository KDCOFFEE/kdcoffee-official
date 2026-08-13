export const CUSTOM_ROAST_MIN_QUANTITY = 4;
export const TAIPEI_TIME_ZONE = "Asia/Taipei";

export const ALLOWED_ROAST_LEVELS = [
  "淺焙",
  "淺中焙",
  "中焙",
  "中深焙",
] as const;

export const ALLOWED_BEAN_PREPARATIONS = [
  "咖啡豆",
  "咖啡粉",
] as const;

export const PICKUP_TIMES = [
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
  "18:30",
  "19:00",
  "19:30",
  "20:00",
] as const;

type SkuDescriptor = {
  kind?: unknown;
  label?: unknown;
  detail?: unknown;
  optionLabel?: unknown;
  optionDetail?: unknown;
};

export type SkuQuantityLine = SkuDescriptor & {
  slug?: unknown;
  optionId?: unknown;
  quantity?: unknown;
};

type ParsedDateOnly = {
  year: number;
  month: number;
  day: number;
};

function descriptorText(value: SkuDescriptor) {
  return [
    value.label,
    value.detail,
    value.optionLabel,
    value.optionDetail,
    value.kind,
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

export function isDripSku(value: SkuDescriptor) {
  return value.kind === "drip" || /耳掛|drip/i.test(descriptorText(value));
}

export function isCustomRoastSku(value: SkuDescriptor) {
  if (isDripSku(value)) return false;
  if (value.kind === "beans") return true;
  return /半磅|咖啡豆|咖啡粉|227g|beans|ground/i.test(
    descriptorText(value),
  );
}

export function skuIdentity(value: SkuQuantityLine) {
  const slug = String(value.slug ?? "").trim();
  const optionId = String(value.optionId ?? "").trim();
  if (slug && optionId) return `${slug}::id:${optionId}`;

  const optionLabel = String(
    value.optionLabel ?? value.label ?? "",
  ).trim();
  return slug && optionLabel
    ? `${slug}::label:${optionLabel}`
    : "";
}

export function aggregateSkuQuantities(
  lines: readonly SkuQuantityLine[],
) {
  const quantities = new Map<string, number>();
  for (const line of lines) {
    const identity = skuIdentity(line);
    const quantity = Number(line.quantity);
    if (!identity || !Number.isInteger(quantity) || quantity < 1) continue;
    quantities.set(identity, (quantities.get(identity) ?? 0) + quantity);
  }
  return quantities;
}

export function getSkuAggregateQuantity(
  lines: readonly SkuQuantityLine[],
  target: SkuQuantityLine,
) {
  const identity = skuIdentity(target);
  return identity
    ? aggregateSkuQuantities(lines).get(identity) ?? 0
    : 0;
}

export function isCustomRoastLineEligible(
  lines: readonly SkuQuantityLine[],
  target: SkuQuantityLine,
) {
  return (
    isCustomRoastSku(target) &&
    getSkuAggregateQuantity(lines, target) >= CUSTOM_ROAST_MIN_QUANTITY
  );
}

export function resolvePreparationLabel(
  sku: SkuDescriptor,
  value: unknown,
) {
  if (value === undefined || value === null || value === "") {
    return { valid: true as const, label: "" };
  }
  if (typeof value !== "string") {
    return { valid: false as const, label: "" };
  }

  const label = value.trim();
  if (!label) return { valid: true as const, label: "" };
  if (label.length > 30) return { valid: false as const, label: "" };

  if (!isCustomRoastSku(sku)) {
    return { valid: false as const, label: "" };
  }

  return (ALLOWED_BEAN_PREPARATIONS as readonly string[]).includes(label)
    ? { valid: true as const, label }
    : { valid: false as const, label: "" };
}

export function isAllowedRoastLevel(value: unknown) {
  return (
    typeof value === "string" &&
    (ALLOWED_ROAST_LEVELS as readonly string[]).includes(value.trim())
  );
}

export function parseDateOnly(value: unknown): ParsedDateOnly | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  if (day > daysInMonth[month - 1]) return null;

  const parsed = { year, month, day };
  return formatDateOnly(parsed) === value ? parsed : null;
}

export function isValidDateOnly(value: unknown) {
  return parseDateOnly(value) !== null;
}

function formatDateOnly({ year, month, day }: ParsedDateOnly) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addDateOnlyDays(value: string, days: number) {
  const parsed = parseDateOnly(value);
  if (!parsed || !Number.isInteger(days)) {
    throw new Error("日期格式不正確");
  }

  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(parsed.year, parsed.month - 1, parsed.day + days);
  return formatDateOnly({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function getDateOnlyInTimeZone(
  date: Date,
  timeZone = TAIPEI_TIME_ZONE,
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function isDateOnlyOnOrAfter(value: string, earliest: string) {
  return isValidDateOnly(value) && isValidDateOnly(earliest) && value >= earliest;
}
