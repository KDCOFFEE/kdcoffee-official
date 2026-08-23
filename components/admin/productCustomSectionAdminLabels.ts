import type { ProductSectionPlacement } from "../../lib/productPageSections";
import type {
  ProductAnimationEffect,
  ProductAnimationThreshold,
  ProductAnimationTrigger,
} from "../../lib/productPageAnimations";
import type {
  ProductCustomFeatureLayout,
  ProductCustomTextLayout,
} from "../../lib/productCustomSections";

export const customSectionPlacementLabels: Record<ProductSectionPlacement, string> = {
  after_purchase: "購買規格之後",
  after_profile: "咖啡風味輪廓之後",
  after_clean_roasting: "乾淨的烘焙之後",
  before_before_you_order: "購買前提醒之前",
  page_bottom: "商品頁最下方",
};

export const customSectionLayoutLabels: Record<ProductCustomTextLayout | ProductCustomFeatureLayout, string> = {
  standard: "標準文案",
  narrow: "窄版閱讀",
  centered: "置中文案",
  grid: "網格排列",
  editorial: "編輯式排列",
};

export const customSectionLayoutDescriptions: Record<ProductCustomTextLayout | ProductCustomFeatureLayout, string> = {
  standard: "適合一般品牌故事、作品說明與商品補充內容。",
  narrow: "縮窄文字寬度，適合較長篇的閱讀內容。",
  centered: "標題與內容置中，適合簡潔的品牌宣言或重點訊息。",
  grid: "以多欄卡片呈現重點，行動版會自動改為單欄。",
  editorial: "以單欄閱讀順序呈現每一項重點。",
};

export const customSectionAnimationEffectLabels: Record<ProductAnimationEffect, string> = {
  none: "無效果",
  fade: "淡入",
  "slide-left": "由左側淡入",
  "slide-right": "由右側淡入",
  "slide-up": "由下方淡入",
  "scale-fade": "輕微縮放淡入",
};

export const customSectionAnimationTriggerLabels: Record<ProductAnimationTrigger, string> = {
  none: "不自動播放",
  "page-load": "頁面載入時",
  viewport: "捲動到此區塊時",
};

export const customSectionAnimationThresholdLabels: Record<ProductAnimationThreshold, string> = {
  entry: "剛進入畫面就播放",
  slight: "稍微進入就播放",
  quarter: "進入四分之一後播放",
  half: "進入一半後播放",
};

export function customSectionAnimationSummary(effect: ProductAnimationEffect, trigger: ProductAnimationTrigger, durationMs: number) {
  const triggerSummary = trigger === "viewport" ? "捲動觸發" : trigger === "page-load" ? "頁面載入" : "不自動播放";
  return `${customSectionAnimationEffectLabels[effect]}・${triggerSummary}・${durationMs}ms`;
}
