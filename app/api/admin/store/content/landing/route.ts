import { handleGiftCms } from "@/lib/giftCmsTransport";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){return handleGiftCms(request,"storeLanding");}
export async function PUT(request:Request){return handleGiftCms(request,"storeLanding");}
