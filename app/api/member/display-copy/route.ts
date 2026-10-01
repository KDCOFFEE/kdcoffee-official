import { NextResponse } from "next/server";
import { readMemberCenterCopy } from "@/lib/memberCenterCopyStore";

export const dynamic = "force-dynamic";
export async function GET() {
  // Public, non-personal presentation configuration only. Never member/domain data.
  const copy = await readMemberCenterCopy();
  return NextResponse.json(copy, { headers: { "Cache-Control": "no-store" } });
}
