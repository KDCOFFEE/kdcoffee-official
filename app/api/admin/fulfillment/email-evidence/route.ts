import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { FulfillmentError, processSevenElevenEmail } from "@/lib/fulfillment";

export const dynamic = "force-dynamic";

/** Safe adapter boundary for a future OAuth-backed Gmail reader. */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  try {
    const body = await request.json();
    const result = await processSevenElevenEmail({
      from: String(body.from || ""),
      subject: String(body.subject || ""),
      text: String(body.text || ""),
      messageId: typeof body.messageId === "string" ? body.messageId : undefined,
      receivedAt: typeof body.receivedAt === "string" ? body.receivedAt : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "物流通知處理失敗" }, { status: error instanceof FulfillmentError ? error.status : 500 });
  }
}
