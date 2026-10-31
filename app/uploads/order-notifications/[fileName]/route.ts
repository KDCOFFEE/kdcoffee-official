import { promises as fs } from "fs";
import path from "path";

import {readAdminSession} from "@/lib/adminAuth";
import {getCurrentMember} from "@/lib/memberAuth";
import {returnPhotoOrderNumbers,memberOwnsReturnPhoto} from "@/lib/returnPhotoAccess";

import { getOrderNotificationUploadsDir } from "@/lib/storagePaths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileName: string }> },
) {
  const { fileName } = await params;
  const match = fileName.match(/^[0-9a-f-]{36}(?:-line(?:-preview)?)?\.(webp|jpg)$/i);
  if (!match || fileName !== path.basename(fileName)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const bindings=await returnPhotoOrderNumbers("/uploads/order-notifications/"+fileName);
    if(bindings && !(await readAdminSession())) {
      const member=await getCurrentMember();
      if(!member || !(await memberOwnsReturnPhoto(bindings,member.id)))return new Response("Not found",{status:404,headers:{"Cache-Control":"private, no-store"}});
    }
    const file = await fs.readFile(path.join(getOrderNotificationUploadsDir(), fileName));
    return new Response(file, {
      headers: {
        "Content-Type": match[1].toLowerCase() === "jpg" ? "image/jpeg" : "image/webp",
        "Cache-Control": bindings ? "private, no-store" : "public, max-age=86400, immutable",
        ...(bindings ? { Vary: "Cookie" } : {}),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
