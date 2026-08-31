import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { runReferralRewardReleaseScheduler } from "@/lib/membershipCommerce";

export const dynamic = "force-dynamic";
function validSecret(request: Request) {
  const expected = process.env.SUBSCRIPTION_SCHEDULER_SECRET?.trim();
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || !provided) return false;
  const left = Buffer.from(expected); const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}
export async function POST(request: Request) {
  if (!validSecret(request) && !(await isAdminAuthenticated())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  return NextResponse.json({ results: await runReferralRewardReleaseScheduler() });
}
