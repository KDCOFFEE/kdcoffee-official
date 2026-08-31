import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { getAdminReferralOverview } from "@/lib/membershipCommerce";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  return NextResponse.json(await getAdminReferralOverview({ query: params.get("q") ?? undefined, from: params.get("from") ?? undefined, to: params.get("to") ?? undefined }));
}
