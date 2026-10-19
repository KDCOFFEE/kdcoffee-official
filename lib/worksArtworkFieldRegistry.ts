import type { OwnerAuthority, OwnerDestinationKind, OwnerEditDestination, OwnerFieldDefinition, OwnerImpact, OwnerSectionId } from "./worksArtworkReadModel.ts";

/** Static IA only. No Product/Commerce values, writes or invented deep links. */
export const OWNER_SECTION_LABELS: Readonly<Record<OwnerSectionId, string>> = Object.freeze({
  overview: "作品總覽", pageContent: "頁面內容", productFacts: "商品與咖啡資料", purchase: "售價與購買",
  media: "圖片與影片", relatedWorks: "相關作品", presentation: "頁面外觀", animation: "進場效果",
  searchAndShare: "搜尋與分享", systemInfo: "系統資訊",
});
export const OWNER_EDIT_DESTINATIONS: Readonly<Record<OwnerDestinationKind, OwnerEditDestination>> = Object.freeze({
  PRODUCT_ADMIN: Object.freeze({ kind: "PRODUCT_ADMIN", href: "/admin/products", label: "前往商品設定後選擇此作品" }),
  COMMERCE_ADMIN: Object.freeze({ kind: "COMMERCE_ADMIN", href: "/admin/products", label: "前往商品設定後開啟售價與購買" }),
  MEDIA_ADMIN: Object.freeze({ kind: "MEDIA_ADMIN", href: "/admin/products", label: "前往商品設定後管理此作品素材" }),
  WORKS_FUTURE: Object.freeze({ kind: "WORKS_FUTURE", href: null, label: "作品頁編輯尚未連接" }),
  SYSTEM_ONLY: Object.freeze({ kind: "SYSTEM_ONLY", href: null, label: "僅供系統維護" }),
  NO_CURRENT_EDITOR: Object.freeze({ kind: "NO_CURRENT_EDITOR", href: null, label: "目前沒有可用編輯入口" }),
});
type Row = readonly [string, string, OwnerSectionId, OwnerAuthority, readonly string[], readonly OwnerImpact[], boolean?, OwnerFieldDefinition["completenessRole"]?];
const detail = ["ARTWORK_DETAIL"] as const, product = ["ARTWORK_DETAIL", "WORKS_LIST", "PRODUCT_REFERENCES"] as const;
const rows: readonly Row[] = [
  ["identity.name", "作品名稱", "overview", "PRODUCT", ["作品頁頂部", "作品列表", "商品參照"], ["ARTWORK_DETAIL", "WORKS_LIST", "PRODUCT_REFERENCES", "SEARCH_SHARE"], false, "REQUIRED"],
  ["identity.nameEn", "英文作品名稱", "overview", "PRODUCT", ["作品頁頂部"], detail],
  ["identity.artist", "藝術家", "overview", "PRODUCT", ["作品頁頂部", "作品列表封面（依設定）", "相關作品卡片（標籤留空時）", "商品包裝示意"], product],
  ["identity.tag", "作品標籤", "overview", "PRODUCT", ["作品頁標籤", "作品列表標籤（依設定）", "相關作品卡片"], product],
  ["identity.thumbnail", "作品縮圖", "overview", "MEDIA", ["後台作品總覽"], ["SYSTEM_ONLY"], true, "EXCLUDED"],
  ["public.detailPage", "作品頁可否開啟", "overview", "DERIVED", ["作品頁"], detail, true, "STATUS_ONLY"],
  ["public.worksList", "作品列表曝光", "overview", "DERIVED", ["作品列表"], ["WORKS_LIST"], true, "STATUS_ONLY"],
  ["public.purchase", "目前可否購買", "purchase", "COMMERCE", ["購買區"], ["COMMERCE"], true, "STATUS_ONLY"],
  ["facts.origin", "產區", "productFacts", "PRODUCT", ["作品頁頂部規格", "咖啡資料（依顯示設定）", "作品列表資料（依設定）", "商品包裝示意"], product, false, "REQUIRED"],
  ["facts.process", "處理法", "productFacts", "PRODUCT", ["作品頁頂部規格", "咖啡資料（依顯示設定）", "作品列表資料（依設定）"], ["ARTWORK_DETAIL", "WORKS_LIST"], false, "REQUIRED"],
  ["facts.roast", "烘焙度", "productFacts", "PRODUCT", ["作品頁頂部規格", "咖啡資料（依顯示設定）", "作品列表資料（依設定）", "商品包裝示意"], product, false, "REQUIRED"],
  ["facts.variety", "品種", "productFacts", "PRODUCT", ["商品資料檢視；目前公開作品頁與作品列表未呈現"], []],
  ["facts.altitude", "海拔", "productFacts", "PRODUCT", ["商品資料檢視；目前公開作品頁與作品列表未呈現"], []],
  ["facts.flavors", "風味標籤", "productFacts", "PRODUCT", ["風味筆記", "作品卡片"], product, false, "REQUIRED"],
  ["facts.shortCopy", "簡短文案", "productFacts", "PRODUCT", ["作品頁介紹", "作品列表", "搜尋摘要"], ["ARTWORK_DETAIL", "WORKS_LIST", "SEARCH_SHARE"]],
  ["facts.subtitle", "補充介紹", "productFacts", "PRODUCT", ["作品頁介紹的相容來源", "作品故事的相容來源", "作品列表介紹的相容來源（依顯示設定）"], ["ARTWORK_DETAIL", "WORKS_LIST"]],
  ["facts.mood", "作品故事來源", "productFacts", "PRODUCT", ["作品故事", "搜尋摘要的相容來源"], ["ARTWORK_DETAIL", "SEARCH_SHARE"]],
  ["content.hero", "作品開場介紹", "pageContent", "WORKS", ["作品頁頂部介紹"], detail],
  ["content.story", "作品故事", "pageContent", "WORKS", ["作品故事"], detail, false, "REQUIRED"],
  ["content.supplement", "故事補充", "pageContent", "WORKS", ["作品故事補充"], detail],
  ["content.flavor", "風味故事", "pageContent", "WORKS", ["風味筆記"], detail],
  ["content.roasting", "烘焙理念", "pageContent", "WORKS", ["乾淨的烘焙"], detail],
  ["content.proofs", "烘焙特色", "pageContent", "WORKS", ["乾淨的烘焙特色"], detail],
  ["content.roastedCaptions", "烘焙豆說明", "pageContent", "MEDIA", ["烘焙豆檢視器"], detail],
  ["content.heading", "故事標題候選", "pageContent", "WORKS", ["未來作品故事"], detail, true, "EXCLUDED"],
  ["content.highlights", "故事重點候選", "pageContent", "WORKS", ["未來作品故事"], detail, true, "EXCLUDED"],
  ["content.drinking", "飲用建議候選", "pageContent", "WORKS", ["未來飲用建議"], detail, true, "EXCLUDED"],
  ["content.closing", "結尾文案候選", "pageContent", "WORKS", ["未來結尾"], detail, true, "EXCLUDED"],
  ["media.hero", "頂部主視覺", "media", "MEDIA", ["作品頁頂部"], detail],
  ["media.productPhoto", "商品照片", "media", "MEDIA", ["作品頁商品照片"], detail],
  ["media.roasted", "烘焙豆照片與影片", "media", "MEDIA", ["烘焙豆檢視器"], detail],
  ["media.gallery", "作品細節圖片", "media", "MEDIA", ["作品細節圖集"], detail],
  ["media.clean", "烘焙實拍", "media", "MEDIA", ["乾淨的烘焙"], detail],
  ["related.items", "相關作品", "relatedWorks", "WORKS", ["相關作品區"], detail],
  ["related.title", "相關作品標題", "relatedWorks", "WORKS", ["相關作品區"], detail],
  ["purchase.summary", "售價與規格摘要", "purchase", "COMMERCE", ["購買區"], ["COMMERCE"], true, "STATUS_ONLY"],
  ["presentation.status", "頁面外觀", "presentation", "WORKS", ["作品頁外觀"], detail, true, "STATUS_ONLY"],
  ["presentation.visible", "區域顯示候選", "presentation", "WORKS", ["未來區域顯示"], detail, true, "EXCLUDED"],
  ["presentation.spacing", "區域間距候選", "presentation", "WORKS", ["未來區域間距"], detail, true, "EXCLUDED"],
  ["presentation.width", "內容寬度候選", "presentation", "WORKS", ["未來內容寬度"], detail, true, "EXCLUDED"],
  ["animation.status", "進場效果", "animation", "WORKS", ["作品頁進場效果"], detail, true, "STATUS_ONLY"],
  ["animation.enabled", "效果啟用候選", "animation", "WORKS", ["未來進場效果"], detail, true, "EXCLUDED"],
  ["animation.preset", "效果種類候選", "animation", "WORKS", ["未來進場效果"], detail, true, "EXCLUDED"],
  ["animation.duration", "效果速度候選", "animation", "WORKS", ["未來進場效果"], detail, true, "EXCLUDED"],
  ["search.title", "搜尋標題", "searchAndShare", "DERIVED", ["作品頁搜尋標題（尚未合併網站共用設定）"], ["SEARCH_SHARE"], false, "REQUIRED"],
  ["search.description", "搜尋摘要", "searchAndShare", "PRODUCT", ["作品頁搜尋摘要（共用設定合併前）"], ["SEARCH_SHARE"]],
  ["search.image", "分享圖片", "searchAndShare", "MEDIA", ["作品頁分享圖片"], ["SEARCH_SHARE"]],
  ["system.productId", "商品識別碼", "systemInfo", "SYSTEM", ["系統資訊"], ["SYSTEM_ONLY"], true, "EXCLUDED"],
  ["system.artworkSku", "作品識別碼", "systemInfo", "SYSTEM", ["系統資訊"], ["SYSTEM_ONLY"], true, "EXCLUDED"],
  ["system.slug", "作品網址識別", "systemInfo", "SYSTEM", ["系統資訊"], ["SYSTEM_ONLY"], true, "EXCLUDED"],
  ["system.contractVersion", "內容契約版本", "systemInfo", "SYSTEM", ["系統資訊"], ["SYSTEM_ONLY"], true, "EXCLUDED"],
  ["system.revision", "作品內容版本", "systemInfo", "SYSTEM", ["系統資訊"], ["SYSTEM_ONLY"], true, "EXCLUDED"],
];
// Verified current controls; Product authority alone does not imply an editor.
const currentProductEditors = new Set(["identity.name", "identity.nameEn", "identity.artist", "identity.tag", "facts.origin", "facts.process", "facts.roast", "facts.flavors", "facts.shortCopy", "facts.mood", "search.description"]);
function definition(row: Row): OwnerFieldDefinition {
  const [fieldId, label, section, ownership, displayLocations, impactScope, optional = true, completenessRole = "OPTIONAL"] = row;
  const kind: OwnerDestinationKind = ownership === "PRODUCT" ? currentProductEditors.has(fieldId) ? "PRODUCT_ADMIN" : "NO_CURRENT_EDITOR" : ownership === "COMMERCE" ? "COMMERCE_ADMIN"
    : ownership === "MEDIA" ? "MEDIA_ADMIN" : ownership === "SYSTEM" ? "SYSTEM_ONLY" : ownership === "WORKS" ? "WORKS_FUTURE" : "NO_CURRENT_EDITOR";
  return Object.freeze({ fieldId, label, section, ownership, displayLocations: Object.freeze([...displayLocations]),
    impactScope: Object.freeze([...impactScope]), optional, completenessRole, editDestination: OWNER_EDIT_DESTINATIONS[kind],
    editCapability: kind === "SYSTEM_ONLY" ? "SYSTEM_ONLY" : kind === "WORKS_FUTURE" ? "WRITE_NOT_CONNECTED" : kind === "NO_CURRENT_EDITOR" ? "UNAVAILABLE" : "EXTERNAL_EDITOR" });
}
export const WORKS_OWNER_FIELD_REGISTRY: Readonly<Record<string, OwnerFieldDefinition>> = Object.freeze(Object.fromEntries(rows.map(row => {
  const value = definition(row); return [value.fieldId, value];
})));
export const OWNER_BLOCKED_COPY_IDS = Object.freeze([4, 8, 16, 18, 20, 29] as const);
export function ownerFieldDefinition(id: string): OwnerFieldDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(WORKS_OWNER_FIELD_REGISTRY, id) ? WORKS_OWNER_FIELD_REGISTRY[id] : undefined;
}
