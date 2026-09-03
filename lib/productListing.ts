export type ProductListingStatus = {
  inMonthlyMenu?: unknown;
  status?: unknown;
  showWhenSoldOut?: unknown;
};

export type WorksListableProduct = ProductListingStatus & {
  sort?: unknown;
};

export function isProductListedInWorks(product: ProductListingStatus | null | undefined) {
  if (!product || product.inMonthlyMenu !== true) return false;
  if (product.status === "hidden" || product.status === "discontinued") return false;
  return product.status !== "sold_out" || product.showWhenSoldOut !== false;
}

export function resolveWorksProductListing<T extends WorksListableProduct>(products: readonly T[]) {
  return products
    .filter(isProductListedInWorks)
    .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0));
}
