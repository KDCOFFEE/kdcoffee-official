import { handleCustomerLineWebhook } from "@/lib/lineAutoReplyWebhook";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return handleCustomerLineWebhook(request); }
