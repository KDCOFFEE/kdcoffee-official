import { isLocalAssetImagePath } from "./media";
import { DEFAULT_SERVICE_HERO, SERVICE_HERO_POSITIONS, type ServiceHero } from "./customerServiceHero";
/** Presentation schema only. Policy answers are resolved from existing sources on the server. */
export const SERVICE_CATEGORIES = [
  { id: "orders", label: "訂單與付款" },
  { id: "delivery", label: "配送與取貨" },
  { id: "cancellation", label: "取消與退貨" },
  { id: "account", label: "會員帳號" },
  { id: "kd", label: "KD 點數／抵用金" },
  { id: "subscription", label: "定期配送" },
  { id: "coffee", label: "Coffee" },
  { id: "store", label: "Store" },
  { id: "gifts", label: "Gifts" },
  { id: "other", label: "其他問題" },
] as const;
export type ServiceCategory = typeof SERVICE_CATEGORIES[number]["id"];
export const SERVICE_SOURCES = {
  editorial: "一般服務說明（純文字）",
  orders: "既有訂單／付款入口",
  delivery: "正式配送流程說明",
  cancellation: "既有訂單取消入口",
  returns: "既有訂單詢問／客服協助",
  kd: "會員中心回饋安全等待說明",
  credit: "會員中心抵用金說明",
  subscription: "既有定期配送入口",
  coffee: "正式咖啡作品／客製烘焙入口",
} as const;
export type ServiceSource = keyof typeof SERVICE_SOURCES;
export type ServiceFaq = {
  id: string; category: ServiceCategory; question: string; answer: string;
  keywords: string[]; enabled: boolean; sortOrder: number; source: ServiceSource;
  ctaLabel: string; ctaHref: string;
};
export type ServiceCard = {
  id: string; title: string; description: string; link: string; enabled: boolean; sortOrder: number;
};
export type ServiceConfig = {
  hero?: ServiceHero | null;
  title: string; subtitle: string; intro: string; announcement: string;
  serviceHours: string; line: string; facebook: string; email: string; phone: string;
};
export type ServiceDocument = { config: ServiceConfig; cards: ServiceCard[]; faqs: ServiceFaq[] };
export type ServiceState = { schemaVersion: 1; revision: number; document: ServiceDocument };
export type ResolvedServiceFaq = ServiceFaq & { sourceLabel?: string };

const card = (id: string, title: string, description: string, link: string, sortOrder: number): ServiceCard => ({ id, title, description, link, enabled: true, sortOrder });
const faq = (id: string, category: ServiceCategory, question: string, answer: string, source: ServiceSource, keywords: string[], ctaLabel: string, ctaHref: string, sortOrder: number): ServiceFaq => ({ id, category, question, answer, source, keywords, ctaLabel, ctaHref, enabled: true, sortOrder });
export const DEFAULT_SERVICE_DOCUMENT: ServiceDocument = {
  config: {
    hero: { ...DEFAULT_SERVICE_HERO },
    title: "客服中心", subtitle: "CUSTOMER SERVICE",
    intro: "從挑選一杯咖啡，到收到每一份心意。\n關於訂購、配送與會員服務，我們陪你一起找到答案。",
    announcement: "", serviceHours: "",
    // Existing public channels: components/layout/Footer.tsx and home/ContactSection.tsx.
    line: "https://line.me/R/ti/p/@kdcoffee", facebook: "https://www.facebook.com/KDcoffee.tw",
    email: "kdcoffee1962@gmail.com", phone: "0955-504-789",
  },
  cards: [
    card("orders", "我的訂單", "查看訂單、付款資訊與最新進度", "/member#orders", 10),
    card("delivery", "配送與取貨", "了解寄送與工作室自取流程", "#faq-delivery", 20),
    card("cancellation", "訂單取消", "前往訂單查看可使用的服務", "#faq-cancellation", 30),
    card("returns", "退貨／退款", "透過訂單詢問，取得客服協助", "#faq-cancellation", 40),
    card("account", "會員帳號", "登入與管理你的會員資料", "/member#account", 50),
    card("kd", "KD 點數／抵用金", "查看回饋說明與會員明細", "#faq-kd", 60),
    card("subscription", "定期配送", "回到會員中心管理配送安排", "/member#subscription", 70),
    card("coffee", "Coffee 商品", "探索咖啡作品與本月豆單", "/works", 80),
    card("store", "Store", "瀏覽商店與商品介紹", "/store", 90),
    card("gifts", "Gifts", "為想念的人，挑選一份心意", "/gifts", 100),
  ],
  faqs: [
    faq("order-progress", "orders", "在哪裡查看訂單與付款資訊？", "", "orders", ["訂單", "付款", "ATM", "匯款", "進度"], "前往我的訂單", "/member#orders", 10),
    faq("delivery-flow", "delivery", "配送與取貨會經過哪些階段？", "", "delivery", ["7-ELEVEN", "711", "7-11", "到店", "自取", "宅配", "物流"], "查看我的配送進度", "/member#orders", 20),
    faq("cancel-order", "cancellation", "如何確認我的訂單能否取消？", "", "cancellation", ["取消", "取消條件", "取貨", "已出貨"], "開啟訂單查看", "/member#orders", 30),
    faq("return-help", "cancellation", "需要退貨或退款協助，該怎麼聯絡？", "", "returns", ["退貨", "退款", "售後", "期限"], "聯絡客服", "#contact", 40),
    faq("member-login", "account", "如何登入或更新會員資料？", "可從會員中心使用目前提供的登入方式；登入後，在會員帳號區查看與更新常用資料。", "editorial", ["登入", "LINE", "手機", "Email", "密碼", "會員"], "開啟會員中心", "/member#account", 50),
    faq("reward-waiting", "kd", "為什麼回饋顯示待入帳？", "", "kd", ["KD", "點數", "待入帳", "安全等待", "推薦", "回饋"], "查看回饋明細", "/member#rewards", 60),
    faq("credit-help", "kd", "抵用金如何使用？", "", "credit", ["抵用金", "折抵", "額度", "餘額"], "查看會員抵用金", "/member#rewards", 70),
    faq("subscription-help", "subscription", "在哪裡查看與管理定期配送？", "", "subscription", ["定期", "訂閱", "週期", "下次配送"], "管理定期配送", "/member#subscription", 80),
    faq("coffee-help", "coffee", "怎麼查看咖啡規格、風味與客製烘焙選項？", "", "coffee", ["咖啡豆", "耳掛", "焙度", "風味", "custom roast", "客製"], "探索咖啡作品", "/works", 90),
    faq("store-help", "store", "在哪裡找到 Store 商品的詳細介紹？", "前往 Store，選擇商品即可閱讀介紹與目前可選的規格。商品提供的購買方式請在該商品頁查看。", "editorial", ["商店", "Store", "商品", "規格"], "前往 Store", "/store", 100),
    faq("gift-help", "gifts", "想挑選禮盒，或洽詢送禮需求？", "前往 Gifts 閱讀禮盒介紹；如有送禮需求或商品相關問題，可透過下方客服管道與我們討論。", "editorial", ["送禮", "禮盒", "Gift", "Gifts", "企業"], "探索 Gifts", "/gifts", 110),
    faq("other-help", "other", "沒有找到需要的答案？", "歡迎使用下方客服管道。若與特定訂單有關，請先開啟該筆訂單，透過訂單詢問留下問題，方便我們了解你的需求。", "editorial", ["聯絡", "客服", "問題", "詢問"], "聯絡我們", "#contact", 120),
  ],
};

export class ServiceValidationError extends Error {}
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function fields(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!record(value) || Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) throw new ServiceValidationError("內容欄位不正確。");
}
function plain(value: unknown, max: number, required = false): asserts value is string {
  if (typeof value !== "string" || value.length > max || (required && !value.trim()) || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) throw new ServiceValidationError("請填寫長度範圍內的純文字，不能包含 HTML 或控制字元。");
}
/** Navigation only: no script/data URLs, protocol-relative URLs, API/admin targets or backslashes. */
export function isSafeServiceLink(value: string): boolean {
  if (!value || value.length > 600 || /[\s\\<>\u0000-\u001f\u007f]/u.test(value)) return false;
  if (/^#[a-z][a-z0-9-]*$/i.test(value)) return true;
  if (value.startsWith("/") && !value.startsWith("//")) {
    try {
      const url = new URL(value, "https://service.invalid");
      const pathname = decodeURIComponent(url.pathname);
      return url.origin === "https://service.invalid" && !/[\\\u0000-\u001f]/u.test(pathname) && !/^\/(api|admin)(\/|$)/i.test(pathname) && !pathname.startsWith("//");
    } catch { return false; }
  }
  try { const url = new URL(value); return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password; } catch { return false; }
}
const protectedSources: Partial<Record<ServiceCategory, ServiceSource[]>> = {
  orders: ["orders"], delivery: ["delivery"], cancellation: ["cancellation", "returns"],
  kd: ["kd", "credit"], subscription: ["subscription"], coffee: ["coffee"],
};
export function validateServiceDocument(value: unknown): asserts value is ServiceDocument {
  fields(value, ["config", "cards", "faqs"]);
  fields(value.config, ["title", "subtitle", "intro", "announcement", "serviceHours", "line", "facebook", "email", "phone", ...(record(value.config) && Object.hasOwn(value.config, "hero") ? ["hero"] : [])]);
  const config = value.config;
  if (config.hero != null) {
    fields(config.hero, ["src", "alt", "position"]);
    if (!isLocalAssetImagePath(config.hero.src)) throw new ServiceValidationError("請選擇素材庫中的安全圖片。");
    plain(config.hero.alt, 300, true);
    if (typeof config.hero.position !== "string" || !Object.hasOwn(SERVICE_HERO_POSITIONS, config.hero.position)) throw new ServiceValidationError("圖片裁切位置不正確。");
  }
  for (const key of ["title", "subtitle"]) plain(config[key], 100, true);
  for (const key of ["intro", "announcement"]) plain(config[key], 1200, key === "intro");
  plain(config.serviceHours, 300);
  for (const key of ["line", "facebook"]) {
    plain(config[key], 600);
    if (config[key] && (!isSafeServiceLink(config[key] as string) || !(config[key] as string).startsWith("https://"))) throw new ServiceValidationError("社群連結請使用完整 HTTPS 網址。");
  }
  plain(config.email, 160); plain(config.phone, 40);
  if (config.email && !/^[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(config.email as string)) throw new ServiceValidationError("Email 格式不正確。");
  if (config.phone && !/^\+?[0-9][0-9 ()-]{5,39}$/.test(config.phone as string)) throw new ServiceValidationError("電話格式不正確。");
  if (!Array.isArray(value.cards) || value.cards.length > 30 || !Array.isArray(value.faqs) || value.faqs.length > 150) throw new ServiceValidationError("服務卡最多 30 筆，常見問題最多 150 筆。");
  const ids = new Set<string>();
  for (const item of [...value.cards, ...value.faqs]) {
    if (!record(item) || typeof item.id !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(item.id) || ids.has(item.id)) throw new ServiceValidationError("每筆內容需要唯一的英文識別碼。");
    ids.add(item.id);
    if (typeof item.enabled !== "boolean" || !Number.isSafeInteger(item.sortOrder) || Number(item.sortOrder) < 0 || Number(item.sortOrder) > 10000) throw new ServiceValidationError("啟用狀態或排序不正確。");
  }
  for (const item of value.cards) {
    fields(item, ["id", "title", "description", "link", "enabled", "sortOrder"]);
    plain(item.title, 100, true); plain(item.description, 300, true);
    if (typeof item.link !== "string" || !isSafeServiceLink(item.link)) throw new ServiceValidationError("服務卡連結不安全或格式不正確。");
  }
  for (const item of value.faqs) {
    fields(item, ["id", "category", "question", "answer", "keywords", "enabled", "sortOrder", "source", "ctaLabel", "ctaHref"]);
    if (!SERVICE_CATEGORIES.some(category => category.id === item.category) || typeof item.source !== "string" || !Object.hasOwn(SERVICE_SOURCES, item.source)) throw new ServiceValidationError("常見問題分類或說明來源不正確。");
    plain(item.question, 200, true); plain(item.answer, 4000, item.source === "editorial");
    if (item.source !== "editorial" && item.answer !== "") throw new ServiceValidationError("正式來源說明不可另存副本；請保留空白由系統讀取。");
    const allowed = protectedSources[item.category as ServiceCategory];
    if (allowed && !allowed.includes(item.source as ServiceSource)) throw new ServiceValidationError("此分類必須引用既有正式來源，不可另外編寫政策。");
    if (!Array.isArray(item.keywords) || item.keywords.length > 25) throw new ServiceValidationError("關鍵字最多 25 個。");
    item.keywords.forEach(word => plain(word, 60, true));
    plain(item.ctaLabel, 100); plain(item.ctaHref, 600);
    if (Boolean(item.ctaLabel) !== Boolean(item.ctaHref) || (item.ctaHref && !isSafeServiceLink(item.ctaHref))) throw new ServiceValidationError("相關連結需同時填寫名稱與安全網址。");
  }
}
export function validateServiceState(value: unknown): asserts value is ServiceState {
  fields(value, ["schemaVersion", "revision", "document"]);
  if (value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0) throw new ServiceValidationError("內容版本不正確。");
  validateServiceDocument(value.document);
}
export function filterServiceFaqs(items: ResolvedServiceFaq[], category: ServiceCategory | "all", query: string) {
  const words = query.normalize("NFKC").toLocaleLowerCase("zh-TW").trim().split(/\s+/u).filter(Boolean);
  return items.filter(item => item.enabled && (category === "all" || item.category === category) && words.every(word => `${item.question} ${item.answer} ${item.keywords.join(" ")}`.normalize("NFKC").toLocaleLowerCase("zh-TW").includes(word))).sort((a, b) => a.sortOrder - b.sortOrder);
}
