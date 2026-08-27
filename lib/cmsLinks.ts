export const CMS_LINK_TYPES = ["none", "internal", "product", "page", "section", "external", "telephone", "email", "line", "custom"] as const;

export type CmsLinkType = (typeof CMS_LINK_TYPES)[number];

export type StructuredCmsLink = {
  type: CmsLinkType;
  target?: string;
  url?: string;
};

/** Legacy string values remain supported so existing homepage data is never migrated implicitly. */
export type CmsLinkValue = string | StructuredCmsLink | null | undefined;

export type CmsLinkProduct = {
  slug: string;
  name: string;
  active?: boolean;
  status?: string;
};

/**
 * H.2C9B extension contract: the Page Builder registers published pages with a
 * stable id and its canonical public href. Smart Links never guess page routes.
 */
export type PublishedCmsPage = {
  id: string;
  title: string;
  href: string;
  published: boolean;
};

export type CmsDestinationCategory = "internal" | "product" | "page" | "section";

export type CmsDestination = {
  category: CmsDestinationCategory;
  id: string;
  label: string;
  href: string;
  searchText: string;
};

export type CmsLinkRegistryInput = {
  products?: CmsLinkProduct[];
  pages?: PublishedCmsPage[];
};

export type ResolvedCmsLink = {
  valid: boolean;
  href?: string;
  label: string;
  warning?: string;
  external: boolean;
  legacy: boolean;
};

export const CMS_INTERNAL_DESTINATIONS: CmsDestination[] = [
  { category: "internal", id: "home", label: "首頁", href: "/", searchText: "首頁 home" },
  { category: "internal", id: "works", label: "全部咖啡作品", href: "/works", searchText: "全部咖啡作品 商品 works" },
  { category: "internal", id: "monthly-menu", label: "本月豆單", href: "/monthly-menu", searchText: "本月豆單 monthly menu" },
  { category: "internal", id: "member", label: "會員中心", href: "/member", searchText: "會員中心 member" },
  { category: "internal", id: "cart", label: "購物車", href: "/cart", searchText: "購物車 cart" },
];

export const CMS_HOMEPAGE_SECTION_DESTINATIONS: CmsDestination[] = [
  { category: "section", id: "home003", label: "依生活情境挑咖啡", href: "/#home003", searchText: "生活情境 挑咖啡 入門 home003" },
  { category: "section", id: "monthly-campaign", label: "本月活動", href: "/#monthly-campaign", searchText: "本月活動 campaign" },
  { category: "section", id: "home004", label: "入門推薦作品", href: "/#home004", searchText: "入門推薦 作品 home004" },
  { category: "section", id: "home005", label: "咖啡製作過程", href: "/#home005", searchText: "咖啡製作 過程 home005" },
  { category: "section", id: "home006", label: "專屬烘焙服務", href: "/#home006", searchText: "專屬烘焙 服務 home006" },
  { category: "section", id: "home007", label: "咖啡作品理念", href: "/#home007", searchText: "咖啡作品 理念 home007" },
  { category: "section", id: "home008", label: "KD Coffee 工作室", href: "/#home008", searchText: "工作室 studio home008" },
  { category: "section", id: "home009", label: "顧客真實評價", href: "/#home009", searchText: "顧客 真實評價 home009" },
  { category: "section", id: "home010", label: "頁尾購買引導", href: "/#home010", searchText: "頁尾 購買 引導 home010" },
];

function safeCustomHref(value: string) {
  const href = value.trim();
  return href.length <= 500 && /^(?:\/|#|mailto:|tel:)/u.test(href) && !/[<>\u0000-\u001f]/u.test(href);
}

function safeTelephoneHref(value: string) {
  const number = value.trim().replace(/^tel:/iu, "");
  return number.length <= 40 && /^\+?[0-9][0-9()\-\s]{5,38}$/u.test(number);
}

function telephoneHref(value: string) {
  const number = value.trim().replace(/^tel:/iu, "");
  return `tel:${number.replace(/[()\-\s]/gu, "")}`;
}

function safeEmailHref(value: string) {
  const address = value.trim().replace(/^mailto:/iu, "");
  return address.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(address);
}

function safeExternalHref(value: string, allowLegacyHttp = false) {
  const href = value.trim();
  const pattern = allowLegacyHttp ? /^https?:\/\//u : /^https:\/\//u;
  if (!pattern.test(href) || href.length > 500 || /[<>\u0000-\u001f]/u.test(href)) return false;
  try {
    const parsed = new URL(href);
    return parsed.protocol === "https:" || (allowLegacyHttp && parsed.protocol === "http:");
  } catch {
    return false;
  }
}

export function buildCmsDestinationRegistry({ products = [], pages = [] }: CmsLinkRegistryInput = {}) {
  const productDestinations: CmsDestination[] = products
    .filter((product) => product.slug && product.name && product.active !== false && product.status !== "hidden")
    .map((product) => ({
      category: "product",
      id: product.slug,
      label: product.name,
      href: `/works/${product.slug}`,
      searchText: `${product.name} ${product.slug}`.toLocaleLowerCase("zh-TW"),
    }));
  const pageDestinations: CmsDestination[] = pages
    .filter((page) => page.published && page.id && page.title && safeCustomHref(page.href))
    .map((page) => ({ category: "page", id: page.id, label: page.title, href: page.href, searchText: `${page.title} ${page.id}`.toLocaleLowerCase("zh-TW") }));
  return [...CMS_INTERNAL_DESTINATIONS, ...productDestinations, ...pageDestinations, ...CMS_HOMEPAGE_SECTION_DESTINATIONS];
}

function displayType(type: CmsLinkType) {
  return ({ none: "不設定連結", internal: "站內頁面", product: "咖啡作品", page: "活動／專題頁面", section: "首頁區塊", external: "外部網站", telephone: "電話", email: "Email", line: "LINE／客服", custom: "進階自訂" } as const)[type];
}

export function resolveCmsLink(value: CmsLinkValue, input: CmsLinkRegistryInput = {}): ResolvedCmsLink {
  const registry = buildCmsDestinationRegistry(input);
  if (value === null || value === undefined || value === "") return { valid: true, label: "不設定連結", external: false, legacy: typeof value === "string" };
  if (typeof value === "string") {
    const href = value.trim();
    const match = registry.find((entry) => entry.href === href || (href.startsWith("#") && entry.href === `/${href}`));
    const valid = safeCustomHref(href) || safeExternalHref(href, true);
    return {
      valid,
      href: valid ? href : undefined,
      label: match?.label || (valid ? "既有自訂連結" : "無效的既有連結"),
      warning: valid ? undefined : `既有連結「${href}」不安全或格式不正確。`,
      external: safeExternalHref(href, true),
      legacy: true,
    };
  }
  if (!CMS_LINK_TYPES.includes(value.type)) return { valid: false, label: "未知連結類型", warning: "已儲存的連結類型不受支援。", external: false, legacy: false };
  if (value.type === "none") return { valid: true, label: displayType(value.type), external: false, legacy: false };
  if (value.type === "external") {
    const href = value.url?.trim() || "";
    const valid = safeExternalHref(href);
    return { valid, href: valid ? href : undefined, label: valid ? "外部網站" : "外部網站未設定", warning: valid ? undefined : "外部網站必須使用完整的 https:// 網址。", external: true, legacy: false };
  }
  if (value.type === "telephone") {
    const raw = value.url?.trim() || "";
    const valid = safeTelephoneHref(raw);
    return { valid, href: valid ? telephoneHref(raw) : undefined, label: valid ? `電話：${raw.replace(/^tel:/iu, "")}` : "電話未設定", warning: valid ? undefined : "請輸入有效的電話號碼。", external: false, legacy: false };
  }
  if (value.type === "email") {
    const raw = value.url?.trim() || "";
    const valid = safeEmailHref(raw);
    return { valid, href: valid ? `mailto:${raw.replace(/^mailto:/iu, "")}` : undefined, label: valid ? `Email：${raw.replace(/^mailto:/iu, "")}` : "Email 未設定", warning: valid ? undefined : "請輸入有效的電子郵件。", external: false, legacy: false };
  }
  if (value.type === "line") {
    const href = value.url?.trim() || "";
    const valid = safeExternalHref(href);
    return { valid, href: valid ? href : undefined, label: valid ? "LINE／客服" : "LINE／客服未設定", warning: valid ? undefined : "LINE／客服必須使用完整的 https:// 網址。", external: true, legacy: false };
  }
  if (value.type === "custom") {
    const href = value.url?.trim() || "";
    const valid = safeCustomHref(href);
    return { valid, href: valid ? href : undefined, label: valid ? "進階自訂連結" : "進階自訂連結未設定", warning: valid ? undefined : "自訂連結必須是 / 開頭的站內路徑、# 頁面位置、mailto: 或 tel:。", external: false, legacy: false };
  }
  const destination = registry.find((entry) => entry.category === value.type && entry.id === value.target);
  if (!destination) {
    const saved = value.target?.trim() || "（空白）";
    return { valid: false, label: `${displayType(value.type)}引用已失效`, warning: `找不到已儲存的目的地「${saved}」。請重新選擇或設為不設定連結。`, external: false, legacy: false };
  }
  return { valid: true, href: destination.href, label: destination.label, external: false, legacy: false };
}

export function inferCmsLink(value: CmsLinkValue, input: CmsLinkRegistryInput = {}): StructuredCmsLink {
  if (value && typeof value === "object") return value;
  if (!value) return { type: "none" };
  const href = value.trim();
  const match = buildCmsDestinationRegistry(input).find((entry) => entry.href === href || (href.startsWith("#") && entry.href === `/${href}`));
  if (match) return { type: match.category, target: match.id };
  if (safeExternalHref(href, true)) return { type: "external", url: href };
  if (safeTelephoneHref(href)) return { type: "telephone", url: href.replace(/^tel:/iu, "") };
  if (safeEmailHref(href)) return { type: "email", url: href.replace(/^mailto:/iu, "") };
  return { type: "custom", url: href };
}

export function validateCmsLinkValue(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return;
  if (typeof value === "string") {
    if (!safeCustomHref(value) && !safeExternalHref(value, true)) throw new Error(`${label}必須是站內路徑、頁面位置或安全網址。`);
    return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}格式不正確。`);
  const link = value as Partial<StructuredCmsLink>;
  if (!link.type || !CMS_LINK_TYPES.includes(link.type)) throw new Error(`${label}類型不正確。`);
  if (link.type === "none") return;
  if (link.type === "external") {
    if (!link.url || !safeExternalHref(link.url)) throw new Error(`${label}必須使用完整的 https:// 網址。`);
    return;
  }
  if (link.type === "telephone") {
    if (!link.url || !safeTelephoneHref(link.url)) throw new Error(`${label}電話號碼格式不正確。`);
    return;
  }
  if (link.type === "email") {
    if (!link.url || !safeEmailHref(link.url)) throw new Error(`${label}電子郵件格式不正確。`);
    return;
  }
  if (link.type === "line") {
    if (!link.url || !safeExternalHref(link.url)) throw new Error(`${label}必須使用完整的 https:// 網址。`);
    return;
  }
  if (link.type === "custom") {
    if (!link.url || !safeCustomHref(link.url)) throw new Error(`${label}必須是安全的站內路徑或頁面位置。`);
    return;
  }
  if (typeof link.target !== "string" || !link.target.trim() || link.target.length > 200) throw new Error(`${label}尚未選擇目的地。`);
}
