import { NextResponse } from "next/server";
import { adminCookieName } from "@/lib/adminAuth";

export async function POST(request: Request) {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ||
    new URL(request.url).origin;

  const response = NextResponse.redirect(`${siteUrl}/admin/login`, 303);

  response.cookies.set(adminCookieName, "", {
    path: "/",
    maxAge: 0,
  });

  return response;
}