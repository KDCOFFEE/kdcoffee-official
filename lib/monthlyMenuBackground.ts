export const MONTHLY_MENU_BACKGROUND_POSITIONS = [
  "auto", "center", "top-left", "top-right", "bottom-left", "bottom-right",
] as const;

export const MONTHLY_MENU_BACKGROUND_FITS = ["cover", "contain"] as const;

export type MonthlyMenuBackgroundPosition = (typeof MONTHLY_MENU_BACKGROUND_POSITIONS)[number];
export type MonthlyMenuBackgroundFit = (typeof MONTHLY_MENU_BACKGROUND_FITS)[number];

export type MonthlyMenuBackground = {
  image?: string;
  opacity: number;
  position: MonthlyMenuBackgroundPosition;
  fit: MonthlyMenuBackgroundFit;
  theme: string;
  themeTitle: string;
  themeSubtitle: string;
};

export const DEFAULT_MONTHLY_MENU_BACKGROUND: MonthlyMenuBackground = {
  opacity: 0.08,
  position: "auto",
  fit: "cover",
  theme: "",
  themeTitle: "",
  themeSubtitle: "",
};

const MONTHLY_MENU_IMAGE_PATH = /^\/uploads\/artworks\/monthly-menu\/kdcoffee-monthly-menu-background-v\d+\.webp$/i;

export function isMonthlyMenuBackgroundImage(value: unknown): value is string {
  return typeof value === "string" && MONTHLY_MENU_IMAGE_PATH.test(value);
}

export function normalizeMonthlyMenuBackground(value: unknown): MonthlyMenuBackground {
  const background = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const opacity = Number(background.opacity);
  const position = MONTHLY_MENU_BACKGROUND_POSITIONS.includes(background.position as MonthlyMenuBackgroundPosition)
    ? background.position as MonthlyMenuBackgroundPosition
    : DEFAULT_MONTHLY_MENU_BACKGROUND.position;
  const fit = MONTHLY_MENU_BACKGROUND_FITS.includes(background.fit as MonthlyMenuBackgroundFit)
    ? background.fit as MonthlyMenuBackgroundFit
    : DEFAULT_MONTHLY_MENU_BACKGROUND.fit;

  return {
    image: isMonthlyMenuBackgroundImage(background.image) ? background.image : undefined,
    opacity: Number.isFinite(opacity) && opacity >= 0 && opacity <= 0.2
      ? opacity
      : DEFAULT_MONTHLY_MENU_BACKGROUND.opacity,
    position,
    fit,
    theme: typeof background.theme === "string" ? background.theme.trim().slice(0, 80) : "",
    themeTitle: typeof background.themeTitle === "string" ? background.themeTitle.trim().slice(0, 24) : "",
    themeSubtitle: typeof background.themeSubtitle === "string" ? background.themeSubtitle.trim().slice(0, 80) : "",
  };
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
  9: { title: "月下秋意", subtitle: "月色 · 團聚 · 入秋 · 夜風", keywords: "月色、團聚、入秋、夜風", visualDirection: "月光、夜色、暖金、初秋氣息" },
  10: { title: "秋日澄光", subtitle: "涼風 · 乾爽 · 澄澈 · 成熟", keywords: "涼風、乾爽、澄澈、成熟", visualDirection: "清澈天空、斜陽、金褐色調" },
  11: { title: "入冬暖意", subtitle: "東北風 · 微涼 · 溫暖 · 沉靜", keywords: "東北風、微涼、溫暖、沉靜", visualDirection: "晨霧、柔和冬光、溫暖室內外光線" },
  12: { title: "歲末微光", subtitle: "年末 · 相聚 · 回望 · 期待", keywords: "年末、相聚、回望、期待", visualDirection: "夜色、窗光、暖金、小型自然光點" },
};

export function getTaiwanMonthlyTheme(monthKey?: string) {
  const match = monthKey?.match(/^\d{4}-(0[1-9]|1[0-2])$/);
  return match ? TAIWAN_MONTHLY_THEMES[Number(match[1])] : undefined;
}

export const MONTHLY_MENU_BACKGROUND_PROMPT = `請建立一張 KD Coffee 每月精品咖啡豆單使用的「藝術背景素材」。

用途：

這張圖片不是主視覺，不是商品照，也不是廣告海報。

它會被放在咖啡豆單文字、價格、作品縮圖的最底層，因此必須非常克制、非常淡，不能影響任何文字閱讀。

整體風格：

精品咖啡品牌
藝術展覽目錄
美術館出版品
editorial catalogue
quiet luxury
極簡
成熟
安靜
有質感

背景基底：

暖象牙白
奶油米白
自然紙張色

可以具有非常淡的：

手工紙質感
畫布質感
柔和霧面紙張質感

但不能有：

明顯顆粒
髒污感
強烈紙張紋路

藝術元素：

使用抽象、極簡、低對比的藝術元素。

可以包含：

- 柔和弧線
- 大面積半透明色塊
- 淡淡筆觸
- 極細線條
- 柔和光影
- 大量留白
- 抽象幾何
- 非具象藝術構圖

構圖：

不要只把裝飾集中在右上角。

不要只有單一角落有圖案。

藝術元素應自然分散在整張畫布不同區域，例如：

左上
右上
中央邊緣
左下
右下

讓視線自然流動。

但是：

主要文字閱讀區域必須保持乾淨。

背景藝術元素不能平均塞滿整張圖片。

至少保留約 60–70% 的低干擾留白。

整體應像：

一本精品藝術展覽 catalogue 的底紙，
而不是一張完整海報。

色彩：

低飽和
低對比

主要使用：

暖米白
淺沙色
淡咖啡色
灰米色
極淡品牌棕金

可以依月份加入一種非常克制的輔助色。

但是不得：

鮮豔
高彩度
高對比

背景濃度設計：

請假設這張圖片實際放入豆單時，
可能會再降低至約 5–15% 的視覺濃度。

因此藝術元素即使被降低透明度，
仍應保有非常淡的藝術氣氛。

最重要：

背景永遠不能比商品資料更醒目。

豆單上的：

作品名稱
藝術家
風味
產地
處理法
焙度
價格
商品縮圖

永遠必須是第一視覺層級。

禁止：

- 人物
- 臉
- 手
- 咖啡杯
- 咖啡豆
- 咖啡館
- 拉花
- 產品包裝
- Logo
- 文字
- 數字
- QR Code
- 價格
- 花俏插畫
- 卡通
- CGI
- fake HDR
- 強烈陰影
- 高對比
- 高飽和
- 滿版具象圖
- 密集圖案
- 重複 pattern
- 大型中央主角
- 明顯視覺焦點
- 讓背景成為主角

畫面必須適合在上方排放：

作品名稱
風味
產地
處理法
焙度
價格
小型作品縮圖

建議尺寸：

2160 × 3000 px 以上

直式。

不要加入任何文字。
不要加入 Logo。`;

export function getMonthlyMenuBackgroundPrompt(
  theme: string,
  monthKey?: string,
  themeTitle?: string,
  themeSubtitle?: string,
) {
  const recommendation = getTaiwanMonthlyTheme(monthKey);
  const title = themeTitle?.trim().slice(0, 24) || recommendation?.title || "";
  const subtitle = themeSubtitle?.trim().slice(0, 80) || recommendation?.subtitle || "";
  const normalizedTheme = theme.trim().slice(0, 80);
  const seasonal = recommendation ? `

台灣月份季節主題：
${title}

Atmosphere:
${subtitle || recommendation.keywords}

Visual direction:
${recommendation.visualDirection}` : "";
  const custom = normalizedTheme ? `

本月額外藝術方向：
${normalizedTheme}` : "";
  return `${MONTHLY_MENU_BACKGROUND_PROMPT}${seasonal}${custom}

月份視覺請避免公式化。咖啡器具不是必要元素；優先使用光影、雨、水氣、植物、天空、月色、風、窗光、季節色溫與自然抽象形態。

請在不破壞上述低對比、留白與可讀性原則的前提下，將月份主題轉化為非常克制的背景語言。`;
}
