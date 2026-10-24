import { handleGiftCms } from "@/lib/giftCmsTransport";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return handleGiftCms(request, "landing"); }
export function PUT(request: Request) { return handleGiftCms(request, "landing"); }
