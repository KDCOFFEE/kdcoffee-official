import { NextResponse } from "next/server";
import { adminCookieName, createAdminSessionValue } from "@/lib/adminAuth";

export async function POST(request: Request) {
  const form = await request.formData();
  const password = String(form.get("password") || "");
  const expected = (process.env.ADMIN_PASSWORD || "").trim();
  if (!expected) return NextResponse.redirect(new URL("/admin/login?error=not_configured", request.url), 303);
  if (password !== expected) return NextResponse.redirect(new URL("/admin/login?error=invalid", request.url), 303);
  const response = NextResponse.redirect(new URL("/admin", request.url), 303);
  response.cookies.set(adminCookieName, createAdminSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return response;
}
