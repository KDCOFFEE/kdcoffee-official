import { handleSupportAdmin } from "@/lib/lineSupportAdmin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handleSupportAdmin(request,"get"); }
export async function PUT(request: Request) { return handleSupportAdmin(request,"save"); }
