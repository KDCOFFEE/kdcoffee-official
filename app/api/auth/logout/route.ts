import { NextResponse } from "next/server";
import { clearMemberSession } from "@/lib/memberAuth";

export async function POST(request: Request) {
  await clearMemberSession();

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ||
    new URL(request.url).origin;

  return NextResponse.redirect(`${siteUrl}/`, 303);
}