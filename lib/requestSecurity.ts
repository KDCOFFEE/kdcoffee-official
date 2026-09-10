export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  const requestUrl = new URL(request.url);
  if (originUrl.origin === requestUrl.origin) return true;

  // Reverse proxies expose the public browser origin through forwarded headers
  // while Next.js may see an internal request URL.
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  if (!host) return false;

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || requestUrl.protocol.replace(":", "");
  if (protocol !== "http" && protocol !== "https") return false;

  return originUrl.origin === `${protocol}://${host}`;
}
