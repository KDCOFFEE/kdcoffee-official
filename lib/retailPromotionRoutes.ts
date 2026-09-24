const PRIVATE_PREFIXES = [
  "/admin",
  "/api",
  "/checkout",
  "/member",
  "/member-backup",
  "/order-complete",
  "/orders",
  "/uploads",
] as const;

const PUBLIC_PREFIXES = ["/works", "/monthly-menu", "/pages"] as const;

export function isRetailPromotionShareablePath(pathname: string) {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (normalized === "/") return true;
  if (PRIVATE_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) return false;
  return PUBLIC_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

export function retailPromotionShareUrl(currentUrl: string, referralCode: string) {
  const url = new URL(currentUrl);
  if (!isRetailPromotionShareablePath(url.pathname)) throw new Error("此頁面不提供推廣分享");
  url.searchParams.set("ref", referralCode);
  return url.toString();
}
