import { readLiveMerchantProductFeed } from "@/lib/googleMerchantProductFeedSource";
import { getCanonicalPublicSiteOrigin } from "@/lib/publicSiteOrigin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex",
};
const unavailable = () => new Response("Merchant feed unavailable\n", {
  status: 503, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
});

export async function GET(request: Request): Promise<Response> {
  if (process.env.GOOGLE_MERCHANT_PRODUCT_FEED_ENABLED !== "true") return unavailable();
  const url = new URL(request.url);
  const official = new URL(getCanonicalPublicSiteOrigin());
  const host = request.headers.get("host");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const railway = process.env.RAILWAY_SERVICE_ID && process.env.RAILWAY_ENVIRONMENT_ID;
  // Next can build Request.url from the local listener behind Railway's HTTPS ingress.
  const officialIngress = railway && ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(url.hostname) &&
    host === official.host && request.headers.get("x-forwarded-proto") === "https";
  if (url.protocol !== "https:" || url.username || url.password ||
      (url.origin !== official.origin && !officialIngress) ||
      (host !== null && host !== official.host) || (forwardedHost !== null && forwardedHost !== official.host) ||
      url.pathname !== "/google/merchant/products.tsv" || url.search || url.hash) return unavailable();
  try {
    const { tsv } = await readLiveMerchantProductFeed();
    return new Response(tsv, { headers: { ...headers, "Content-Type": "text/tab-separated-values; charset=utf-8" } });
  } catch {
    console.warn("[merchant-product-feed] snapshot unavailable");
    return unavailable();
  }
}
