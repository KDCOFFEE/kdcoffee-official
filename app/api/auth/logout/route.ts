import { NextResponse } from "next/server";
import { clearMemberSession } from "@/lib/memberAuth";

export async function POST(request: Request) {
  await clearMemberSession();

  return NextResponse.redirect(new URL("/", request.url), 303);
}
