import { NextResponse } from "next/server";
import {
  adminCookieName,
  createAdminSessionValue,
  isAdminPasswordConfigured,
  verifyAdminPassword,
} from "@/lib/adminAuth";
import { resolvePublicSiteOrigin } from "@/lib/publicSiteOrigin";

export async function POST(request: Request) {
  const form = await request.formData();
  const password = String(form.get("password") || "");
  const siteUrl = resolvePublicSiteOrigin(request);

  if (!isAdminPasswordConfigured()) {
    return NextResponse.redirect(
      `${siteUrl}/admin/login?error=not_configured`,
      303,
    );
  }

  if (!verifyAdminPassword(password)) {
    return NextResponse.redirect(
      `${siteUrl}/admin/login?error=invalid`,
      303,
    );
  }

  const response = NextResponse.redirect(`${siteUrl}/admin`, 303);

  response.cookies.set(adminCookieName, createAdminSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: siteUrl.startsWith("https://"),
    path: "/",
    maxAge: 12 * 60 * 60,
  });

  return response;
}
