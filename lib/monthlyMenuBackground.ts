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
};

export const DEFAULT_MONTHLY_MENU_BACKGROUND: MonthlyMenuBackground = {
  opacity: 0.08,
  position: "auto",
  fit: "cover",
  theme: "",
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
  };
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

export function getMonthlyMenuBackgroundPrompt(theme: string) {
  const normalizedTheme = theme.trim().slice(0, 80);
  if (!normalizedTheme) return MONTHLY_MENU_BACKGROUND_PROMPT;
  return `${MONTHLY_MENU_BACKGROUND_PROMPT}

本月藝術主題：
${normalizedTheme}

請在不破壞上述低對比、留白與可讀性原則的前提下，
將這個主題轉化為非常克制的抽象背景語言。`;
}
