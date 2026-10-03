import { handleLineReplyAdmin } from "@/lib/lineAutoReplyAdmin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handleLineReplyAdmin(request,"get"); }
export async function PUT(request: Request) { return handleLineReplyAdmin(request,"save"); }
