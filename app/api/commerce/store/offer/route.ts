import { isCartRecord } from "../../../../../lib/commerceCart";
import { isStoreProductSlug } from "../../../../../lib/storePublicMetadata";
import { isStoreCommerceEnabled } from "../../../../../lib/storeCommerceCapability";
import { resolveStoreCommerceOffer, StoreCommerceOfferError } from "../../../../../lib/storeCommerceOffer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 2 * 1024;
class InvalidStoreOfferRequest extends Error {}
async function boundedJson(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? "")) throw new InvalidStoreOfferRequest();
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > MAX_BODY_BYTES)) throw new InvalidStoreOfferRequest();
  if (!request.body) throw new InvalidStoreOfferRequest();
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new InvalidStoreOfferRequest(); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } catch { throw new InvalidStoreOfferRequest(); }
  finally { reader.releaseLock(); }
}
function error(code: string, status: number): Response {
  return Response.json({ code }, { status, headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request): Promise<Response> {
  // Independently enforce capability before parsing or reading a catalog.
  if (!isStoreCommerceEnabled()) return error("STORE_COMMERCE_DISABLED", 403);
  let slug: string;
  try {
    const value = await boundedJson(request);
    if (!isCartRecord(value) || Object.keys(value).length !== 1 || !isStoreProductSlug(value.slug)) throw new InvalidStoreOfferRequest();
    slug = value.slug;
  } catch { return error("INVALID_REQUEST", 400); }
  try {
    return Response.json(await resolveStoreCommerceOffer(slug), { headers: { "Cache-Control": "no-store" } });
  } catch (failure) {
    if (failure instanceof StoreCommerceOfferError) {
      const status = failure.code === "STORE_COMMERCE_DISABLED" ? 403
        : failure.code === "STORE_PRODUCT_NOT_FOUND" ? 404 : 409;
      return error(failure.code, status);
    }
    return error("STORE_COMMERCE_RESOLUTION_FAILED", 500);
  }
}
