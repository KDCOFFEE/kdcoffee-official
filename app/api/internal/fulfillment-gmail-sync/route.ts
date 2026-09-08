import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { syncSevenElevenGmail } from "@/lib/gmailFulfillmentAutomation";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.FULFILLMENT_CRON_SECRET?.trim();
  if (!expected) return false;

  const authorization = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!authorization.startsWith(prefix)) return false;

  const provided = authorization.slice(prefix.length).trim();
  if (!provided) return false;

  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!process.env.FULFILLMENT_CRON_SECRET?.trim()) {
    return NextResponse.json(
      { error: "FULFILLMENT_CRON_SECRET 尚未設定" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!authorized(request)) {
    return NextResponse.json(
      { error: "未授權" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await syncSevenElevenGmail({ maxMessages: 100 });
    return NextResponse.json(
      { ok: true, source: "railway_cron", ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "7-ELEVEN Gmail 背景同步失敗" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
