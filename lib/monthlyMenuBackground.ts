import { getCurrentMonthlyMenuPeriod } from "./monthlyMenuPeriod";

export const MONTHLY_MENU_BACKGROUND_POSITIONS = [
  "auto", "center", "top-left", "top-right", "bottom-left", "bottom-right",
] as const;

export const MONTHLY_MENU_BACKGROUND_FITS = ["cover", "contain"] as const;

export type MonthlyMenuBackgroundPosition = (typeof MONTHLY_MENU_BACKGROUND_POSITIONS)[number];
export type MonthlyMenuBackgroundFit = (typeof MONTHLY_MENU_BACKGROUND_FITS)[number];

export type MonthlyMenuBackground = {
  image?: string;
  artworkMonthKey?: string;
  opacity: number;
  position: MonthlyMenuBackgroundPosition;
  fit: MonthlyMenuBackgroundFit;
};

export const DEFAULT_MONTHLY_MENU_BACKGROUND: MonthlyMenuBackground = {
  opacity: 1,
  position: "auto",
  fit: "cover",
};

const MONTHLY_MENU_IMAGE_PATH = /^\/uploads\/artworks\/monthly-menu\/kdcoffee-monthly-menu-background-v\d+\.webp$/i;

export function isMonthlyMenuBackgroundImage(value: unknown): value is string {
  return typeof value === "string" && MONTHLY_MENU_IMAGE_PATH.test(value);
}

export function normalizeMonthlyMenuBackground(value: unknown): MonthlyMenuBackground {
  const background = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const position = MONTHLY_MENU_BACKGROUND_POSITIONS.includes(background.position as MonthlyMenuBackgroundPosition)
    ? background.position as MonthlyMenuBackgroundPosition
    : DEFAULT_MONTHLY_MENU_BACKGROUND.position;
  const fit = MONTHLY_MENU_BACKGROUND_FITS.includes(background.fit as MonthlyMenuBackgroundFit)
    ? background.fit as MonthlyMenuBackgroundFit
    : DEFAULT_MONTHLY_MENU_BACKGROUND.fit;

  return {
    image: isMonthlyMenuBackgroundImage(background.image) ? background.image : undefined,
    artworkMonthKey: isMonthlyMenuBackgroundImage(background.image) && typeof background.artworkMonthKey === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(background.artworkMonthKey)
      ? background.artworkMonthKey
      : undefined,
    // R6 stored a faint full-sheet background. R6.1 makes this a header
    // artwork, so preserve the artwork contrast even for existing records.
    opacity: DEFAULT_MONTHLY_MENU_BACKGROUND.opacity,
    position,
    fit,
  };
}

export function getArtworkMonthForSave(previous: MonthlyMenuBackground, image: string, currentMonthKey: string) {
  if (!image) return undefined;
  return image === previous.image ? previous.artworkMonthKey : currentMonthKey;
}

export function isArtworkFromAnotherMonth(background: MonthlyMenuBackground, currentMonthKey: string) {
  return Boolean(background.image && background.artworkMonthKey && background.artworkMonthKey !== currentMonthKey);
}

export type TaiwanMonthlyTheme = {
  title: string;
  subtitle: string;
  keywords: string;
  visualDirection: string;
};

export const TAIWAN_MONTHLY_THEMES: Record<number, TaiwanMonthlyTheme> = {
  1: { title: "歲初暖光", subtitle: "冬陽 · 沉靜 · 新的開始", keywords: "新年、冬陽、沉靜、開始", visualDirection: "冬日上午暖光、米白、淡金" },
  2: { title: "春信初來", subtitle: "初春 · 微風 · 新芽 · 柔光", keywords: "初春、微風、新芽、柔光", visualDirection: "淡霧、嫩芽、柔和晨光" },
  3: { title: "春日花信", subtitle: "春雨 · 花季 · 清新 · 甦醒", keywords: "花季、春雨、清新、甦醒", visualDirection: "春雨、水氣、少量自然花瓣、淡粉米色" },
  4: { title: "清明新綠", subtitle: "新綠 · 雨後 · 清透 · 土地", keywords: "新綠、雨後、清透、土地", visualDirection: "雨後葉影、薄霧、淺綠" },
  5: { title: "初夏微風", subtitle: "初夏 · 日光 · 綠意 · 輕盈", keywords: "初夏、日光、綠意、輕盈", visualDirection: "窗光、樹影、風吹薄簾" },
  6: { title: "雨季拾光", subtitle: "梅雨 · 雨聲 · 水氣 · 安靜", keywords: "梅雨、雨聲、水氣、安靜", visualDirection: "玻璃雨痕、水面、灰藍暖光" },
  7: { title: "盛夏光景", subtitle: "盛夏 · 烈日 · 午後 · 明亮", keywords: "盛夏、烈日、午後、明亮", visualDirection: "夏季日光、自然陰影、天空、夏風" },
  8: { title: "夏末午後", subtitle: "暖金 · 微風 · 柔和日光", keywords: "暖金、微風、柔和日光、夏末", visualDirection: "金色午後、柔光、夏末空氣" },
  9: { title: "初秋微光", subtitle: "初秋 · 微涼晨風 · 柔和日光", keywords: "初秋、微涼晨風、柔和日光、夏末轉秋", visualDirection: "暖米色紙感、金色柔光、初秋空氣、安靜而細緻的季節轉換" },
  10: { title: "秋日澄光", subtitle: "涼風 · 乾爽 · 澄澈 · 成熟", keywords: "涼風、乾爽、澄澈、成熟", visualDirection: "清澈天空、斜陽、金褐色調" },
  11: { title: "入冬暖意", subtitle: "東北風 · 微涼 · 溫暖 · 沉靜", keywords: "東北風、微涼、溫暖、沉靜", visualDirection: "晨霧、柔和冬光、溫暖室內外光線" },
  12: { title: "歲末微光", subtitle: "年末 · 相聚 · 回望 · 期待", keywords: "年末、相聚、回望、期待", visualDirection: "夜色、窗光、暖金、小型自然光點" },
};

export function getTaiwanMonthlyTheme(monthKey = getCurrentMonthlyMenuPeriod().monthKey) {
  const match = monthKey?.match(/^\d{4}-(0[1-9]|1[0-2])$/);
  return match ? TAIWAN_MONTHLY_THEMES[Number(match[1])] : undefined;
}

export function getMonthlyMenuBackgroundPrompt(monthKey = getCurrentMonthlyMenuPeriod().monthKey) {
  const recommendation = getTaiwanMonthlyTheme(monthKey);
  const month = monthKey;
  const seasonalContext = recommendation
    ? `Taiwan seasonal context: ${recommendation.keywords}\nThe ONLY text allowed inside the artwork is this exact seasonal theme title: ${recommendation.title}\nVisual direction: ${recommendation.visualDirection}`
    : "Taiwan seasonal context: choose an appropriate restrained seasonal theme. The only artwork text may be a concise Traditional Chinese seasonal title.";

  return `Create ONE integrated editorial monthly theme artwork for KD Coffee Monthly Selection.

Current operational month for seasonal mood only: ${month} (Asia/Taipei).
${seasonalContext}

The artwork will be placed inside the header area of an A4 specialty coffee monthly menu. Render only the seasonal theme title in the image. Do NOT render any month, year, date, YYYY-MM, English month name, Chinese month number, or selection label. The website and print layout supply all month and year typography outside the artwork.

Create a refined specialty-coffee editorial atmosphere with warm ivory paper tones, restrained seasonal colour, soft natural light, and quiet luxury. The visual should fade naturally into a warm ivory editorial paper background. Main visual weight belongs in the center-right area. Keep the left 25–30% visually quiet and low contrast for the existing month typography. Keep at least 10% safe area at top and bottom. Place the theme title around the right-side 60–85% horizontal area, never flush to the edge.

Canvas: 1600 × 700 px. Landscape. Approx. 16:7.

Do not create a separate poster, card, frame, banner, advertisement, border, mockup, UI, or website screenshot. No KD logo. No product name. No product photography. No coffee bag. No pricing. No QR code.`;
}
