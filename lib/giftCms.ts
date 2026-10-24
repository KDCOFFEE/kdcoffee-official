import { validateStudioPresentation, type StudioPresentation } from "./storeContentPresentation";
import type { StoreProduct } from "./storeTypes";
import { resolveCmsLink, validateCmsLinkValue } from "./cmsLinks";
import { GIFT_CATEGORIES } from "./giftPresentation";

export const GIFT_SECTION_IDS = ["hero", "categories", "curated", "help", "custom"] as const;
export const GIFT_SECTION_TYPES = ["rich_text", "image", "text_image", "gallery"] as const;
export const STORE_CONTENT_SECTION_TYPES = [...GIFT_SECTION_TYPES, "banner", "specs"] as const;
export const GIFT_CATEGORY_IDS = ["drip-gift", "bean-gift", "coffee-gear-gift", "custom-gift"] as const;
export type GiftSectionId = typeof GIFT_SECTION_IDS[number];
export type GiftImage = { url: string; alt: string; caption: string };
export type GiftVisual = { alignment: "left" | "center"; width: "normal" | "wide"; background: "default" | "soft" | "contrast"; presentation?: StudioPresentation };
export type GiftEditorialSection = GiftVisual & {
  id: string; type: typeof STORE_CONTENT_SECTION_TYPES[number]; enabled: boolean;
  eyebrow: string; heading: string; subheading?: string; body: string; mediaPosition: "left" | "right";
  image: GiftImage | null; images: GiftImage[];
  cta?: { label: string; target: string; style: "primary" | "secondary" | "text" }; rows?: { label: string; value: string }[];
};
export type GiftProductDocument = {
  schemaVersion: 1;
  card: { label: string | null; summary: string | null };
  sections: GiftEditorialSection[];
};
export type GiftLandingDocument = {
  schemaVersion: 1;
  sections: (GiftVisual & { id: GiftSectionId; enabled: boolean })[];
  hero: { eyebrow: string; title: string; description: string; ctaLabel: string; target: string; image: GiftImage | null; alt: string };
  categories: { heading: string; labels: Record<typeof GIFT_CATEGORY_IDS[number], string> };
  curated: { heading: string; groupHeadings: Record<typeof GIFT_CATEGORY_IDS[number], string>; emptyTitle: string; emptyBody: string; emptyCta: string; groupEmpty: string; cardCta: string; zeroPrice: string };
  help: { heading: string; items: { id: string; title: string; body: string; target: string; enabled: boolean }[] };
  custom: { eyebrow: string; title: string; body: string | null; inquiry: string; ctaLabel: string; target: string };
  seo: { title: string; description: string; socialTitle: string; socialDescription: string; image: GiftImage | null };
};
export type GiftCmsState = { schemaVersion: 1; revision: number; landing?: GiftLandingDocument; storeLanding?: StoreLandingDocument; products: Record<string, GiftProductDocument> };
export const DEFAULT_GIFT_CUSTOM_BODY = "依預算、數量與場合，為企業、節慶與重要時刻準備一份專屬心意。";
const visual: GiftVisual = { alignment: "left", width: "normal", background: "default" };
export const DEFAULT_GIFT_LANDING: GiftLandingDocument = {
  schemaVersion: 1,
  sections: GIFT_SECTION_IDS.map(id => ({ ...visual, id, enabled: true })),
  hero: { eyebrow: "GIFTS BY KD COFFEE", title: "送一份咖啡，也送一段值得慢下來的時間。", description: "為日常問候、節慶心意與重要的人，準備一份剛剛好的咖啡禮。", ctaLabel: "挑選禮盒", target: "gift-categories", image: null, alt: "" },
  categories: { heading: "選你想送的方式", labels: Object.fromEntries(GIFT_CATEGORIES.map(c => [c.slug, c.selectorLabel])) as GiftLandingDocument["categories"]["labels"] },
  curated: { heading: "精選禮盒", groupHeadings: Object.fromEntries(GIFT_CATEGORIES.map(c => [c.slug, "groupName" in c ? c.groupName : c.name])) as GiftLandingDocument["curated"]["groupHeadings"], emptyTitle: "禮盒正在準備中。", emptyBody: "歡迎先與我們聊聊送禮對象與場合。", emptyCta: "聊聊送禮需求 →", groupEmpty: "此系列正在準備中。", cardCta: "查看禮盒 →", zeroPrice: "價格待設定" },
  help: { heading: "不知道該選哪一盒？", items: [
    { id: "light", title: "想送得輕巧", body: "從 10 入耳掛禮盒開始。", target: "product:gift-drip10-2", enabled: true },
    { id: "generous", title: "想送得更有份量", body: "選擇 20～24 入耳掛或雙入咖啡豆禮盒。", target: "product:gift-drip20-4", enabled: true },
    { id: "experience", title: "想送一套完整體驗", body: "選擇咖啡豆搭配手沖器具的組合。", target: "coffee-gear-gift", enabled: true },
  ] },
  custom: { eyebrow: "CUSTOM GIFTING", title: "心意成禮", body: null, inquiry: "客製需求請洽詢", ctaLabel: "詢問客製禮盒 ↗", target: "https://line.me/R/ti/p/@kdcoffee" },
  seo: { title: "送禮專區｜精品咖啡禮盒｜KD Coffee", description: "探索 KD Coffee 精品咖啡禮盒，從耳掛咖啡、咖啡豆到手沖組合與客製送禮，為日常問候、節慶與重要時刻挑選一份剛剛好的咖啡禮。", socialTitle: "", socialDescription: "", image: null },
};
export function newGiftEditorialSection(type: GiftEditorialSection["type"], id: string): GiftEditorialSection {
  return { ...visual, id, type, enabled: true, eyebrow: "", heading: type === "rich_text" ? "關於這件商品" : "", body: "", mediaPosition: "right", image: null, images: [] };
}
export function giftProductFallback(product: Pick<StoreProduct, "description">): GiftProductDocument {
  return { schemaVersion: 1, card: { label: null, summary: null }, sections: [{ ...newGiftEditorialSection("rich_text", "legacy-description"), body: product.description }] };
}
export class GiftCmsValidationError extends Error { constructor(message = "頁面內容格式不正確，請檢查後再儲存。") { super(message); this.name = "GiftCmsValidationError"; } }
function ensure(ok: unknown, message?: string): asserts ok { if (!ok) throw new GiftCmsValidationError(message); }
function record(v: unknown, keys: readonly string[]): Record<string, unknown> {
  ensure(v && typeof v === "object" && !Array.isArray(v));
  ensure(Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
  ensure(Object.getOwnPropertySymbols(v).length === 0);
  for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(v))) ensure(keys.includes(k) && "value" in d && d.enumerable);
  return v as Record<string, unknown>;
}
function text(v: unknown, max = 20000, required = false) {
  ensure(typeof v === "string" && Array.from(v).length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(v), "文字格式不正確或超過長度限制。");
  ensure(Array.from(v).every(p => { const cp = p.codePointAt(0)!; return cp < 0xd800 || cp > 0xdfff; }));
  if (required) ensure(v.trim().length > 0, "請填寫標題或替代文字。");
}
function enumeration(v: unknown, allowed: readonly string[]) { ensure(typeof v === "string" && allowed.includes(v)); }
function bool(v: unknown) { ensure(typeof v === "boolean"); }
function id(v: unknown) { ensure(typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u.test(v)); }
function list(v: unknown, max: number): unknown[] { ensure(Array.isArray(v) && v.length <= max); return v; }
function unique(values: unknown[]) { ensure(new Set(values).size === values.length, "區塊識別重複。"); }
function validateVisual(v: Record<string, unknown>) { if(v.presentation !== undefined) { try { validateStudioPresentation(v.presentation); } catch { throw new GiftCmsValidationError("視覺設定格式不正確，請檢查字級、色彩與間距。"); } } enumeration(v.alignment, ["left", "center"]); enumeration(v.width, ["normal", "wide"]); enumeration(v.background, ["default", "soft", "contrast"]); }
function image(v: unknown) {
  if (v === null) return;
  const r = record(v, ["url", "alt", "caption"]); text(r.url, 2048, true); text(r.alt, 300, true); text(r.caption, 2000);
  const url = r.url as string; ensure(!/[\\\s]/u.test(url) && !url.startsWith("//"));
  if (url.startsWith("/")) { ensure(!/[?#]/u.test(url) && url.startsWith("/uploads/assets/")); for (const part of url.split("/")) { let decoded; try { decoded = decodeURIComponent(part); } catch { throw new GiftCmsValidationError(); } ensure(![".", ".."].includes(decoded) && !/[\\/\u0000-\u0020]/u.test(decoded)); } }
  else { let parsed: URL; try { parsed = new URL(url); } catch { throw new GiftCmsValidationError(); } ensure(parsed.protocol === "https:" && !parsed.username && !parsed.password); }
}
export function isGiftTarget(value: unknown): value is string {
  return typeof value === "string" && (["gift-categories", "curated-gifts", "gift-selection-help", "custom-gifting", ...GIFT_CATEGORY_IDS].includes(value) || /^product:[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value) && value.length <= 88);
}
export function giftTargetHref(target: string, publicSlugs: string[]) {
  if (!isGiftTarget(target)) return "#curated-gifts";
  const anchor = target.startsWith("product:") ? publicSlugs.includes(target.slice(8)) ? "gift-" + target.slice(8) : "drip-gift" : target;
  return resolveCmsLink({ type: "custom", url: "#" + anchor }).href || "#curated-gifts";
}
export function giftContactHref(target: string) { validateCmsLinkValue(target, "客製送禮連結"); const link = resolveCmsLink(target); ensure(link.valid && link.href, "請選擇有效的聯絡連結。"); return link.href; }
export function validateGiftLanding(input: unknown): asserts input is GiftLandingDocument {
  const r = record(input, ["schemaVersion", "sections", "hero", "categories", "curated", "help", "custom", "seo"]); ensure(r.schemaVersion === 1);
  const sections = list(r.sections, 5); ensure(sections.length === 5); const ids = [];
  for (const value of sections) { const s = record(value, ["id", "enabled", "alignment", "width", "background", "presentation"]); enumeration(s.id, GIFT_SECTION_IDS); bool(s.enabled); validateVisual(s); if (s.id === "hero") ensure(s.enabled === true, "主視覺需保持顯示。"); ids.push(s.id); } unique(ids);
  const hero = record(r.hero, ["eyebrow", "title", "description", "ctaLabel", "target", "image", "alt"]);
  for (const key of ["eyebrow", "title", "description", "ctaLabel", "alt"]) text(hero[key], key === "description" ? 4000 : 400, key === "title"); ensure(isGiftTarget(hero.target)); image(hero.image);
  const categories = record(r.categories, ["heading", "labels"]); text(categories.heading, 400); const labels = record(categories.labels, GIFT_CATEGORY_IDS); for (const key of GIFT_CATEGORY_IDS) text(labels[key], 200);
  const curated = record(r.curated, ["heading", "groupHeadings", "emptyTitle", "emptyBody", "emptyCta", "groupEmpty", "cardCta", "zeroPrice"]);
  for (const key of ["heading", "emptyTitle", "emptyBody", "emptyCta", "groupEmpty", "cardCta", "zeroPrice"]) text(curated[key], 4000);
  const groups = record(curated.groupHeadings, GIFT_CATEGORY_IDS); for (const key of GIFT_CATEGORY_IDS) text(groups[key], 400);
  const help = record(r.help, ["heading", "items"]); text(help.heading, 400); const items = list(help.items, 3); ensure(items.length === 3); const helpIds = [];
  for (const value of items) { const item = record(value, ["id", "title", "body", "target", "enabled"]); id(item.id); text(item.title, 400); text(item.body, 4000); ensure(isGiftTarget(item.target)); bool(item.enabled); helpIds.push(item.id); } unique(helpIds);
  const custom = record(r.custom, ["eyebrow", "title", "body", "inquiry", "ctaLabel", "target"]); for (const key of ["eyebrow", "title", "inquiry", "ctaLabel"]) text(custom[key], 400); if (custom.body !== null) text(custom.body); text(custom.target, 2048, true); giftContactHref(custom.target as string);
  const seo = record(r.seo, ["title", "description", "socialTitle", "socialDescription", "image"]); for (const key of ["title", "description", "socialTitle", "socialDescription"]) text(seo[key], key.includes("escription") ? 1000 : 200); image(seo.image);
}
export function validateGiftProduct(input: unknown): asserts input is GiftProductDocument {
  const r = record(input, ["schemaVersion", "card", "sections"]); ensure(r.schemaVersion === 1); const card = record(r.card, ["label", "summary"]); for (const k of ["label", "summary"]) if (card[k] !== null) text(card[k], 2000);
  const sections = list(r.sections, 40); const ids = [];
  for (const value of sections) { const s = record(value, ["id", "type", "enabled", "eyebrow", "heading", "subheading", "body", "alignment", "width", "background", "mediaPosition", "image", "images", "presentation", "cta", "rows"]); id(s.id); ids.push(s.id); enumeration(s.type, STORE_CONTENT_SECTION_TYPES); bool(s.enabled); validateVisual(s); enumeration(s.mediaPosition, ["left", "right"]); text(s.eyebrow, 400); text(s.heading, 400, s.type === "rich_text"); if(s.subheading!==undefined)text(s.subheading,400); text(s.body); image(s.image); const images = list(s.images, 24); images.forEach(image); ensure(!images.includes(null)); if (s.enabled && ["image", "text_image"].includes(s.type as string)) ensure(s.image !== null, "請為圖片區塊選擇素材，或先關閉此區塊。"); if (s.enabled && s.type === "gallery") ensure(images.length > 0, "請為相簿選擇至少一張圖片。"); if (s.cta !== undefined) { const c=record(s.cta,["label","target","style"]);text(c.label,400,true);text(c.target,2048,true);giftContactHref(c.target as string);enumeration(c.style,["primary","secondary","text"]); }
    if(s.rows !== undefined) for(const row of list(s.rows,40)){const r=record(row,["label","value"]);text(r.label,400,true);text(r.value,4000,true);}
    if(s.enabled && s.type === "banner") ensure(s.cta !== undefined,"請填寫按鈕文字與連結。");
    if(s.enabled && s.type === "specs") ensure(Array.isArray(s.rows) && s.rows.length>0,"請新增至少一列資訊。");
  } unique(ids);
}
export function validateGiftCmsState(input: unknown): asserts input is GiftCmsState {
  const r = record(input, ["schemaVersion", "revision", "landing", "storeLanding", "products"]); ensure(r.schemaVersion === 1 && Number.isSafeInteger(r.revision) && (r.revision as number) >= 0); if (r.landing !== undefined) validateGiftLanding(r.landing); if(r.storeLanding !== undefined) validateStoreLanding(r.storeLanding);
  ensure(r.products && typeof r.products === "object" && !Array.isArray(r.products)); const products = r.products as Record<string, unknown>; ensure(Object.keys(products).length <= 10000); for (const [key, value] of Object.entries(products)) { id(key); ensure(!["__proto__", "constructor", "prototype"].includes(key)); validateGiftProduct(value); }
}

/** General Store page shares the existing document store and editorial section contract. */
export type StoreLandingSection = (GiftVisual & { id: "hero" | "categories" | "products"; type: "builtin"; enabled: boolean; heading?: string; eyebrow?: string; body?: string }) | GiftEditorialSection;
export type StoreLandingDocument = {
 schemaVersion: 1; sections: StoreLandingSection[];
 hero: { eyebrow: string; title: string; description: string; ctaLabel: string; target: string; image: GiftImage | null; mobileImage: GiftImage | null; alt: string };
 navigation: { sections: { id: string; label: string; enabled: boolean }[]; categories: { id: string; label: string; enabled: boolean }[] };
 cards: { imageRatio: "original" | "square" | "landscape" | "portrait"; titleSize: number; priceSize: number; secondarySize: number | null; spacing: number; pointStyle: "quiet" | "regular" | "hidden" };
 seo: GiftLandingDocument["seo"];
};
export function storeLandingDefaults(hero: {title:string;subtitle:string}, catalog?: {sections:{id:string;name:string}[];categories:{id:string;name:string}[]}): StoreLandingDocument {
 return {schemaVersion:1,sections:(["hero","categories","products"] as const).map(id=>({...visual,id,type:"builtin",enabled:true})),hero:{eyebrow:"",title:hero.title,description:hero.subtitle,ctaLabel:"",target:"/store#store-results-heading",image:null,mobileImage:null,alt:""},navigation:{sections:(catalog?.sections||[]).map(s=>({id:s.id,label:s.name,enabled:true})),categories:(catalog?.categories||[]).map(s=>({id:s.id,label:s.name,enabled:true}))},cards:{imageRatio:"original",titleSize:23,priceSize:20,secondarySize:null,spacing:24,pointStyle:"hidden"},seo:{title:"",description:"",socialTitle:"",socialDescription:"",image:null}};
}
export function validateStoreLanding(input: unknown): asserts input is StoreLandingDocument {
 const r=record(input,["schemaVersion","sections","hero","navigation","cards","seo"]);ensure(r.schemaVersion===1);
 const sections=list(r.sections,43),ids:unknown[]=[];const builtins:string[]=[];
 for(const value of sections){ensure(value&&typeof value==="object");if((value as {type?:string}).type === "builtin"){const s=record(value,["id","type","enabled","alignment","width","background","presentation","heading","eyebrow","body"]);enumeration(s.id,["hero","categories","products"]);bool(s.enabled);validateVisual(s);for(const key of ["heading","eyebrow","body"])if(s[key]!==undefined)text(s[key],key==="body"?20000:400);if(s.id==="products")ensure(s.enabled===true,"商品列表需保持顯示。");builtins.push(s.id as string);}else{validateGiftProduct({schemaVersion:1,card:{label:null,summary:null},sections:[value]});ensure(!["hero","categories","products"].includes((value as {id:string}).id));}ids.push((value as {id:string}).id);}unique(ids);ensure(builtins.length===3&&new Set(builtins).size===3);
 const h=record(r.hero,["eyebrow","title","description","ctaLabel","target","image","mobileImage","alt"]);for(const key of["eyebrow","title","description","ctaLabel","alt"])text(h[key],key==="description"?4000:400,key==="title");text(h.target,2048,true);giftContactHref(h.target as string);image(h.image);image(h.mobileImage);
 const nav=record(r.navigation,["sections","categories"]);for(const key of["sections","categories"]){const seen=[];for(const item of list(nav[key],1000)){const n=record(item,["id","label","enabled"]);id(n.id);text(n.label,400);bool(n.enabled);seen.push(n.id);}unique(seen);}
 const cards=record(r.cards,["imageRatio","titleSize","priceSize","secondarySize","spacing","pointStyle"]);enumeration(cards.imageRatio,["original","square","landscape","portrait"]);enumeration(cards.pointStyle,["quiet","regular","hidden"]);for(const k of["titleSize","priceSize","secondarySize","spacing"])if(!(k==="secondarySize"&&cards[k]===null))ensure(typeof cards[k]==="number"&&Number.isFinite(cards[k])&&(cards[k] as number)>=8&&(cards[k] as number)<=64);
 const seo=record(r.seo,["title","description","socialTitle","socialDescription","image"]);for(const k of["title","description","socialTitle","socialDescription"])text(seo[k],k.includes("escription")?1000:200);image(seo.image);
}
