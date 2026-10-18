import { handleSupportAdmin } from "@/lib/lineSupportAdmin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return handleSupportAdmin(request,"simulate"); }
