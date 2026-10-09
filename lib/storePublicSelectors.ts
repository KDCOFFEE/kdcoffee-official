import type { StoreCatalog, StoreCategory, StoreMediaReference, StoreProduct, StoreSection } from "./storeTypes";

export type PublicStoreSection = Pick<StoreSection, "slug" | "name" | "shortDescription" | "description">;
export type PublicStoreCategory = Pick<StoreCategory, "slug" | "name" | "description"> & { sectionSlug: string };
export type PublicStoreProductCard = {
  slug: string;
  name: string;
  shortDescription: string;
  price: number;
  salePrice?: number;
  inStock: boolean;
  featured: boolean;
  heroMedia?: StoreMediaReference;
  section: { slug: string; name: string };
  category?: { slug: string; name: string };
};
export type PublicStoreProductDetail = PublicStoreProductCard & {
  description: string;
  gallery: StoreMediaReference[];
  specifications: { label: string; value: string }[];
};
export type PublicStoreFilterStatus = "valid" | "unknown-section" | "category-requires-section" | "unknown-category";
export type PublicStoreIndexOptions = {
  /** Already-decoded slugs. URL parsing belongs to the future route. */
  sectionSlug?: string;
  categorySlug?: string;
  page?: number;
  pageSize?: number;
};
export type PublicStorePage<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};
export type PublicStoreIndex = {
  sections: PublicStoreSection[];
  categories: PublicStoreCategory[];
  selectedSection: PublicStoreSection | null;
  selectedCategory: PublicStoreCategory | null;
  filterStatus: PublicStoreFilterStatus;
  products: PublicStorePage<PublicStoreProductCard>;
};

function ownerOrder(a: { sortOrder: number; slug: string }, b: { sortOrder: number; slug: string }) {
  return a.sortOrder - b.sortOrder || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
}

/** IDs stay inside this selection graph; every exported result is a whitelist DTO. */
function publicGraph(catalog: StoreCatalog) {
  const sections = catalog.sections
    .filter(section => section.active === true && section.published === true && section.archivedAt === null)
    .sort(ownerOrder);
  const sectionById = new Map(sections.map(section => [section.id, section]));
  const categories = catalog.categories
    .filter(category => category.active === true && category.archivedAt === null && sectionById.has(category.sectionId))
    .sort(ownerOrder);
  const categoryById = new Map(categories.map(category => [category.id, category]));
  const products = catalog.products.filter(product => {
    if (product.active !== true || product.published !== true || product.archivedAt !== null || !sectionById.has(product.sectionId)) return false;
    if (product.categoryId !== undefined) {
      const category = categoryById.get(product.categoryId);
      if (!category || category.sectionId !== product.sectionId) return false;
    }
    return true;
  }).sort(ownerOrder);
  return { sections, sectionById, categories, categoryById, products };
}

function sectionDto(section: StoreSection): PublicStoreSection {
  return { slug: section.slug, name: section.name, shortDescription: section.shortDescription, description: section.description };
}
function categoryDto(category: StoreCategory, section: StoreSection): PublicStoreCategory {
  return { slug: category.slug, name: category.name, description: category.description, sectionSlug: section.slug };
}
function mediaDto(media: StoreMediaReference): StoreMediaReference {
  // Copy only the established media shape, never arbitrary persistence fields.
  return {
    type: media.type, url: media.url, alt: media.alt,
    ...(media.provider !== undefined ? { provider: media.provider } : {}),
    ...(media.publicId !== undefined ? { publicId: media.publicId } : {}),
    ...(media.videoId !== undefined ? { videoId: media.videoId } : {}),
    ...(media.posterUrl !== undefined ? { posterUrl: media.posterUrl } : {}),
    ...(media.width !== undefined ? { width: media.width } : {}),
    ...(media.height !== undefined ? { height: media.height } : {}),
    ...(media.duration !== undefined ? { duration: media.duration } : {}),
    ...(media.format !== undefined ? { format: media.format } : {}),
    ...(media.bytes !== undefined ? { bytes: media.bytes } : {}),
  };
}
function cardDto(product: StoreProduct, graph: ReturnType<typeof publicGraph>): PublicStoreProductCard {
  const section = graph.sectionById.get(product.sectionId)!;
  const category = product.categoryId === undefined ? undefined : graph.categoryById.get(product.categoryId);
  return {
    slug: product.slug, name: product.name, shortDescription: product.shortDescription,
    price: product.price,
    ...(product.salePrice !== undefined ? { salePrice: product.salePrice } : {}),
    inStock: product.inventory > 0, featured: product.featured,
    ...(product.heroMedia !== undefined ? { heroMedia: mediaDto(product.heroMedia) } : {}),
    section: { slug: section.slug, name: section.name },
    ...(category ? { category: { slug: category.slug, name: category.name } } : {}),
  };
}

/** Invalid numbers use defaults; oversized pages clamp to the last available page. */
export function paginatePublicStoreProducts<T>(items: readonly T[], page = 1, pageSize = 24): PublicStorePage<T> {
  const size = Number.isSafeInteger(pageSize) && pageSize >= 1 ? Math.min(pageSize, 24) : 24;
  const requestedPage = Number.isSafeInteger(page) && page >= 1 ? page : 1;
  const totalPages = Math.ceil(items.length / size);
  const normalizedPage = Math.min(requestedPage, Math.max(totalPages, 1));
  return {
    items: items.slice((normalizedPage - 1) * size, normalizedPage * size),
    page: normalizedPage, pageSize: size, totalItems: items.length, totalPages,
  };
}

export function selectPublicStoreIndex(catalog: StoreCatalog, options: PublicStoreIndexOptions = {}): PublicStoreIndex {
  const graph = publicGraph(catalog);
  const section = options.sectionSlug === undefined ? null : graph.sections.find(item => item.slug === options.sectionSlug) ?? null;
  let category: StoreCategory | null = null;
  let filterStatus: PublicStoreFilterStatus = "valid";
  if (options.sectionSlug !== undefined && !section) filterStatus = "unknown-section";
  else if (options.categorySlug !== undefined) {
    if (!section) filterStatus = "category-requires-section";
    else {
      category = graph.categories.find(item => item.sectionId === section.id && item.slug === options.categorySlug) ?? null;
      if (!category) filterStatus = "unknown-category";
    }
  }
  const categories = filterStatus === "unknown-section" || filterStatus === "category-requires-section"
    ? [] : graph.categories.filter(item => !section || item.sectionId === section.id);
  const products = filterStatus !== "valid" ? [] : graph.products.filter(item =>
    (!section || item.sectionId === section.id) && (!category || item.categoryId === category.id));
  return {
    sections: graph.sections.map(sectionDto),
    categories: categories.map(item => categoryDto(item, graph.sectionById.get(item.sectionId)!)),
    selectedSection: section ? sectionDto(section) : null,
    selectedCategory: category ? categoryDto(category, section!) : null,
    filterStatus,
    products: paginatePublicStoreProducts(products.map(item => cardDto(item, graph)), options.page, options.pageSize),
  };
}

export function findPublicStoreProductBySlug(catalog: StoreCatalog, slug: string): PublicStoreProductDetail | null {
  const graph = publicGraph(catalog);
  const product = graph.products.find(item => item.slug === slug);
  if (!product) return null;
  return {
    ...cardDto(product, graph), description: product.description,
    gallery: product.gallery.map(mediaDto),
    // ECMAScript stable sort preserves the stored order when sortOrder ties.
    specifications: [...product.specifications].sort((a, b) => a.sortOrder - b.sortOrder)
      .map(spec => ({ label: spec.label, value: spec.value })),
  };
}