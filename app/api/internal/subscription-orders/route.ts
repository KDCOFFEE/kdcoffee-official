import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { runSubscriptionOrderScheduler } from "@/lib/subscriptionOrderScheduler";

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
  try { return NextResponse.json(await runSubscriptionOrderScheduler()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "自動建單工作失敗" }, { status: 500 }); }
}
