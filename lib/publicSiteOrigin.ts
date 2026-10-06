const PUBLIC_SITE_ORIGIN = "https://www.kdcoffee1962.com";

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

/** Remote redirect origins come from deployment configuration, never arbitrary
 * Host, forwarded headers, query parameters or an OAuth return path. */
export function resolvePublicSiteOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const railwayRuntime = Boolean(
    process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID || process.env.RAILWAY_ENVIRONMENT_ID,
  );

  if (railwayRuntime || isPublicSite(requestUrl) || isRailwayHost(requestUrl)) return PUBLIC_SITE_ORIGIN;
  // Production builds are also served locally for isolated acceptance. Their
  // response cookies and redirects must stay on that local origin.
  if (isLocal(requestUrl)) {
    const host = request.headers.get("host")?.trim();
    // Next may normalize 127.0.0.1 to localhost internally. Accept only a
    // loopback Host on the same port, so host-only development cookies stay on
    // the browser's actual loopback origin. No remote/proxy host is trusted.
    if (host && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host)) {
      const configured = normalizedOrigin(process.env.NEXT_PUBLIC_SITE_URL);
      const protocol = configured && isLocal(configured) && configured.port === requestUrl.port
        ? configured.protocol : requestUrl.protocol;
      try {
        const local = new URL(`${protocol}//${host}`);
        if (isLocal(local) && local.port === requestUrl.port) return local.origin;
      } catch { /* Invalid local Host falls back to the local request origin. */ }
    }
    return requestUrl.origin;
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
