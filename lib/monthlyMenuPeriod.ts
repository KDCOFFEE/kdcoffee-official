const ENGLISH_MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
] as const;

export function getCurrentMonthlyMenuPeriod(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const englishMonth = ENGLISH_MONTHS[month - 1];

  return {
    monthKey,
    year,
    month,
    monthNumberLabel: `${month} 月`,
    englishMonth,
    selectionLabel: `${year} ${englishMonth} SELECTION`,
  };
}

export type MonthlyMenuPeriod = ReturnType<typeof getCurrentMonthlyMenuPeriod>;

export function getMonthlyMenuPresentation(period: MonthlyMenuPeriod) {
  return {
    label: period.selectionLabel,
    issue: `${period.year} / ${String(period.month).padStart(2, "0")}`,
    title: `${period.monthNumberLabel}豆單`,
  };
}
