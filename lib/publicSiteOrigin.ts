const PUBLIC_SITE_ORIGIN = "https://www.kdcoffee1962.com";

function developmentPublicOrigin() {
  const value = process.env.DEV_PUBLIC_ORIGIN?.trim();
  // Validate the original text as well as URL components: URL normalizes dot
  // paths and empty query/fragment markers, which are not origin configuration.
  if (!value || !/^https?:\/\/[^\s/\\?#]+\/?$/i.test(value)) return null;
  const url = normalizedOrigin(value);
  return url && !url.hostname.includes("*") && url.pathname === "/" && !url.search && !url.hash ? url.origin : null;
}

/** Request validation is separate from redirects. A development tunnel is an
 * explicit server-side opt-in, never a Host/forwarded-header trust expansion.
 * Production (including a locally served production build) stays canonical.
 */
export function resolveAllowedRequestOrigins(request: Request): string[] {
  const railwayRuntime = Boolean(
    process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID || process.env.RAILWAY_ENVIRONMENT_ID,
  );
  if (process.env.NODE_ENV === "production" || railwayRuntime) return [PUBLIC_SITE_ORIGIN];

  const requestUrl = new URL(request.url);
  const origins = new Set<string>();
  if (isLocal(requestUrl)) {
    const local = new URL(localSiteOrigin(request, requestUrl));
    for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
      local.hostname = hostname;
      origins.add(local.origin);
    }
  } else {
    origins.add(PUBLIC_SITE_ORIGIN);
  }
  const configured = developmentPublicOrigin();
  if (configured) origins.add(configured);
  return [...origins];
}

function normalizedOrigin(value: string | undefined) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function isLocal(url: URL) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

function isPublicSite(url: URL) {
  return ["www.kdcoffee1962.com", "kdcoffee1962.com"].includes(url.hostname);
}

function isRailwayHost(url: URL) {
  return url.hostname.endsWith(".railway.app");
}

function localSiteOrigin(request: Request, requestUrl: URL) {
  const local = new URL(requestUrl.origin);
  // Next combines the proxy's HTTPS protocol with its internal localhost URL.
  // The development listener itself is HTTP, independently of tunnel TLS.
  if (process.env.NODE_ENV !== "production") local.protocol = "http:";
  const host = request.headers.get("host")?.trim();
  if (host && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host)) {
    const configured = normalizedOrigin(process.env.NEXT_PUBLIC_SITE_URL);
    const protocol = process.env.NODE_ENV === "production" && configured && isLocal(configured) && configured.port === requestUrl.port
      ? configured.protocol : local.protocol;
    try {
      const browserLocal = new URL(`${protocol}//${host}`);
      if (isLocal(browserLocal) && browserLocal.port === requestUrl.port) return browserLocal.origin;
    } catch { /* Invalid loopback Host keeps the local request origin. */ }
  }
  return local.origin;
}

function matchesDevelopmentPublicOrigin(request: Request, requestUrl: URL, configured: string) {
  if (requestUrl.origin === configured) return true;
  const source = normalizedOrigin(request.headers.get("origin") ?? undefined);
  if (source && !source.search && !source.hash && source.pathname === "/" && source.origin === configured) return true;
  const target = new URL(configured);
  // Proxy metadata can only select this explicitly configured destination.
  // It cannot supply another host, scheme or port for the redirect.
  return request.headers.get("x-forwarded-host")?.trim() === target.host &&
    request.headers.get("x-forwarded-proto")?.trim() === target.protocol.slice(0, -1);
}

/** Remote redirect origins come from deployment configuration, never arbitrary
 * Host, forwarded headers, query parameters or an OAuth return path. Development
 * proxy metadata may select only the exact configured DEV_PUBLIC_ORIGIN. */
export function resolvePublicSiteOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const railwayRuntime = Boolean(
    process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID || process.env.RAILWAY_ENVIRONMENT_ID,
  );

  if (railwayRuntime || isPublicSite(requestUrl) || isRailwayHost(requestUrl)) return PUBLIC_SITE_ORIGIN;
  if (process.env.NODE_ENV !== "production") {
    const configured = developmentPublicOrigin();
    if (configured && matchesDevelopmentPublicOrigin(request, requestUrl, configured)) return configured;
  }
  // Production builds are also served locally for isolated acceptance. Their
  // response cookies and redirects must stay on that local origin.
  if (isLocal(requestUrl)) {
    return localSiteOrigin(request, requestUrl);
  }

  for (const value of [process.env.NEXT_PUBLIC_SITE_URL, process.env.MEMBER_SITE_URL]) {
    const configured = normalizedOrigin(value);
    if (!configured) continue;
    if (isPublicSite(configured) || isRailwayHost(configured)) return PUBLIC_SITE_ORIGIN;
    if (configured.protocol === "https:" || isLocal(configured)) return configured.origin;
  }

  // Unknown request hosts and untrusted proxy headers cannot create an external
  // redirect. Non-local development domains must be configured explicitly.
  return PUBLIC_SITE_ORIGIN;
}
