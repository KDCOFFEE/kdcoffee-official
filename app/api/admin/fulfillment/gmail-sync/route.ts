import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { gmailFulfillmentConnectionReadiness, syncSevenElevenGmail } from "@/lib/gmailFulfillmentAutomation";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  return NextResponse.json(gmailFulfillmentConnectionReadiness());
}

export async function POST() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  try {
    return NextResponse.json(await syncSevenElevenGmail());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gmail 同步失敗" }, { status: 502 });
  }
}
