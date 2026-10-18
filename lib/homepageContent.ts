// @ts-expect-error -- explicit extensions support the Node regression runner.
import { HOMEPAGE_SECTION_CAPABILITIES } from "./homepagePresentation.ts";
import type { HomepagePresentationKey, HomepageTextSlot } from "./homepagePresentation.ts";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { orderedEnabledItems, resolveHome002ClosingText } from "./homepageCms.ts";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { resolveHome004Recommendations } from "./home004Recommendations.ts";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { resolveHomepageCta } from "./homepageCta.ts";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { activeHomepageCampaigns } from "./homepageCampaigns.ts";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { resolveMediaAsset } from "./media.ts";
import type { CmsLinkRegistryInput, CmsLinkValue } from "./cmsLinks.ts";
import type { HomepageData } from "../data/homepageData";

export const HOMEPAGE_CONTENT_SOURCES = {
  homepage_content: "首頁內容", product_data: "商品資料", commerce_state: "商務狀態",
  system_fixed: "系統固定文字", system_default: "系統預設", system_computed: "系統計算",
} as const;
export const HOMEPAGE_CONTENT_SLOT_LABELS: Record<HomepageTextSlot, string> = {
  eyebrow: "前導小標", title: "主標題", intro: "引言／說明文字", body: "內文", closing: "結尾文字",
  cta: "按鈕文字", cardTitle: "卡片｜標題", cardBody: "卡片｜內文", metadata: "輔助資訊",
};
export type HomepageContentSource = keyof typeof HOMEPAGE_CONTENT_SOURCES;
export type HomepageContentState = "available" | "empty" | "not_rendered";
export type HomepageContentExample = {
  role: string; text: string; source: HomepageContentSource; editableWhere: string;
  state: HomepageContentState; reason?: string;
};
export type HomepageContentDescription = {
  label: string; examples: HomepageContentExample[]; total: number; sources: HomepageContentSource[]; editableWhere: string;
  impact: string; state: HomepageContentState; reason?: string;
};
export type HomepageContentProduct = {
  slug: string; name: string; subtitle?: string; shortCopy?: string;
  active?: boolean; status?: string; purchasable?: boolean; inMonthlyMenu?: boolean;
};
export type HomepageContentInput = Partial<Record<HomepagePresentationKey, unknown>> & { campaigns?: unknown };
type Item = Record<string, unknown> & { enabled?: boolean; order?: number };

/** Only the two additional public copy fields needed by the existing Admin summary. */
export function homepageProductCopy(product: Record<string, unknown>) {
  return {
    subtitle: typeof product.subtitle === "string" ? product.subtitle : "",
    shortCopy: typeof product.shortCopy === "string" ? product.shortCopy : "",
  };
}

const record = (value: unknown): Item => value && typeof value === "object" && !Array.isArray(value) ? value as Item : {};
const text = (value: unknown) => typeof value === "string" ? value : "";
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const ordered = (value: unknown) => orderedEnabledItems<Item>(value);
const homeLocation = "首頁內容中對應的文字欄位";
const sharedImpact = "此設定套用此區塊所有對應項目，只修改首頁呈現方式。";
function example(value: unknown, role = "", source: HomepageContentSource = "homepage_content", editableWhere = homeLocation): HomepageContentExample {
  const valueText = text(value);
  return { role, text: valueText, source, editableWhere, state: valueText.trim() ? "available" : "empty", ...(valueText.trim() ? {} : { reason: "目前沒有內容" }) };
}
function cta(owner: Item, labelField: string, hrefField: string, enabledField: string, role: string, registry: CmsLinkRegistryInput, legacyLabel?: string) {
  const label = owner[labelField] === undefined ? legacyLabel : owner[labelField];
  const result = example(label, role, owner[labelField] === undefined && legacyLabel !== undefined ? "system_default" : "homepage_content");
  if (resolveHomepageCta({ label: owner[labelField], href: owner[hrefField] as CmsLinkValue, enabled: owner[enabledField] as boolean | undefined, legacyLabel }, registry)) return result;
  const reason = owner[enabledField] === false ? "目前按鈕已停用，因此 CTA 未呈現。"
    : !text(label).trim() ? "目前沒有按鈕文字，因此 CTA 未呈現。"
    : "目前沒有有效連結，因此 CTA 未呈現。";
  return { ...result, state: "not_rendered" as const, reason };
}

/** Read-only content eligibility, not CSS visibility or computed appearance.
 * Uses the current draft as supplied; never normalizes, saves, or creates nodes.
 */
export function describeHomepageContent(
  homepage: HomepageContentInput, sectionKey: HomepagePresentationKey,
  products: HomepageContentProduct[] = [], pages: CmsLinkRegistryInput["pages"] = [], now = new Date(),
): Partial<Record<HomepageTextSlot, HomepageContentDescription>> {
  const owner = record(homepage[sectionKey]);
  const cards = ordered(owner.cards), steps = ordered(owner.steps);
  const selected = sectionKey === "home004" ? resolveHome004Recommendations(owner.productSlugs, products).recommendations : [];
  const campaigns = sectionKey === "campaignSection"
    ? activeHomepageCampaigns({ campaigns: list(homepage.campaigns), campaignSection: owner } as unknown as HomepageData, now) : [];
  const reviews = list(owner.items).map(record).filter(item => text(item.text).trim() && text(item.name).trim() && text(item.source).trim());
  const studio = ordered(Array.isArray(owner.mediaItems) ? owner.mediaItems : owner.images);
  const hasStudioMedia = studio.some(item => {
    const nested = Array.isArray(item.mediaItems) && item.mediaItems.length ? item.mediaItems : [item];
    return nested.some(raw => { const media = record(raw); return media.enabled !== false && Boolean(resolveMediaAsset(media.media, text(media.image))); });
  });
  let sectionReason = owner.enabled === false ? "此區塊的啟用開關已關閉，因此區塊未呈現。" : undefined;
  if (!sectionReason) {
    if (["home002", "home003", "home007"].includes(sectionKey) && !cards.length) sectionReason = "目前沒有啟用的卡片，因此此區塊未呈現。";
    if (sectionKey === "home004" && !selected.length) sectionReason = "目前沒有符合推薦資格的商品，因此此區塊未呈現。";
    if (sectionKey === "home005" && !steps.length) sectionReason = "目前沒有啟用的步驟，因此此區塊未呈現。";
    if (sectionKey === "home008" && !hasStudioMedia) sectionReason = "目前沒有可呈現的媒體，因此此區塊未呈現。";
    if (sectionKey === "home009" && !reviews.length) sectionReason = "目前沒有有效評價，因此整個區塊未呈現。";
    if (sectionKey === "campaignSection" && !campaigns.length) sectionReason = "目前沒有符合啟用、日期與首頁顯示條件的活動，因此此區塊未呈現。";
  }
  const registry = { products, pages };
  const out: Partial<Record<HomepageTextSlot, HomepageContentDescription>> = {};
  for (const slot of HOMEPAGE_SECTION_CAPABILITIES[sectionKey]) {
    let label = HOMEPAGE_CONTENT_SLOT_LABELS[slot];
    let impact = ["cardTitle", "cardBody", "metadata", "cta"].includes(slot) ? sharedImpact : "此設定只修改這段文字在首頁的呈現方式。";
    let examples: HomepageContentExample[] = [];
    let reason: string | undefined;
    const single = (value: unknown) => [example(value)];
    const cardField = (field: string) => cards.map((item, i) => example(item[field], `卡片 ${i + 1}`));
    if (slot === "title") examples = single(owner.title);
    if (slot === "intro") examples = single(owner.intro);
    if (slot === "body") examples = single(owner.text);
    if (slot === "eyebrow") examples = single(owner.eyebrow);

    switch (sectionKey) {
      case "hero":
        if (slot === "title") examples = single(list(owner.titleLines).map(text).join("\n"));
        if (slot === "intro") examples = single(owner.lead);
        if (slot === "cta") examples = [
          cta(owner, "buttonLabel", "buttonHref", "primaryCtaEnabled", "主要按鈕", registry, "開始挑咖啡"),
          cta(owner, "secondaryLabel", "secondaryHref", "secondaryCtaEnabled", "次要按鈕", registry, "本月作品"),
        ];
        if (slot === "metadata") {
          const fallback = !owner.trustCues;
          examples = list(fallback ? ["不用登入即可購買", "7-ELEVEN 取貨付款", "工作室自取"] : owner.trustCues)
            .map(value => example(value, "信任資訊", fallback ? "system_default" : "homepage_content", "目前首頁後台未提供此內容欄位"));
        }
        if (slot === "cta") impact = "此設定同時影響 Hero 主要與次要按鈕的文字外觀，不修改按鈕文案或連結。";
        break;
      case "campaignSection":
        if (slot === "eyebrow") {
          examples = [example(owner.eyebrow, "活動區標籤"), ...campaigns.map(item => example(item.eyebrow, "活動卡標籤"))];
          impact = "此設定同時影響活動區標籤及所有活動卡對應標籤。";
        }
        if (slot === "cardTitle") { label = "活動卡｜活動名稱"; examples = campaigns.map(item => example(item.title, "活動卡")); }
        if (slot === "cardBody") { label = "活動卡｜內容"; examples = campaigns.map(item => example(item.description, item.title)); }
        if (slot === "body") examples = campaigns.flatMap(item => list(item.details).map(value => example(value, `${item.title}｜細節`)));
        if (slot === "metadata") {
          examples = campaigns.flatMap((item, i) => [
            example(String(i + 1).padStart(2, "0"), "活動序號", "system_computed", "由目前活動順序產生"),
            ...(item.note ? [example(item.note, "活動註記")] : []),
          ]);
          impact = "此設定同時影響活動序號與活動註記；序號由系統產生。";
        }
        if (slot === "cta") examples = campaigns.flatMap(item => [
          cta(item as unknown as Item, "ctaLabel", "ctaHref", "ctaEnabled", `${item.title}｜主要按鈕`, registry),
          cta(item as unknown as Item, "secondaryLabel", "secondaryHref", "secondaryCtaEnabled", `${item.title}｜次要按鈕`, registry),
        ]);
        break;
      case "home002":
        if (slot === "cardTitle") examples = cardField("title");
        if (slot === "cardBody") examples = cardField("text");
        if (slot === "closing") {
          const closing = resolveHome002ClosingText({ closingText: owner.closingText as string | undefined, closingEnabled: owner.closingEnabled as boolean | undefined });
          examples = [example(closing === null ? owner.closingText : closing, "", owner.closingText == null ? "system_default" : "homepage_content", "首頁內容 → HOME002 → 結尾文字")];
          if (closing === null) reason = "結尾文字已停用，因此此文字未呈現。";
        }
        if (slot === "metadata") examples = cards.map((_, i) => example(String(i + 1).padStart(2, "0"), "卡片序號", "system_computed", "由目前卡片順序產生"));
        break;
      case "home003":
        if (slot === "eyebrow") examples = cardField("eyebrow");
        if (slot === "cardTitle") { label = "情境卡｜標題"; examples = cardField("title"); }
        if (slot === "cardBody") { label = "情境卡｜內文"; examples = cardField("text"); }
        if (slot === "cta") examples = cards.map((item, i) => cta(item, "button", "href", "ctaEnabled", `情境卡 ${i + 1}｜${text(item.title)}`, registry, "開始"));
        break;
      case "home004":
        if (slot === "cardTitle") {
          label = "作品卡｜作品名稱"; examples = selected.map(item => example(item.name, "", "product_data", "商品管理 → 中文作品名稱"));
          impact = "此設定只修改首頁推薦作品名稱的呈現方式，不會修改商品名稱。此設定套用首頁所有推薦作品卡。";
        }
        if (slot === "cardBody") {
          label = "作品卡｜商品短文案"; examples = selected.map(item => example(item.shortCopy || item.subtitle, item.name, "product_data", "商品管理 → 簡短文案；未填時使用 subtitle"));
          impact = "此設定只修改首頁短文案的呈現方式；文字內容來自商品管理。此設定套用首頁所有推薦作品卡。";
        }
        if (slot === "cta") {
          label = "作品卡｜查看作品連結"; examples = selected.map(item => example("查看作品與規格 →", item.name, "system_fixed", "目前沒有文案編輯欄位"));
          impact = "目前此文字由系統固定產生；本階段僅顯示來源，不在此修改。下方設定只調整所有推薦作品卡連結的外觀。";
        }
        break;
      case "home005":
        if (slot === "cardTitle" || slot === "cardBody") examples = steps.map((item, i) => example(item[slot === "cardTitle" ? "title" : "text"], `步驟 ${i + 1}`));
        if (slot === "metadata") examples = [
          ...(steps.length ? [example(`01 / ${String(steps.length).padStart(2, "0")}`, "旅程進度", "system_computed", "由目前步驟數量產生")] : []),
          ...steps.map((_, i) => example(String(i + 1).padStart(2, "0"), "步驟序號", "system_computed", "由目前步驟順序產生")),
        ];
        break;
      case "home006":
        if (slot === "metadata") examples = list(owner.points).map(value => example(value, "服務重點"));
        if (slot === "cta") examples = [cta(owner, "button", "href", "ctaEnabled", "", registry, "查看適用作品")];
        break;
      case "home007":
        if (slot === "cardTitle") examples = cardField("title");
        if (slot === "cardBody") examples = cardField("text");
        break;
      case "home008": break; // Captions and media titles are not text Presentation slots.
      case "home009":
        if (slot === "cardBody") examples = reviews.map(item => example(`「${text(item.text)}」`, "評價內文"));
        if (slot === "metadata") examples = reviews.flatMap(item => [example(item.name, "評價者"), example(item.source, "評價來源")]);
        break;
      case "home010":
        if (slot === "cta") examples = [cta(owner, "button", "href", "ctaEnabled", "", registry, "開始挑咖啡")];
        break;
    }
    reason = sectionReason || reason;
    if (reason) examples = examples.map(item => ({ ...item, state: "not_rendered", reason: item.reason ? `${reason} ${item.reason}` : reason }));
    const state = reason ? "not_rendered" : examples.some(item => item.state === "available") ? "available"
      : examples.some(item => item.state === "not_rendered") ? "not_rendered" : "empty";
    const fallbackSource: HomepageContentSource = sectionKey === "home004" && (slot === "cardTitle" || slot === "cardBody") ? "product_data" : sectionKey === "home004" && slot === "cta" ? "system_fixed" : ["home002", "home005"].includes(sectionKey) && slot === "metadata" ? "system_computed" : "homepage_content";
    const sources = examples.length ? [...new Set(examples.map(item => item.source))] : [fallbackSource];
    const editableWhere = examples[0]?.editableWhere ?? (fallbackSource === "product_data" ? "商品管理" : fallbackSource === "system_fixed" ? "目前沒有文案編輯欄位" : fallbackSource === "system_computed" ? "由系統產生" : homeLocation);
    out[slot] = { label, examples, total: examples.length, sources, editableWhere, impact, state, reason: reason || (state === "empty" ? "目前沒有內容" : undefined) };
  }
  return out;
}
