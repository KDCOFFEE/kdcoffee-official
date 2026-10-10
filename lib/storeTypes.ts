import type { MediaAsset } from "./media";
import type { HeroTiming } from "./homepageCms";
import type { VisualColorValue } from "./pageBuilderVisualStyle";

export type StoreEntity = {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type StoreSection = StoreEntity & {
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  active: boolean;
  published: boolean;
  sortOrder: number;
  showOnHomepage: boolean;
  homepageSortOrder: number;
  showInNavigation: boolean;
  navigationSortOrder: number;
  seoTitle: string;
  seoDescription: string;
};

export type StoreCategory = StoreEntity & {
  sectionId: string;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  active: boolean;
};

/** Existing media shape, with Store-owned accessibility text and strict validation. */
export type StoreMediaReference = MediaAsset & { alt: string };

export type StoreSpecification = {
  key: string;
  label: string;
  value: string;
  sortOrder: number;
};

/** Eligibility metadata only; no wallet calculations or earning policy. */
export type StoreKdRedemption = {
  mode: "inherit" | "enabled" | "disabled";
  maxDiscountPercent?: number;
};

export type StoreProduct = StoreEntity & {
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  sectionId: string;
  categoryId?: string;
  productType: "general" | "equipment" | "food" | "gift";
  sku: string;
  price: number;
  salePrice?: number;
  inventory: number;
  active: boolean;
  published: boolean;
  sortOrder: number;
  featured: boolean;
  heroMedia?: StoreMediaReference;
  gallery: StoreMediaReference[];
  specifications: StoreSpecification[];
  /** Optional manual SEO only; automatic preview fallbacks are never persisted. */
  seoTitle?: string;
  seoDescription?: string;
  /** Required, independently persisted finite non-negative number; decimals and 0 allowed. */
  pvValue: number;
  kdRedemption?: StoreKdRedemption;
  subscriptionEligible: false;
};

export type StoreHeroTiming = Pick<HeroTiming, "mediaDuration" | "headlineLine1Start" | "leadStart">;

/** Optional Store landing content; legacy catalogs need no migration. */
export type StoreHeroSettings = {
  title?: string;
  subtitle?: string;
  backgroundImage?: StoreMediaReference;
  mobileBackgroundImage?: StoreMediaReference;
  titleFontSize?: number;
  titleColor?: VisualColorValue;
  subtitleFontSize?: number;
  subtitleColor?: VisualColorValue;
  motionEnabled?: boolean;
  timing?: Partial<StoreHeroTiming>;
};
export type StoreHeroPatch = {
  title?: string | null;
  subtitle?: string | null;
  backgroundImage?: StoreMediaReference | null;
  mobileBackgroundImage?: StoreMediaReference | null;
  titleFontSize?: number | null;
  titleColor?: VisualColorValue | null;
  subtitleFontSize?: number | null;
  subtitleColor?: VisualColorValue | null;
  motionEnabled?: boolean | null;
  timing?: Partial<StoreHeroTiming> | null;
};

export type StoreCatalog = {
  schemaVersion: 1;
  settings?: { hero?: StoreHeroSettings };
  revision: number;
  updatedAt: string | null;
  sections: StoreSection[];
  categories: StoreCategory[];
  products: StoreProduct[];
};

type EntityFields = keyof StoreEntity;
type SectionFields = Omit<StoreSection, EntityFields>;
type CategoryFields = Omit<StoreCategory, EntityFields>;
type ProductFields = Omit<StoreProduct, EntityFields>;

export type StoreSectionCreate = Pick<StoreSection, "id" | "name" | "slug"> & Partial<SectionFields>;
export type StoreCategoryCreate = Pick<StoreCategory, "id" | "sectionId" | "name" | "slug"> & Partial<CategoryFields>;
export type StoreProductCreate = Pick<StoreProduct, "id" | "sectionId" | "slug" | "name" | "sku" | "price" | "inventory" | "pvValue"> & Partial<ProductFields>;
export type StoreSectionPatch = Partial<SectionFields>;
export type StoreCategoryPatch = Partial<CategoryFields>;
/** null explicitly clears optional fields; omission always preserves the current value. */
export type StoreProductPatch = Partial<Omit<ProductFields, "subscriptionEligible" | "categoryId" | "salePrice" | "heroMedia" | "kdRedemption">> & {
  categoryId?: string | null;
  salePrice?: number | null;
  heroMedia?: StoreMediaReference | null;
  kdRedemption?: StoreKdRedemption | null;
};
