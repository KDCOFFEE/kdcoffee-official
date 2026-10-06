import { NextResponse } from "next/server";
import { adminCookieName } from "@/lib/adminAuth";
import { resolvePublicSiteOrigin } from "@/lib/publicSiteOrigin";

export async function POST(request: Request) {
  const siteUrl = resolvePublicSiteOrigin(request);

  const response = NextResponse.redirect(`${siteUrl}/admin/login`, 303);

  response.cookies.set(adminCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: siteUrl.startsWith("https://"),
    path: "/",
    maxAge: 0,
  });

  return response;
}
