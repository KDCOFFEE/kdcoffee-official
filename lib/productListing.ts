export type ProductListingStatus = {
  inMonthlyMenu?: unknown;
  status?: unknown;
  showWhenSoldOut?: unknown;
};

export function isProductListedInWorks(product: ProductListingStatus | null | undefined) {
  if (!product || product.inMonthlyMenu !== true) return false;
  if (product.status === "hidden" || product.status === "discontinued") return false;
  return product.status !== "sold_out" || product.showWhenSoldOut !== false;
}
