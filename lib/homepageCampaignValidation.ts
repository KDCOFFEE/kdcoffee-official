type CampaignDateRecord = {
  id?: unknown;
  title?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  placements?: unknown;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateHomepageCampaignDates(campaigns: unknown) {
  if (!Array.isArray(campaigns)) return "活動資料格式不完整。";

  for (const [index, campaign] of campaigns.entries()) {
    const item = (campaign && typeof campaign === "object" ? campaign : {}) as CampaignDateRecord;
    const label = typeof item.title === "string" && item.title.trim() ? `「${item.title.trim()}」` : `第 ${index + 1} 筆活動`;
    const startDate = typeof item.startDate === "string" ? item.startDate.trim() : "";
    const endDate = typeof item.endDate === "string" ? item.endDate.trim() : "";

    if (startDate && !isValidDate(startDate)) return `${label}的開始日期必須是有效的 YYYY-MM-DD。`;
    if (endDate && !isValidDate(endDate)) return `${label}的結束日期必須是有效的 YYYY-MM-DD。`;
    if (startDate && endDate && startDate > endDate) return `${label}的開始日期不可晚於結束日期。`;
  }

  return null;
}

const CAMPAIGN_PLACEMENTS = new Set(["frontend_campaign_section", "product_pages"]);

export function validateHomepageCampaigns(campaigns: unknown) {
  const dateError = validateHomepageCampaignDates(campaigns);
  if (dateError) return dateError;
  if (!Array.isArray(campaigns)) return "活動資料格式不完整。";

  const ids = new Set<string>();

  for (const [index, campaign] of campaigns.entries()) {
    const item = (campaign && typeof campaign === "object" ? campaign : {}) as CampaignDateRecord;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id) return `第 ${index + 1} 筆活動缺少穩定 ID。`;
    if (ids.has(id)) return `活動 ID「${id}」重複。`;
    ids.add(id);

    if (
      item.placements !== undefined &&
      (!Array.isArray(item.placements) || item.placements.some((placement) => typeof placement !== "string" || !CAMPAIGN_PLACEMENTS.has(placement)))
    ) {
      return `活動「${id}」的顯示位置格式不正確。`;
    }
  }

  return null;
}
