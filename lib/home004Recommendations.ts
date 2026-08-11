export type Home004Product = {
  slug?: unknown;
  name?: unknown;
  active?: unknown;
  status?: unknown;
  purchasable?: unknown;
  inMonthlyMenu?: unknown;
  skus?: unknown;
};

type Home004Sku = {
  enabled?: unknown;
  stock?: unknown;
};

export type Home004Resolution<T> = {
  recommendations: T[];
  errors: string[];
  valid: boolean;
};

export function hasAvailableHome004Sku(product: Home004Product) {
  if (!Array.isArray(product.skus)) return false;
  return product.skus.some((sku: Home004Sku) =>
    sku.enabled === true && Number.isInteger(sku.stock) && Number(sku.stock) > 0,
  );
}

export function home004IneligibilityReasons(product: Home004Product) {
  const reasons: string[] = [];
  if (product.active !== true) reasons.push("商品未啟用");
  if (product.status !== "active") reasons.push("商品狀態不是 active");
  if (product.purchasable !== true) reasons.push("商品不可購買");
  if (product.inMonthlyMenu !== true) reasons.push("不在本月豆單");
  return reasons;
}

export function isHome004Eligible(product: Home004Product) {
  return home004IneligibilityReasons(product).length === 0;
}

export function resolveHome004Recommendations<T extends Home004Product>(
  productSlugs: unknown,
  products: T[],
): Home004Resolution<T> {
  const errors: string[] = [];
  const recommendations: T[] = [];
  const slugs = Array.isArray(productSlugs) ? productSlugs : [];
  const productsBySlug = new Map(
    products
      .filter((product) => typeof product.slug === "string" && product.slug.trim())
      .map((product) => [(product.slug as string).trim(), product] as const),
  );
  const seen = new Set<string>();

  if (slugs.length !== 3) errors.push("HOME004 必須選擇正好三款推薦商品。");

  slugs.slice(0, 3).forEach((rawSlug, index) => {
    const slug = typeof rawSlug === "string" ? rawSlug.trim() : "";
    if (!slug) {
      errors.push(`HOME004 推薦作品 ${index + 1} 不可空白。`);
      return;
    }
    if (seen.has(slug)) {
      errors.push(`HOME004 推薦商品不可重複：${slug}。`);
      return;
    }
    seen.add(slug);

    const product = productsBySlug.get(slug);
    if (!product) {
      errors.push(`HOME004 找不到商品：${slug}。`);
      return;
    }
    const reasons = home004IneligibilityReasons(product);
    if (reasons.length) {
      const name = typeof product.name === "string" && product.name.trim() ? product.name.trim() : slug;
      errors.push(`「${name}」目前不符合 HOME004 推薦資格：${reasons.join("、")}。`);
      return;
    }
    recommendations.push(product);
  });

  return { recommendations, errors, valid: errors.length === 0 };
}
