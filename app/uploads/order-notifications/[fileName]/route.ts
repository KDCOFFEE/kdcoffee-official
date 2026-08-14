import { promises as fs } from "fs";
import path from "path";

import { getOrderNotificationUploadsDir } from "@/lib/storagePaths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileName: string }> },
) {
  const { fileName } = await params;
  if (!/^[0-9a-f-]{36}\.webp$/i.test(fileName) || fileName !== path.basename(fileName)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const file = await fs.readFile(path.join(getOrderNotificationUploadsDir(), fileName));
    return new Response(file, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

