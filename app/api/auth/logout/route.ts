import { NextResponse } from "next/server";
import { clearMemberSession } from "@/lib/memberAuth";
import { resolvePublicSiteOrigin } from "@/lib/publicSiteOrigin";

export async function POST(request: Request) {
  await clearMemberSession();

  return NextResponse.redirect(
    new URL("/", resolvePublicSiteOrigin(request)),
    303,
  );
}
