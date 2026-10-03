import { NextRequest, NextResponse } from "next/server";

const RAILWAY_PRODUCTION_HOST =
  "kdcoffee-official-production.up.railway.app";

const PRODUCTION_CANONICAL_ORIGIN =
  "https://www.kdcoffee1962.com";

function requestHost(request: NextRequest) {
  const rawHost =
    request.headers
      .get("x-forwarded-host")
      ?.split(",")[0]
      ?.trim() ||
    request.headers.get("host")?.trim() ||
    "";

  return rawHost
    .toLowerCase()
    .replace(/:\d+$/, "");
}

export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  if (
    request.method !== "GET" &&
    request.method !== "HEAD"
  ) {
    return NextResponse.next();
  }

  if (
    requestHost(request) !==
    RAILWAY_PRODUCTION_HOST
  ) {
    return NextResponse.next();
  }

  const destination = new URL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    PRODUCTION_CANONICAL_ORIGIN,
  );

  return NextResponse.redirect(
    destination,
    308,
  );
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};