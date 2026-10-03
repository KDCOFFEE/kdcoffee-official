import { handleLineReplyAdmin } from "@/lib/lineAutoReplyAdmin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return handleLineReplyAdmin(request,"simulate"); }
