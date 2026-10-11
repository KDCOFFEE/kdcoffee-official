import { MAX_CART_ITEMS, isCartRecord } from "../../../../../lib/commerceCart";
import { isLegacyCartStorageKey } from "../../../../../lib/commerceCartStorage";
import { readCanonicalCoffeeCartProducts, resolveLegacyCoffeeCart } from "../../../../../lib/commerceCartResolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 64 * 1024;
class InvalidCartRequest extends Error {}
async function boundedJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) throw new InvalidCartRequest();
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > MAX_BODY_BYTES)) throw new InvalidCartRequest();
  if (!request.body) throw new InvalidCartRequest();
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new InvalidCartRequest(); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch { throw new InvalidCartRequest(); }
  finally { reader.releaseLock(); }
}
/** Public legacy-coffee resolution only. No Store capability or live cart wiring. */
export async function POST(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  let value: unknown;
  try {
    value = await boundedJson(request);
    if (!isCartRecord(value) || Object.keys(value).some(key => !["sourceKey", "items"].includes(key))
      || !isLegacyCartStorageKey(value.sourceKey) || !Array.isArray(value.items)
      || value.items.length > MAX_CART_ITEMS || !value.items.every(isCartRecord)) throw new InvalidCartRequest();
  } catch {
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
  }
  try {
    // The request was checked above; no item fields become source authority.
    const payload = value as { sourceKey: string; items: Record<string, unknown>[] };
    const resolved = resolveLegacyCoffeeCart(payload.items, await readCanonicalCoffeeCartProducts());
    return Response.json({ version: 16, sourceKey: payload.sourceKey, ...resolved }, { headers });
  } catch {
    return Response.json({ error: "RESOLUTION_FAILED" }, { status: 500, headers });
  }
}
