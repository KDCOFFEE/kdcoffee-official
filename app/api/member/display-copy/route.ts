import { readPointDisplayName } from "@/lib/pointDisplayNameStore";
import { NextResponse } from "next/server";
import { readMemberCenterCopy } from "@/lib/memberCenterCopyStore";

export const dynamic = "force-dynamic";
export async function GET() {
  // Public, non-personal presentation configuration only. Never member/domain data.
  const [copy, pointDisplayName] = await Promise.all([readMemberCenterCopy(), readPointDisplayName()]);
  return NextResponse.json({ ...copy, pointDisplayName }, { headers: { "Cache-Control": "no-store" } });
}
