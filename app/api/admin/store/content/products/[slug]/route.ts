import { handleGiftCms } from "@/lib/giftCmsTransport";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{slug:string}>};
export async function GET(request:Request,{params}:Context){return handleGiftCms(request,"storeProduct",(await params).slug);}
export async function PUT(request:Request,{params}:Context){return handleGiftCms(request,"storeProduct",(await params).slug);}
