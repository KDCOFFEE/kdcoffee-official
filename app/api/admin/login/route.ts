import { NextResponse } from "next/server";
import { adminCookieName, createAdminSessionValue } from "@/lib/adminAuth";

function getSiteUrl(request: Request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ||
    new URL(request.url).origin
  );
}

export async function POST(request: Request) {
  const form = await request.formData();
  const password = String(form.get("password") || "");
  const expected = (process.env.ADMIN_PASSWORD || "").trim();
  const siteUrl = getSiteUrl(request);

  if (!expected) {
    return NextResponse.redirect(
      `${siteUrl}/admin/login?error=not_configured`,
      303,
    );
  }

  if (password !== expected) {
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
