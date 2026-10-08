import type { MediaAsset } from "./media";
import type { StoreCategory, StoreMediaReference, StoreProduct, StoreSection } from "./storeTypes";

export type StoreAdminKind = "sections" | "categories" | "products";
export type StoreAdminDraft = Partial<StoreSection & StoreCategory & StoreProduct>;

export function newStoreAdminDraft(kind: StoreAdminKind, sectionId = ""): StoreAdminDraft {
  const common = { name: "", slug: "", description: "", active: true, sortOrder: 0 };
  if (kind === "sections") return { ...common, shortDescription: "", published: false, showOnHomepage: false, homepageSortOrder: 0, showInNavigation: false, navigationSortOrder: 0, seoTitle: "", seoDescription: "" };
  if (kind === "categories") return { ...common, sectionId };
  return { ...common, sectionId, shortDescription: "", productType: "general", sku: "", price: 0, inventory: 0, pvValue: 0, gallery: [], specifications: [], published: false, featured: false, subscriptionEligible: false };
}
export function storeDraftPayload(kind: StoreAdminKind, draft: StoreAdminDraft) {
  const { id, revision, createdAt, updatedAt, archivedAt, subscriptionEligible, ...values } = draft;
  void id; void revision; void createdAt; void updatedAt; void archivedAt; void subscriptionEligible;
  if (kind === "products" && draft.id) {
    return { ...values, categoryId: draft.categoryId || null, salePrice: draft.salePrice ?? null, heroMedia: draft.heroMedia ?? null, kdRedemption: draft.kdRedemption ?? null };
  }
  return values;
}
export function changeStoreDraftSection(draft: StoreAdminDraft, sectionId: string, categories: StoreCategory[]) {
  const category = categories.find(item => item.id === draft.categoryId && item.sectionId === sectionId && item.archivedAt === null);
  const cleared = Boolean(draft.categoryId && !category);
  return { draft: { ...draft, sectionId, ...(cleared ? { categoryId: undefined } : {}) }, cleared };
}
export function selectedStoreMedia(media: MediaAsset, alt = ""): StoreMediaReference { return { ...media, alt }; }
export function moveStoreGallery(gallery: StoreMediaReference[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (index < 0 || target < 0 || index >= gallery.length || target >= gallery.length) return gallery;
  const result = [...gallery];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}
